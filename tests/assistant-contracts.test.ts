import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  actionProposalSchema,
  assistantRequestSchema,
  type ActionProposal,
} from "../src/features/assistant/contracts";
import {
  validateProposalEvidence,
  validateProposalForConfirmation,
} from "../src/features/assistant/validate-proposal";

function applicationProposal(): ActionProposal {
  return {
    id: crypto.randomUUID(),
    ref: "draft:1",
    kind: "create_application",
    summary: "Record Frontend Engineer application at Acme",
    evidence: [
      { fieldPath: "companyName", quote: "Acme" },
      { fieldPath: "roleTitle", quote: "Frontend Engineer" },
    ],
    assumptions: [],
    payload: {
      companyName: "Acme",
      roleTitle: "Frontend Engineer",
      status: "applied",
      appliedAt: "2026-09-13T09:00:00.000Z",
      sourceUrl: null,
      notes: null,
    },
  };
}

describe("assistant contracts", () => {
  it("accepts a complete typed application proposal", () => {
    assert.equal(actionProposalSchema.safeParse(applicationProposal()).success, true);
  });

  it("rejects unexpected provider fields", () => {
    const proposal = { ...applicationProposal(), untrustedTool: "send_email" };

    assert.equal(actionProposalSchema.safeParse(proposal).success, false);
  });

  it("rejects a malformed timezone before provider invocation", () => {
    const result = assistantRequestSchema.safeParse({
      message: "I applied to Acme for Frontend Engineer.",
      timeZone: "Mars/Olympus_Mons",
      locale: "en-IN",
      clientRequestId: crypto.randomUUID(),
    });

    assert.equal(result.success, false);
  });
});

describe("confirmation readiness", () => {
  it("requires the core fields for an application write", () => {
    const proposal = applicationProposal();
    if (proposal.kind !== "create_application") throw new Error("Invalid fixture");

    proposal.payload.companyName = null;

    assert.deepEqual(validateProposalForConfirmation(proposal), [
      { fieldPath: "companyName", message: "Company is required." },
    ]);
  });

  it("does not allow a reminder without a specific due time", () => {
    const proposal: ActionProposal = {
      id: crypto.randomUUID(),
      ref: "draft:1",
      kind: "create_task",
      summary: "Follow up with Acme",
      evidence: [{ fieldPath: "title", quote: "Follow up with Acme" }],
      assumptions: [],
      payload: {
        title: "Follow up with Acme",
        dueAt: null,
        priority: "medium",
        reminderRequested: true,
        notes: null,
      },
    };

    assert.deepEqual(validateProposalForConfirmation(proposal), [
      {
        fieldPath: "dueAt",
        message: "A reminder needs a specific due date and time.",
      },
    ]);
  });

  it("rejects evidence that was not present in the user's message", () => {
    const proposal = applicationProposal();
    if (proposal.kind !== "create_application") throw new Error("Invalid fixture");

    proposal.evidence[0] = {
      fieldPath: "companyName",
      quote: "Invented Company",
    };

    assert.deepEqual(
      validateProposalEvidence(
        "I applied to Acme for Frontend Engineer.",
        proposal,
      ),
      [
        {
          fieldPath: "companyName",
          message: "Proposal evidence must be quoted from the source message.",
        },
      ],
    );
  });
});
