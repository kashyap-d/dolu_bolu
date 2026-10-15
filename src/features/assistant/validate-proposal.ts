import type {
  ActionProposal,
  ActionProposalDraft,
} from "./contracts";

type ValidatableProposal = ActionProposal | ActionProposalDraft;

export interface ProposalIssue {
  fieldPath: string;
  message: string;
}

export function validateProposalForConfirmation(
  proposal: ValidatableProposal,
): ProposalIssue[] {
  const issues: ProposalIssue[] = [];
  const linkedToExisting =
    "jobDriveRef" in proposal.payload
      ? Boolean(proposal.payload.jobDriveRef)
      : Boolean(proposal.payload.jobDriveId);

  if (!linkedToExisting && !proposal.payload.companyName) {
    issues.push({ fieldPath: "companyName", message: "Company is required." });
  }

  if (!linkedToExisting && !proposal.payload.roleTitle) {
    issues.push({ fieldPath: "roleTitle", message: "Role is required." });
  }

  if (
    proposal.payload.assessment?.availableFrom &&
    proposal.payload.assessment.dueAt &&
    new Date(proposal.payload.assessment.dueAt).getTime() <
      new Date(proposal.payload.assessment.availableFrom).getTime()
  ) {
    issues.push({
      fieldPath: "assessment.dueAt",
      message: "The assessment deadline must be after it becomes available.",
    });
  }

  const rounds =
    "interviewRound" in proposal.payload
      ? proposal.payload.interviewRound
        ? [proposal.payload.interviewRound]
        : []
      : proposal.payload.interviewRounds;
  if (rounds.some((round) => round.scheduledAt && !round.timeZone)) {
    issues.push({
      fieldPath: "interviewRound.timeZone",
      message: "A scheduled interview needs a timezone.",
    });
  }

  return issues;
}

export function validateProposalEvidence(
  sourceMessage: string,
  proposal: ValidatableProposal,
): ProposalIssue[] {
  return proposal.evidence.flatMap((evidence) =>
    sourceMessage.includes(evidence.quote)
      ? []
      : [
          {
            fieldPath: evidence.fieldPath,
            message: "Proposal evidence must be quoted from the source message.",
          },
        ],
  );
}
