import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { REDACTED_EMAIL, REDACTED_PHONE, redactContactDetails } from "../src/features/assistant/redact";

describe("redactContactDetails", () => {
  it("removes email addresses and phone numbers from a pasted signature", () => {
    const text = "Regards,\nPriya Sharma\npriya.sharma@musigma.com\n+91 98765 43210 | (080) 4567-8901";
    const redacted = redactContactDetails(text);
    assert.equal(redacted, `Regards,\nPriya Sharma\n${REDACTED_EMAIL}\n${REDACTED_PHONE} | ${REDACTED_PHONE}`);
  });

  it("keeps dates, times, durations, and IDs that are not phone numbers", () => {
    const text = "Window: 16-09-2026 10:00 to 18.09.2026 23:59 IST. Duration 90 minutes. Requisition 2026-4471.";
    assert.equal(redactContactDetails(text), text);
  });

  it("keeps links intact, including ones that contain addresses or long numbers", () => {
    const text =
      "Start here: https://hackerrank.com/test/abc123?invite=priya@musigma.com&ref=9876543210 or join https://meet.google.com/xyz-abcd-efg";
    assert.equal(redactContactDetails(text), text);
  });

  it("leaves short messages alone", () => {
    assert.equal(redactContactDetails("I applied to Acme for SDE 1 yesterday."), "I applied to Acme for SDE 1 yesterday.");
  });
});
