import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MODEL_CONTEXT_LIMIT, selectModelContext } from "../src/features/assistant/model-context";
import type { JobDrive } from "../src/features/job-drives/contracts";

function drive(companyName: string, overrides: Partial<JobDrive> = {}): JobDrive {
  return {
    id: crypto.randomUUID(), companyName, roleTitle: "Engineer", stage: "applied", stageOccurredAt: null,
    appliedAt: null, applyBy: null, location: null, sourceUrl: null, notes: null, assessment: null,
    interview: null, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", ...overrides,
  };
}

const companies = (context: ReturnType<typeof selectModelContext>) => context.map((item) => item.companyName);

describe("model context selection", () => {
  it("sends only drives at companies the message names, however they are written", () => {
    const drives = [drive("Linear"), drive("Globex Pvt. Ltd."), drive("Acme"), drive("Initech", { stage: "rejected" })];
    assert.deepEqual(companies(selectModelContext("OA from globex tomorrow", drives)), ["Globex Pvt. Ltd."]);
    assert.deepEqual(companies(selectModelContext("Initech wants to reopen my application", drives)), ["Initech"]);
  });

  it("matches whole words only", () => {
    const drives = [drive("Linear"), drive("Linearity Labs")];
    assert.deepEqual(companies(selectModelContext("Linearity Labs called me", drives)), ["Linearity Labs"]);
  });

  it("falls back to a few recent active drives for vague messages", () => {
    const drives = [drive("A"), drive("B", { stage: "withdrawn" }), ...Array.from({ length: 15 }, (_, i) => drive(`Co ${i}`))];
    const context = selectModelContext("I reached the next round", drives);
    assert.equal(context.length, MODEL_CONTEXT_LIMIT);
    assert.equal(context.some((item) => item.companyName === "B"), false);
  });

  it("matches names written in other scripts", () => {
    assert.deepEqual(companies(selectModelContext("टाटा से इंटरव्यू कॉल आया", [drive("टाटा"), drive("Acme")])), ["टाटा"]);
  });
});
