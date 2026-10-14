import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { inferredStage, isBackwardStageChange } from "../src/features/job-drives/stage-rules";

describe("Job Drive stage rules", () => {
  it("supports forward progress and skipped stages", () => {
    assert.equal(inferredStage("planned", "assessment"), "assessment");
    assert.equal(inferredStage("applied", "offer"), "offer");
  });

  it("does not regress from earlier information", () => {
    assert.equal(inferredStage("interview", "applied"), "interview");
    assert.equal(inferredStage("offer", "assessment"), "offer");
  });

  it("allows rejection and withdrawal from any active stage", () => {
    assert.equal(inferredStage("planned", "rejected"), "rejected");
    assert.equal(inferredStage("interview", "withdrawn"), "withdrawn");
  });

  it("keeps terminal drives closed unless a correction is explicit", () => {
    assert.equal(inferredStage("rejected", "interview"), "rejected");
    assert.equal(inferredStage("accepted", "rejected"), "accepted");
    assert.equal(isBackwardStageChange("rejected", "interview"), true);
    assert.equal(isBackwardStageChange("accepted", "rejected"), true);
    assert.equal(isBackwardStageChange("offer", "interview"), true);
    assert.equal(isBackwardStageChange("interview", "rejected"), false);
  });
});
