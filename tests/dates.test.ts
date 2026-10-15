import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { addDays, calendarDate } from "../src/lib/dates";

describe("calendar dates", () => {
  it("uses the user's zone, not UTC, to decide what day it is", () => {
    const lateEveningUtc = new Date("2026-10-14T20:00:00Z");
    assert.equal(calendarDate(lateEveningUtc, "UTC"), "2026-10-14");
    assert.equal(calendarDate(lateEveningUtc, "Asia/Kolkata"), "2026-10-15");
  });

  it("adds days across month and year boundaries", () => {
    assert.equal(addDays("2026-10-31", 1), "2026-11-01");
    assert.equal(addDays("2027-01-01", -1), "2026-12-31");
  });
});
