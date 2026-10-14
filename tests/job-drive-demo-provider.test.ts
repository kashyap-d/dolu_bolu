import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { JobDriveDemoProvider } from "../src/server/ai/providers/job-drive-demo";

const base = { now: "2026-09-15T12:00:00.000Z", timeZone: "Asia/Kolkata", locale: "en-IN", context: { jobDrives: [] } };

describe("Job Drive demo provider", () => {
  it("infers Assessment from an OA without inventing appliedAt", async () => {
    const result = await new JobDriveDemoProvider().propose({ ...base, message: "OA at Acme for Backend Engineer tomorrow." });
    assert.equal(result.decision.kind, "proposals");
    if (result.decision.kind !== "proposals") return;
    assert.equal(result.decision.proposals[0]?.payload.stage, "assessment");
    assert.equal(result.decision.proposals[0]?.payload.appliedAt, null);
  });

  it("references an exact owner-scoped drive match", async () => {
    const id = crypto.randomUUID();
    const result = await new JobDriveDemoProvider().propose({ ...base, message: "Interview at Acme for Backend Engineer tomorrow.", context: { jobDrives: [{ ref: `job-drive:${id}`, companyName: "Acme", roleTitle: "Backend Engineer", stage: "assessment", location: null, sourceUrl: null, updatedAt: "2026-09-15T10:00:00.000Z" }] } });
    assert.equal(result.decision.kind, "proposals");
    if (result.decision.kind !== "proposals") return;
    assert.equal(result.decision.proposals[0]?.payload.jobDriveRef, `job-drive:${id}`);
  });

  it("asks for clarification when identity is missing", async () => {
    const result = await new JobDriveDemoProvider().propose({ ...base, message: "My OA is Friday." });
    assert.equal(result.decision.kind, "needs_clarification");
  });
});
