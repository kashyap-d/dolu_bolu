import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  mergeAssessmentDetails,
  mergeInterviewSummary,
} from "../src/features/job-drives/merge-details";

describe("AI detail merging", () => {
  it("preserves known OA fields when a proposal updates only the status", () => {
    assert.deepEqual(
      mergeAssessmentDetails(
        {
          status: "passed",
          availableFrom: null,
          dueAt: null,
          durationMinutes: null,
          assessmentUrl: null,
          notes: null,
        },
        {
          status: "scheduled",
          availableFrom: "2026-09-16T03:30:00.000Z",
          dueAt: "2026-09-18T12:30:00.000Z",
          durationMinutes: 90,
          assessmentUrl: "https://example.com/oa",
          notes: "Bring a calculator",
          updatedAt: "2026-09-16T04:00:00.000Z",
        },
      ),
      {
        status: "passed",
        availableFrom: "2026-09-16T03:30:00.000Z",
        dueAt: "2026-09-18T12:30:00.000Z",
        durationMinutes: 90,
        assessmentUrl: "https://example.com/oa",
        notes: "Bring a calculator",
      },
    );
  });

  it("preserves a known interview mode when the proposal has no mode evidence", () => {
    const merged = mergeInterviewSummary(
      {
        nextScheduledAt: null,
        timeZone: null,
        mode: "unknown",
        location: null,
        meetingUrl: null,
        roundSummary: "Technical round complete",
        notes: null,
      },
      {
        nextScheduledAt: null,
        timeZone: null,
        mode: "virtual",
        location: null,
        meetingUrl: "https://meet.example.com/round",
        roundSummary: null,
        notes: null,
        updatedAt: "2026-09-16T04:00:00.000Z",
      },
    );

    assert.equal(merged?.mode, "virtual");
    assert.equal(merged?.meetingUrl, "https://meet.example.com/round");
    assert.equal(merged?.roundSummary, "Technical round complete");
  });
});
