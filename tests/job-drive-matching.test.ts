import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { JobDrive } from "../src/features/job-drives/contracts";
import { matchingJobDrives } from "../src/features/job-drives/matching";

function drive(overrides: Partial<JobDrive> = {}): JobDrive {
  return {
    id: crypto.randomUUID(), companyName: "Acme", roleTitle: "Backend Engineer", stage: "applied",
    stageOccurredAt: null, appliedAt: null, applyBy: null, location: null, sourceUrl: null,
    notes: null, assessment: null, interview: null,
    createdAt: "2026-09-15T10:00:00.000Z", updatedAt: "2026-09-15T10:00:00.000Z", ...overrides,
  };
}

const candidate = { companyName: "Acme", roleTitle: "Backend Engineer", stage: "assessment" as const, sourceUrl: null, location: null };

describe("owner-scoped Job Drive matching", () => {
  it("prefers an exact source URL", () => {
    const exact = drive({ sourceUrl: "https://jobs.example/123" });
    assert.deepEqual(matchingJobDrives({ ...candidate, companyName: "Different", sourceUrl: "https://jobs.example/123" }, [drive(), exact]), [exact]);
  });

  it("returns multiple plausible active drives for clarification", () => {
    assert.equal(matchingJobDrives(candidate, [drive(), drive()]).length, 2);
  });

  it("uses location to disambiguate similar company-role drives", () => {
    const remote = drive({ location: "Remote" });
    assert.deepEqual(matchingJobDrives({ ...candidate, location: "remote" }, [drive({ location: "Bengaluru" }), remote]), [remote]);
  });

  it("treats a new active update after a closed drive as a legitimate repeat", () => {
    assert.deepEqual(matchingJobDrives({ ...candidate, stage: "applied" }, [drive({ stage: "rejected" })]), []);
  });
});
