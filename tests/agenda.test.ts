import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildAgenda } from "../src/features/job-drives/agenda";
import type { InterviewRound, JobDrive } from "../src/features/job-drives/contracts";

// 09:00 on 15 Oct in India.
const now = new Date("2026-10-15T03:30:00Z").getTime();
const zone = "Asia/Kolkata";

function drive(overrides: Partial<JobDrive> = {}): JobDrive {
  return {
    id: crypto.randomUUID(), companyName: "Acme", roleTitle: "Engineer", stage: "applied",
    stageOccurredAt: null, appliedAt: null, applyBy: null, location: null, sourceUrl: null, notes: null,
    assessment: null, interviewRounds: [], createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-14T00:00:00Z",
    ...overrides,
  };
}

function round(overrides: Partial<JobDrive["interviewRounds"][number]> = {}): JobDrive["interviewRounds"][number] {
  const base: InterviewRound = {
    id: crypto.randomUUID(), title: "Technical 1", kind: "technical", status: "scheduled",
    scheduledAt: null, timeZone: zone, mode: "virtual", location: null, meetingUrl: null, notes: null,
  };
  return { ...base, updatedAt: "2026-10-14T00:00:00Z", ...overrides };
}

describe("buildAgenda", () => {
  it("groups the next two weeks by day in the viewer's zone", () => {
    const agenda = buildAgenda(
      [
        // 20:00 UTC on the 15th is already the 16th in India.
        drive({ companyName: "Late", interviewRounds: [round({ scheduledAt: "2026-10-15T20:00:00Z" })] }),
        drive({ companyName: "Today", interviewRounds: [round({ scheduledAt: "2026-10-15T10:00:00Z" })] }),
        drive({ companyName: "Plan", stage: "planned", applyBy: "2026-10-20" }),
        drive({ companyName: "Far", interviewRounds: [round({ scheduledAt: "2026-11-30T10:00:00Z" })] }),
      ],
      now,
      zone,
    );
    assert.deepEqual(
      agenda.upcoming.map((day) => [day.date, day.relative, day.events.map((event) => event.drive.companyName)]),
      [
        ["2026-10-15", "today", ["Today"]],
        ["2026-10-16", "tomorrow", ["Late"]],
        ["2026-10-20", null, ["Plan"]],
      ],
    );
  });

  it("flags loose ends: past rounds still scheduled, passed OA deadlines, missed apply-by dates", () => {
    const agenda = buildAgenda(
      [
        drive({ companyName: "Round", interviewRounds: [round({ scheduledAt: "2026-10-14T10:00:00Z" })] }),
        drive({
          companyName: "OA",
          stage: "assessment",
          assessment: { status: "invited", availableFrom: null, dueAt: "2026-10-14T18:30:00Z", durationMinutes: null, assessmentUrl: null, notes: null, updatedAt: "2026-10-10T00:00:00Z" },
        }),
        drive({ companyName: "Missed", stage: "planned", applyBy: "2026-10-14" }),
        drive({ companyName: "Fine", interviewRounds: [round({ status: "completed", scheduledAt: "2026-10-14T10:00:00Z" })] }),
      ],
      now,
      zone,
    );
    assert.deepEqual(agenda.attention.map((item) => item.drive.companyName), ["Round", "OA", "Missed"]);
    assert.match(agenda.attention[0]!.message, /How did Technical 1 go/);
  });

  it("keeps an apply-by date upcoming for the whole of that day", () => {
    const agenda = buildAgenda([drive({ stage: "planned", applyBy: "2026-10-15" })], now, zone);
    assert.equal(agenda.attention.length, 0);
    assert.equal(agenda.upcoming[0]?.relative, "today");
  });

  it("lists active drives that have gone quiet, but not planned, closed, or scheduled ones", () => {
    const old = "2026-09-01T00:00:00Z";
    const agenda = buildAgenda(
      [
        drive({ companyName: "Quiet", updatedAt: old }),
        drive({ companyName: "Planned", stage: "planned", updatedAt: old }),
        drive({ companyName: "Rejected", stage: "rejected", updatedAt: old }),
        drive({ companyName: "Scheduled", updatedAt: old, interviewRounds: [round({ scheduledAt: "2026-10-20T10:00:00Z" })] }),
        drive({ companyName: "Recent" }),
      ],
      now,
      zone,
    );
    assert.deepEqual(agenda.quiet.map((item) => [item.drive.companyName, item.days]), [["Quiet", 44]]);
  });

  it("ignores closed drives entirely", () => {
    const agenda = buildAgenda(
      [drive({ stage: "withdrawn", interviewRounds: [round({ scheduledAt: "2026-10-16T10:00:00Z" })] })],
      now,
      zone,
    );
    assert.deepEqual(agenda, { attention: [], upcoming: [], quiet: [] });
  });
});

describe("buildAgenda once a drive has moved on", () => {
  const pastRound = () => round({ title: "Hiring manager", scheduledAt: "2026-10-14T10:00:00Z" });
  const pastOa = {
    status: "invited" as const, availableFrom: null, dueAt: "2026-10-14T18:30:00Z",
    durationMinutes: null, assessmentUrl: null, notes: null, updatedAt: "2026-10-10T00:00:00Z",
  };

  it("stops asking about a past round when the drive has reached an offer", () => {
    const interviewing = buildAgenda([drive({ stage: "interview", interviewRounds: [pastRound()] })], now, zone);
    assert.equal(interviewing.attention.length, 1);
    const offered = buildAgenda([drive({ stage: "offer", interviewRounds: [pastRound()] })], now, zone);
    assert.deepEqual(offered.attention, []);
  });

  it("stops asking about a passed OA deadline once interviews have started", () => {
    const assessing = buildAgenda([drive({ stage: "assessment", assessment: pastOa })], now, zone);
    assert.equal(assessing.attention.length, 1);
    const interviewing = buildAgenda([drive({ stage: "interview", assessment: pastOa })], now, zone);
    assert.deepEqual(interviewing.attention, []);
  });

  it("still shows upcoming rounds whatever the stage", () => {
    const agenda = buildAgenda(
      [drive({ stage: "offer", interviewRounds: [round({ title: "HR", scheduledAt: "2026-10-16T10:00:00Z" })] })],
      now,
      zone,
    );
    assert.equal(agenda.upcoming[0]?.events[0]?.label, "HR");
  });
});
