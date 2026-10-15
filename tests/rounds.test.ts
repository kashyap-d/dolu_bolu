import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { InterviewRound } from "../src/features/job-drives/contracts";
import { mergeProposedRound, nextScheduledRound, type ProposedRound } from "../src/features/job-drives/rounds";

function round(overrides: Partial<InterviewRound> = {}): InterviewRound {
  return {
    id: crypto.randomUUID(), title: "Technical 1", kind: "technical", status: "scheduled",
    scheduledAt: null, timeZone: null, mode: "virtual", location: null,
    meetingUrl: "https://meet.example/abc", notes: "Arrays and graphs", ...overrides,
  };
}

function proposed(overrides: Partial<ProposedRound> = {}): ProposedRound {
  const { id: _id, ...base } = round({ mode: "unknown", meetingUrl: null, notes: null, ...overrides });
  return base;
}

describe("mergeProposedRound", () => {
  it("adds a new round when nothing matches", () => {
    const existing = [round()];
    const merged = mergeProposedRound(proposed({ title: "HR", kind: "hr" }), existing, () => "new-id");
    assert.deepEqual(merged.map((r) => [r.id, r.title]), [[existing[0]!.id, "Technical 1"], ["new-id", "HR"]]);
  });

  it("updates the round with the same title, keeping what the message did not mention", () => {
    const existing = [round()];
    const [merged] = mergeProposedRound(proposed({ title: "technical-1", status: "completed" }), existing);
    assert.equal(merged!.id, existing[0]!.id);
    assert.equal(merged!.status, "completed");
    assert.equal(merged!.mode, "virtual");
    assert.equal(merged!.meetingUrl, "https://meet.example/abc");
    assert.equal(merged!.notes, "Arrays and graphs");
  });

  it("updates the only scheduled round of the same kind even if titled differently", () => {
    const existing = [round({ title: "R1", kind: "hr" })];
    const merged = mergeProposedRound(proposed({ title: "HR round", kind: "hr", scheduledAt: "2026-10-20T04:30:00Z", timeZone: "Asia/Kolkata" }), existing);
    assert.equal(merged.length, 1);
    assert.equal(merged[0]!.title, "R1");
    assert.equal(merged[0]!.scheduledAt, "2026-10-20T04:30:00Z");
  });

  it("adds a round when the kind is ambiguous", () => {
    const existing = [round({ title: "T1" }), round({ title: "T2" })];
    assert.equal(mergeProposedRound(proposed({ title: "Technical", kind: "technical" }), existing).length, 3);
  });

  it("keeps the stored time zone with the stored time", () => {
    const existing = [round({ scheduledAt: "2026-10-20T04:30:00Z", timeZone: "Asia/Kolkata" })];
    const [merged] = mergeProposedRound(proposed({ status: "completed", timeZone: null }), existing);
    assert.equal(merged!.timeZone, "Asia/Kolkata");
  });

  it("leaves rounds unchanged when the message is not about a round", () => {
    const existing = [round()];
    assert.deepEqual(mergeProposedRound(null, existing), existing);
  });
});

describe("nextScheduledRound", () => {
  it("returns the soonest upcoming scheduled round, ignoring past, completed, and unscheduled ones", () => {
    const now = new Date("2026-10-15T00:00:00Z").getTime();
    const rounds = [
      round({ title: "Past", scheduledAt: "2026-10-01T00:00:00Z" }),
      round({ title: "Done", status: "completed", scheduledAt: "2026-10-16T00:00:00Z" }),
      round({ title: "Later", scheduledAt: "2026-10-30T00:00:00Z" }),
      round({ title: "Soon", scheduledAt: "2026-10-17T00:00:00+05:30" }),
      round({ title: "Unscheduled" }),
    ];
    assert.equal(nextScheduledRound(rounds, now)?.title, "Soon");
  });
});
