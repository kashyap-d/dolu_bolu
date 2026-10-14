import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ActionProposalDraft } from "../src/features/assistant/contracts";
import { resolveProposal } from "../src/features/assistant/resolve-proposal";
import type { JobDrive } from "../src/features/job-drives/contracts";

function drive(overrides: Partial<JobDrive> = {}): JobDrive {
  return {
    id: crypto.randomUUID(), companyName: "Acme", roleTitle: "Backend Engineer", stage: "interview",
    stageOccurredAt: null, appliedAt: "2026-09-01T09:00:00.000Z", applyBy: null, location: null,
    sourceUrl: null, notes: "Referred by Priya", assessment: null, interview: null,
    createdAt: "2026-09-01T09:00:00.000Z", updatedAt: "2026-09-10T09:00:00.000Z", ...overrides,
  };
}

function draft(payload: Partial<ActionProposalDraft["payload"]> = {}): ActionProposalDraft {
  return {
    kind: "record_job_drive_progress",
    summary: "Move Acme · Backend Engineer",
    evidence: [{ fieldPath: "companyName", quote: "Acme" }],
    assumptions: [],
    payload: {
      jobDriveRef: null, isCorrection: false, companyName: "Acme", roleTitle: "Backend Engineer",
      stage: "assessment", stageOccurredAt: null, appliedAt: null, applyBy: null, location: null,
      sourceUrl: null, notes: null, assessment: null, interview: null, ...payload,
    },
  };
}

const message = "OA at Acme for Backend Engineer";

describe("resolveProposal", () => {
  it("creates a new drive when nothing matches", () => {
    const result = resolveProposal(message, draft(), []);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.payload.jobDriveId, null);
    assert.equal(result.payload.expectedUpdatedAt, null);
    assert.equal(result.payload.stage, "assessment");
  });

  it("targets a matched drive with its concurrency token and keeps omitted details", () => {
    const existing = drive({ stage: "applied" });
    const result = resolveProposal(message, draft(), [existing]);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.payload.jobDriveId, existing.id);
    assert.equal(result.payload.expectedUpdatedAt, existing.updatedAt);
    assert.equal(result.payload.appliedAt, existing.appliedAt);
    assert.equal(result.payload.notes, "Referred by Priya");
    assert.equal(result.payload.stage, "assessment");
  });

  it("never lets older news move a drive backwards without a correction", () => {
    const existing = drive({ stage: "interview" });
    const result = resolveProposal(message, draft({ jobDriveRef: `job-drive:${existing.id}` }), [existing]);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.payload.stage, "interview");
  });

  it("applies an explicit correction exactly as stated", () => {
    const existing = drive({ stage: "interview" });
    const correction = "Correction: OA at Acme for Backend Engineer";
    const result = resolveProposal(
      correction,
      draft({ jobDriveRef: `job-drive:${existing.id}`, isCorrection: true }),
      [existing],
    );
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.payload.stage, "assessment");
  });

  it("refuses a correction the user did not ask for", () => {
    const existing = drive();
    const result = resolveProposal(message, draft({ jobDriveRef: `job-drive:${existing.id}`, isCorrection: true }), [existing]);
    assert.deepEqual(result, {
      ok: false,
      issues: [{ fieldPath: "isCorrection", message: "An audited correction must be explicit in your message." }],
    });
  });

  it("asks which drive when several plausibly match", () => {
    const result = resolveProposal(message, draft(), [drive(), drive()]);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.issues[0]?.fieldPath, "jobDriveRef");
  });

  it("rejects a reference to a drive outside the supplied context", () => {
    const result = resolveProposal(message, draft({ jobDriveRef: `job-drive:${crypto.randomUUID()}` }), [drive()]);
    assert.equal(result.ok, false);
  });

  it("rejects a referenced drive whose company conflicts with the proposal", () => {
    const existing = drive({ companyName: "Globex" });
    const result = resolveProposal(message, draft({ jobDriveRef: `job-drive:${existing.id}` }), [existing]);
    assert.equal(result.ok, false);
  });

  it("rejects evidence that is not in the message", () => {
    const result = resolveProposal("OA tomorrow", draft(), []);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.issues[0]?.message, "Proposal evidence must be quoted from the source message.");
  });

  it("fills identity from the matched drive when the provider omitted it", () => {
    const existing = drive();
    const result = resolveProposal(
      "OA at Acme",
      draft({ jobDriveRef: `job-drive:${existing.id}`, companyName: null, roleTitle: null }),
      [existing],
    );
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.payload.roleTitle, "Backend Engineer");
  });
});
