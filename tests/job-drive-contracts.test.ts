import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assessmentDetailsSchema,
  interviewSummarySchema,
  jobDriveProgressPayloadSchema,
  jobDriveStageSchema,
} from "../src/features/job-drives/contracts";

function payload() {
  return {
    companyName: "Acme",
    roleTitle: "Backend Engineer",
    stage: "assessment",
    stageOccurredAt: null,
    appliedAt: null,
    applyBy: null,
    location: null,
    sourceUrl: "https://careers.example/jobs/123",
    notes: null,
    assessment: null,
    interview: null,
  };
}

describe("Job Drive contracts", () => {
  it("accepts every lifecycle stage", () => {
    for (const stage of ["planned", "applied", "assessment", "interview", "offer", "accepted", "rejected", "withdrawn"]) {
      assert.equal(jobDriveStageSchema.safeParse(stage).success, true);
    }
  });

  it("allows unknown application and occurrence dates at a later stage", () => {
    assert.equal(jobDriveProgressPayloadSchema.safeParse(payload()).success, true);
  });

  it("rejects an OA deadline earlier than its availability", () => {
    const result = assessmentDetailsSchema.safeParse({
      status: "scheduled",
      availableFrom: "2026-09-16T10:00:00.000Z",
      dueAt: "2026-09-16T09:00:00.000Z",
      durationMinutes: 60,
      assessmentUrl: null,
      notes: null,
    });
    assert.equal(result.success, false);
  });

  it("requires a timezone only when an interview is scheduled", () => {
    const base = { nextScheduledAt: "2026-09-18T10:00:00.000Z", timeZone: null, mode: "virtual", location: null, meetingUrl: null, roundSummary: null, notes: null };
    assert.equal(interviewSummarySchema.safeParse(base).success, false);
    assert.equal(interviewSummarySchema.safeParse({ ...base, nextScheduledAt: null }).success, true);
    assert.equal(interviewSummarySchema.safeParse({ ...base, timeZone: "Mars/Olympus" }).success, false);
  });

  it("rejects non-HTTP URLs and malformed timestamps", () => {
    assert.equal(jobDriveProgressPayloadSchema.safeParse({ ...payload(), sourceUrl: "javascript:alert(1)" }).success, false);
    assert.equal(jobDriveProgressPayloadSchema.safeParse({ ...payload(), appliedAt: "Friday" }).success, false);
  });
});
