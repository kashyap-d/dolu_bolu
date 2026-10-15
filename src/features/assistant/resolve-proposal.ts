import {
  persistedJobDriveProgressPayloadSchema,
  type ActionProposalDraft,
  type PersistedJobDriveProgressPayload,
} from "@/features/assistant/contracts";
import {
  validateProposalEvidence,
  validateProposalForConfirmation,
  type ProposalIssue,
} from "@/features/assistant/validate-proposal";
import { MAX_INTERVIEW_ROUNDS, type JobDrive } from "@/features/job-drives/contracts";
import { matchingJobDrives } from "@/features/job-drives/matching";
import { normalizeCompanyName, normalizeRoleTitle } from "@/features/job-drives/normalize";
import { mergeAssessmentDetails } from "@/features/job-drives/merge-details";
import { editableRounds, mergeProposedRound } from "@/features/job-drives/rounds";
import { inferredStage } from "@/features/job-drives/stage-rules";

export type ResolvedProposal =
  | { ok: true; payload: PersistedJobDriveProgressPayload }
  | { ok: false; issues: ProposalIssue[] };

const explicitCorrection = /\b(?:correction|correct|mistake|wrong|reopen)\b/i;


function issue(fieldPath: string, message: string): ResolvedProposal {
  return { ok: false, issues: [{ fieldPath, message }] };
}

/**
 * Turns an untrusted provider draft into the exact change trusted code will
 * store for review: it resolves the target drive from the user's own records,
 * merges omitted details, and never lets the model regress a stage unless the
 * user explicitly asked for a correction.
 */
export function resolveProposal(
  sourceMessage: string,
  proposal: ActionProposalDraft,
  drives: readonly JobDrive[],
): ResolvedProposal {
  const issues = [
    ...validateProposalEvidence(sourceMessage, proposal),
    ...validateProposalForConfirmation(proposal),
  ];
  if (proposal.payload.isCorrection && !explicitCorrection.test(sourceMessage)) {
    issues.push({
      fieldPath: "isCorrection",
      message: "An audited correction must be explicit in your message.",
    });
  }
  if (issues.length) return { ok: false, issues };

  const { payload } = proposal;
  let existing: JobDrive | null = null;

  if (payload.jobDriveRef) {
    existing = drives.find((drive) => `job-drive:${drive.id}` === payload.jobDriveRef) ?? null;
    if (!existing) {
      return issue(
        "jobDriveRef",
        "The selected Job Drive is no longer available. Please identify it again.",
      );
    }
  } else {
    const candidates = matchingJobDrives(payload, drives);
    if (candidates.length > 1) {
      return issue(
        "jobDriveRef",
        `I found multiple plausible ${payload.companyName ?? "company"} Job Drives. Open the intended drive or add a location/source URL.`,
      );
    }
    existing = candidates[0] ?? null;
  }

  if (
    existing &&
    ((payload.companyName &&
      normalizeCompanyName(payload.companyName) !== normalizeCompanyName(existing.companyName)) ||
      (payload.roleTitle &&
        normalizeRoleTitle(payload.roleTitle) !== normalizeRoleTitle(existing.roleTitle)))
  ) {
    return issue(
      "jobDriveRef",
      "The proposed company or role conflicts with the matched Job Drive. Please identify the intended drive again.",
    );
  }

  if (payload.isCorrection && !existing) {
    return issue("jobDriveRef", "A correction must match an existing Job Drive first.");
  }

  const companyName = existing?.companyName ?? payload.companyName;
  const roleTitle = existing?.roleTitle ?? payload.roleTitle;
  if (!companyName) return issue("companyName", "Company is required.");
  if (!roleTitle) return issue("roleTitle", "Role is required.");

  const stage = !existing
    ? payload.stage
    : payload.isCorrection
      ? payload.stage
      : inferredStage(existing.stage, payload.stage);

  const interviewRounds = mergeProposedRound(payload.interviewRound, editableRounds(existing?.interviewRounds ?? []));
  if (interviewRounds.length > MAX_INTERVIEW_ROUNDS) {
    return issue("interviewRound", `A drive can track up to ${MAX_INTERVIEW_ROUNDS} interview rounds. Remove one first.`);
  }

  return {
    ok: true,
    payload: persistedJobDriveProgressPayloadSchema.parse({
      jobDriveId: existing?.id ?? null,
      expectedUpdatedAt: existing?.updatedAt ?? null,
      isCorrection: payload.isCorrection,
      companyName,
      roleTitle,
      stage,
      stageOccurredAt:
        existing && stage === existing.stage
          ? payload.stageOccurredAt ?? existing.stageOccurredAt
          : payload.stageOccurredAt,
      appliedAt: payload.appliedAt ?? existing?.appliedAt ?? null,
      applyBy: payload.applyBy ?? existing?.applyBy ?? null,
      location: payload.location ?? existing?.location ?? null,
      sourceUrl: payload.sourceUrl ?? existing?.sourceUrl ?? null,
      notes: payload.notes ?? existing?.notes ?? null,
      assessment: mergeAssessmentDetails(payload.assessment, existing?.assessment ?? null),
      interviewRounds,
    }),
  };
}
