import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeActivityMetadata } from "../src/features/job-drives/activity";

describe("Job Drive activity compatibility", () => {
  it("keeps immutable pre-migration activity readable without inventing stages", () => {
    const batchId = crypto.randomUUID();
    assert.deepEqual(
      normalizeActivityMetadata({
        source: "assistant",
        batchId,
      }),
      {
        source: "assistant",
        previousStage: null,
        newStage: null,
        changedFields: [],
        occurredAt: null,
        batchId,
      },
    );
  });
});
