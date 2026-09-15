import type { ActionProposal, ActionProposalDraft } from "./contracts";

type ValidatableProposal = ActionProposal | ActionProposalDraft;

export interface ProposalIssue {
  fieldPath: string;
  message: string;
}

export function validateProposalForConfirmation(
  proposal: ValidatableProposal,
): ProposalIssue[] {
  switch (proposal.kind) {
    case "create_application": {
      const issues: ProposalIssue[] = [];

      if (!proposal.payload.companyName) {
        issues.push({ fieldPath: "companyName", message: "Company is required." });
      }

      if (!proposal.payload.roleTitle) {
        issues.push({ fieldPath: "roleTitle", message: "Role is required." });
      }

      return issues;
    }
    case "create_interview": {
      const issues: ProposalIssue[] = [];

      if (!proposal.payload.companyName) {
        issues.push({ fieldPath: "companyName", message: "Company is required." });
      }

      if (!proposal.payload.startsAt) {
        issues.push({
          fieldPath: "startsAt",
          message: "An interview date and time are required.",
        });
      }

      return issues;
    }
    case "create_task": {
      const issues: ProposalIssue[] = [];

      if (!proposal.payload.title) {
        issues.push({ fieldPath: "title", message: "Task title is required." });
      }

      if (proposal.payload.reminderRequested && !proposal.payload.dueAt) {
        issues.push({
          fieldPath: "dueAt",
          message: "A reminder needs a specific due date and time.",
        });
      }

      return issues;
    }
  }
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
