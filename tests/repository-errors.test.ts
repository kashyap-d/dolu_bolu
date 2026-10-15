import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { jobDriveSchema } from "../src/features/job-drives/contracts";
import { invalidStoredData } from "../src/server/repositories/errors";

describe("invalid stored data errors", () => {
  it("name the failing field without echoing personal values", () => {
    // A database missing the date-only migration still returns a timestamp here.
    const result = jobDriveSchema.safeParse({
      id: crypto.randomUUID(), companyName: "Secret Startup", roleTitle: "Engineer", stage: "applied",
      stageOccurredAt: null, appliedAt: "2026-10-13T00:00:00+00:00", applyBy: null, location: null,
      sourceUrl: null, notes: null, assessment: null, interviewRounds: [],
      createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z",
    });
    assert.equal(result.success, false);
    if (result.success) return;

    const error = invalidStoredData("Job Drive data", result.error);
    assert.match(error.message, /appliedAt/);
    assert.match(error.message, /migration/);
    assert.doesNotMatch(error.message, /Secret Startup|2026-10-13/);
  });
});
