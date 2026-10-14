import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { actionProposalDraftSchema, actionProposalSchema, type ActionProposalDraft } from "../src/features/assistant/contracts";
import { validateProposalEvidence, validateProposalForConfirmation } from "../src/features/assistant/validate-proposal";

function draft(): ActionProposalDraft {
  return {
    kind: "record_job_drive_progress",
    summary: "Move Acme · Backend Engineer to Assessment",
    evidence: [{ fieldPath: "companyName", quote: "Acme" }],
    assumptions: ["The application date remains unknown."],
    payload: {
      jobDriveRef: null,
      isCorrection: false,
      companyName: "Acme",
      roleTitle: "Backend Engineer",
      stage: "assessment",
      stageOccurredAt: null,
      appliedAt: null,
      applyBy: null,
      location: null,
      sourceUrl: null,
      notes: null,
      assessment: { status: "invited", availableFrom: null, dueAt: null, durationMinutes: null, assessmentUrl: null, notes: null },
      interview: null,
    },
  };
}

describe("Job Drive AI boundary", () => {
  it("accepts provider drafts without server-owned identifiers", () => {
    assert.equal(actionProposalDraftSchema.safeParse(draft()).success, true);
  });

  it("rejects provider attempts to inject server-owned identifiers", () => {
    assert.equal(actionProposalDraftSchema.safeParse({ ...draft(), id: crypto.randomUUID(), version: 1 }).success, false);
  });

  it("requires server-owned identity and concurrency metadata after persistence", () => {
    assert.equal(actionProposalSchema.safeParse(draft()).success, false);
    const drive: Partial<ActionProposalDraft["payload"]> = { ...draft().payload };
    delete drive.jobDriveRef;
    assert.equal(actionProposalSchema.safeParse({
      ...draft(), id: crypto.randomUUID(), version: 1,
      payload: { ...drive, jobDriveId: null, expectedUpdatedAt: null, isCorrection: false },
    }).success, true);
  });

  it("allows company and role omission only when an existing drive is referenced", () => {
    const linked = { ...draft(), payload: { ...draft().payload, jobDriveRef: `job-drive:${crypto.randomUUID()}`, companyName: null, roleTitle: null } };
    assert.deepEqual(validateProposalForConfirmation(linked), []);
    assert.deepEqual(validateProposalForConfirmation({ ...draft(), payload: { ...draft().payload, companyName: null } }), [{ fieldPath: "companyName", message: "Company is required." }]);
  });

  it("rejects evidence not copied from the source message", () => {
    assert.deepEqual(validateProposalEvidence("OA at Acme", { ...draft(), evidence: [{ fieldPath: "roleTitle", quote: "Invented role" }] }), [{ fieldPath: "roleTitle", message: "Proposal evidence must be quoted from the source message." }]);
  });
});
