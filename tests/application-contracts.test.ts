import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applicationConfirmationPayloadSchema,
  confirmApplicationRequestSchema,
  confirmApplicationResponseSchema,
} from "../src/features/applications/contracts";

function appliedApplication() {
  return {
    companyName: "Acme",
    roleTitle: "Frontend Engineer",
    status: "applied" as const,
    appliedAt: "2026-09-13T09:00:00.000Z",
    sourceUrl: "https://careers.example.com/jobs/123",
    notes: "Applied through the careers page.",
  };
}

describe("application confirmation contracts", () => {
  it("accepts a complete applied application confirmation", () => {
    const result = confirmApplicationRequestSchema.safeParse({
      version: 1,
      application: appliedApplication(),
    });

    assert.equal(result.success, true);
  });

  it("normalizes editable text fields before confirmation", () => {
    const result = applicationConfirmationPayloadSchema.parse({
      ...appliedApplication(),
      companyName: "  Acme  ",
      roleTitle: "  Frontend Engineer  ",
      notes: "  Follow up next week.  ",
    });

    assert.equal(result.companyName, "Acme");
    assert.equal(result.roleTitle, "Frontend Engineer");
    assert.equal(result.notes, "Follow up next week.");
  });

  it("requires an applied date when status is applied", () => {
    const result = applicationConfirmationPayloadSchema.safeParse({
      ...appliedApplication(),
      appliedAt: null,
    });

    assert.equal(result.success, false);
    if (result.success) throw new Error("Expected validation to fail");
    assert.equal(result.error.issues[0]?.path.join("."), "appliedAt");
  });

  it("forbids an applied date when status is saved", () => {
    const result = applicationConfirmationPayloadSchema.safeParse({
      ...appliedApplication(),
      status: "saved",
    });

    assert.equal(result.success, false);
    if (result.success) throw new Error("Expected validation to fail");
    assert.equal(result.error.issues[0]?.path.join("."), "appliedAt");
  });

  it("accepts a saved application without an applied date", () => {
    const result = applicationConfirmationPayloadSchema.safeParse({
      ...appliedApplication(),
      status: "saved",
      appliedAt: null,
    });

    assert.equal(result.success, true);
  });

  it("rejects blank required fields after trimming", () => {
    const result = applicationConfirmationPayloadSchema.safeParse({
      ...appliedApplication(),
      companyName: "   ",
      roleTitle: "\t",
    });

    assert.equal(result.success, false);
    if (result.success) throw new Error("Expected validation to fail");
    assert.deepEqual(
      result.error.issues.map((issue) => issue.path.join(".")),
      ["companyName", "roleTitle"],
    );
  });

  it("rejects non-HTTP source URLs", () => {
    const result = applicationConfirmationPayloadSchema.safeParse({
      ...appliedApplication(),
      sourceUrl: "javascript:alert(document.domain)",
    });

    assert.equal(result.success, false);
  });

  it("requires a positive proposal version", () => {
    const result = confirmApplicationRequestSchema.safeParse({
      version: 0,
      application: appliedApplication(),
    });

    assert.equal(result.success, false);
  });

  it("accepts the idempotent already-executed response outcome", () => {
    const timestamp = "2026-09-13T09:00:00.000Z";
    const result = confirmApplicationResponseSchema.safeParse({
      outcome: "already_executed",
      proposalId: crypto.randomUUID(),
      application: {
        id: crypto.randomUUID(),
        ...appliedApplication(),
        status: "applied",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    });

    assert.equal(result.success, true);
  });
});
