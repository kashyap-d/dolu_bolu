import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  assistantResponseSchema,
  persistedJobDriveProgressPayloadSchema,
  providerResponseSchema,
  type ActionProposalDraft,
  type AssistantRequest,
  type AssistantResponse,
} from "@/features/assistant/job-drive-contracts";
import {
  validateProposalEvidence,
  validateProposalForConfirmation,
} from "@/features/assistant/validate-job-drive-proposal";
import {
  mergeAssessmentDetails,
  mergeInterviewSummary,
} from "@/features/job-drives/merge-details";
import { inferredStage } from "@/features/job-drives/stage-rules";
import { matchingJobDrives } from "@/features/job-drives/matching";
import { getActionProposalProvider } from "@/server/ai/get-provider";
import { getAiDailyRequestLimit } from "@/server/env";
import { consumeAiRequest } from "@/server/repositories/ai-usage-repository";
import { listJobDrives } from "@/server/repositories/job-drive-repository";
import {
  findJobDriveProposalByClientRequest,
  persistJobDriveProposal,
} from "@/server/repositories/job-drive-proposal-repository";

export class AiQuotaExceededError extends Error {
  constructor(readonly limit: number) {
    super("The daily assistant limit has been reached.");
    this.name = "AiQuotaExceededError";
  }
}

export class ClientRequestConflictError extends Error {
  constructor() {
    super("A request ID cannot be reused for a different message.");
    this.name = "ClientRequestConflictError";
  }
}

interface PersistenceContext {
  supabase: SupabaseClient;
  userId: string;
}

function materializeProposal(
  proposal: ActionProposalDraft,
  drives: Awaited<ReturnType<typeof listJobDrives>>,
) {
  const requestedRef = proposal.payload.jobDriveRef;
  let existing = requestedRef
    ? drives.find((drive) => `job-drive:${drive.id}` === requestedRef)
    : null;

  if (requestedRef && !existing) {
    return {
      issue: {
        fieldPath: "jobDriveRef",
        message: "The selected Job Drive is no longer available. Please identify it again.",
      },
    } as const;
  }

  if (!requestedRef) {
    const candidates = matchingJobDrives(proposal.payload, drives);
    if (candidates.length > 1) {
      return {
        issue: {
          fieldPath: "jobDriveRef",
          message: `I found multiple plausible ${proposal.payload.companyName ?? "company"} Job Drives. Open the intended drive or add a location/source URL.`,
        },
      } as const;
    }
    existing = candidates[0] ?? null;
  }

  if (
    existing &&
    ((proposal.payload.companyName &&
      proposal.payload.companyName.toLocaleLowerCase() !== existing.companyName.toLocaleLowerCase()) ||
      (proposal.payload.roleTitle &&
        proposal.payload.roleTitle.toLocaleLowerCase() !== existing.roleTitle.toLocaleLowerCase()))
  ) {
    return {
      issue: {
        fieldPath: "jobDriveRef",
        message: "The proposed company or role conflicts with the matched Job Drive. Please identify the intended drive again.",
      },
    } as const;
  }

  if (proposal.payload.isCorrection && !existing) {
    return {
      issue: {
        fieldPath: "jobDriveRef",
        message: "A correction must match an existing Job Drive first.",
      },
    } as const;
  }

  const companyName = existing?.companyName ?? proposal.payload.companyName;
  const roleTitle = existing?.roleTitle ?? proposal.payload.roleTitle;
  if (!companyName || !roleTitle) {
    return {
      issue: {
        fieldPath: !companyName ? "companyName" : "roleTitle",
        message: !companyName ? "Company is required." : "Role is required.",
      },
    } as const;
  }

  const targetStage = existing
    ? proposal.payload.isCorrection
      ? proposal.payload.stage
      : inferredStage(existing.stage, proposal.payload.stage)
    : proposal.payload.stage;
  const payload = persistedJobDriveProgressPayloadSchema.parse({
    jobDriveId: existing?.id ?? null,
    expectedUpdatedAt: existing?.updatedAt ?? null,
    isCorrection: proposal.payload.isCorrection,
    companyName,
    roleTitle,
    stage: targetStage,
    stageOccurredAt:
      existing && targetStage === existing.stage
        ? proposal.payload.stageOccurredAt ?? existing.stageOccurredAt
        : proposal.payload.stageOccurredAt,
    appliedAt: proposal.payload.appliedAt ?? existing?.appliedAt ?? null,
    applyBy: proposal.payload.applyBy ?? existing?.applyBy ?? null,
    location: proposal.payload.location ?? existing?.location ?? null,
    sourceUrl: proposal.payload.sourceUrl ?? existing?.sourceUrl ?? null,
    notes: proposal.payload.notes ?? existing?.notes ?? null,
    assessment: mergeAssessmentDetails(
      proposal.payload.assessment,
      existing?.assessment ?? null,
    ),
    interview: mergeInterviewSummary(
      proposal.payload.interview,
      existing?.interview ?? null,
    ),
  });

  return { payload } as const;
}

export async function prepareJobDriveProposals(
  request: AssistantRequest,
  persistence: PersistenceContext | null,
): Promise<AssistantResponse> {
  if (persistence) {
    const replay = await findJobDriveProposalByClientRequest(
      persistence.supabase,
      persistence.userId,
      request.clientRequestId,
    );
    if (replay) {
      if (replay.batch.source_message !== request.message) {
        throw new ClientRequestConflictError();
      }
      if (replay.status !== "pending") {
        return assistantResponseSchema.parse({
          decision: {
            kind: "unsupported",
            message:
              replay.status === "executed"
                ? "This update has already been confirmed and is in your Drives workspace."
                : "This update is no longer pending. Send a new message to prepare another change.",
          },
          metadata: {
            provider: replay.batch.provider,
            model: replay.batch.model,
            latencyMs: 0,
            isDemo: replay.batch.provider === "demo",
          },
        });
      }
      return assistantResponseSchema.parse({
        decision: {
          kind: "proposals",
          batchId: replay.batch.id,
          proposals: [replay.proposal],
        },
        metadata: {
          provider: replay.batch.provider,
          model: replay.batch.model,
          latencyMs: 0,
          isDemo: replay.batch.provider === "demo",
        },
      });
    }
  }

  const drives = persistence
    ? await listJobDrives(persistence.supabase, persistence.userId)
    : [];
  const provider = getActionProposalProvider({ allowHosted: Boolean(persistence) });
  if (persistence && !provider.isDemo) {
    const usage = await consumeAiRequest(
      persistence.supabase,
      getAiDailyRequestLimit(),
    );
    if (usage.outcome === "limit_reached") {
      throw new AiQuotaExceededError(usage.limit);
    }
    if (usage.outcome !== "allowed") {
      throw new Error("The AI request allowance could not be reserved.");
    }
  }
  const rawResult = await provider.propose({
    message: request.message,
    now: new Date().toISOString(),
    timeZone: request.timeZone,
    locale: request.locale,
    context: {
      jobDrives: drives.slice(0, 20).map((drive) => ({
        ref: `job-drive:${drive.id}`,
        companyName: drive.companyName,
        roleTitle: drive.roleTitle,
        stage: drive.stage,
        location: drive.location,
        sourceUrl: drive.sourceUrl,
        updatedAt: drive.updatedAt,
      })),
    },
  });
  const providerResult = providerResponseSchema.parse(rawResult);
  if (providerResult.decision.kind !== "proposals") {
    return assistantResponseSchema.parse(providerResult);
  }

  const validationIssues = providerResult.decision.proposals.flatMap(
    (proposal) => [
      ...validateProposalEvidence(request.message, proposal),
      ...validateProposalForConfirmation(proposal),
      ...(proposal.payload.isCorrection &&
      !/\b(?:correction|correct|mistake|wrong|reopen)\b/i.test(request.message)
        ? [
            {
              fieldPath: "isCorrection",
              message: "An audited correction must be explicit in your message.",
            },
          ]
        : []),
    ],
  );
  const materialized = providerResult.decision.proposals.map((proposal) => ({
    proposal,
    result: materializeProposal(proposal, drives),
  }));
  const materializationIssues = materialized.flatMap(({ result }) =>
    "issue" in result && result.issue ? [result.issue] : [],
  );
  const issues = [...validationIssues, ...materializationIssues];
  if (issues.length > 0) {
    return assistantResponseSchema.parse({
      decision: {
        kind: "needs_clarification",
        question: issues.map((issue) => issue.message).join(" "),
        missingFields: [...new Set(issues.map((issue) => issue.fieldPath))],
      },
      metadata: providerResult.metadata,
    });
  }

  if (providerResult.decision.proposals.length !== 1 || materialized.length !== 1) {
    return assistantResponseSchema.parse({
      decision: {
        kind: "unsupported",
        message: "Update one Job Drive at a time so every change stays reviewable.",
      },
      metadata: providerResult.metadata,
    });
  }

  const item = materialized[0]!;
  if (!("payload" in item.result)) {
    throw new Error("A validated proposal could not be materialized.");
  }

  if (persistence) {
    const persisted = await persistJobDriveProposal(persistence.supabase, {
      clientRequestId: request.clientRequestId,
      sourceMessage: request.message,
      provider: providerResult.metadata.provider,
      model: providerResult.metadata.model,
      proposal: item.proposal,
      payload: item.result.payload!,
    });
    return assistantResponseSchema.parse({
      decision: {
        kind: "proposals",
        batchId: persisted.batchId,
        proposals: [persisted.proposal],
      },
      metadata: providerResult.metadata,
    });
  }

  return assistantResponseSchema.parse({
    decision: {
      kind: "proposals",
      batchId: crypto.randomUUID(),
      proposals: [
        {
          ...item.proposal,
          id: crypto.randomUUID(),
          version: 1,
          payload: item.result.payload!,
        },
      ],
    },
    metadata: providerResult.metadata,
  });
}
