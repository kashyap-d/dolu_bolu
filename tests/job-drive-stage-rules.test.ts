import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { importantDateForDrive, inferredStage, isBackwardStageChange } from "../src/features/job-drives/stage-rules";

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

describe("importantDateForDrive", () => {
  const now = new Date("2026-10-15T06:00:00Z").getTime();
  const none = { applyBy: null, assessment: null, interview: null };

  it("picks the nearest upcoming date across all-day and timed values", () => {
    const important = importantDateForDrive(
      {
        applyBy: "2026-10-20",
        assessment: { availableFrom: null, dueAt: "2026-10-17T18:30:00Z" },
        interview: { nextScheduledAt: "2026-10-25T04:30:00Z" },
      },
      now,
    );
    assert.equal(important?.label, "OA deadline");
    assert.equal(important?.allDay, false);
  });

  it("keeps an apply-by date upcoming for the whole of that day", () => {
    const important = importantDateForDrive({ ...none, applyBy: "2026-10-15" }, now);
    assert.equal(important?.allDay, true);
    assert.ok(important!.at >= now);
  });

  it("falls back to the most recent past date and returns null when nothing is dated", () => {
    assert.equal(importantDateForDrive({ ...none, applyBy: "2026-10-01" }, now)?.label, "Apply by");
    assert.equal(importantDateForDrive(none, now), null);
  });
});
