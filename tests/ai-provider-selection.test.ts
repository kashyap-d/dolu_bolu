import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { getActionProposalProvider } from "../src/server/ai/get-provider";

const originalProvider = process.env.AI_PROVIDER;
process.env.GEMINI_API_KEY ??= "test-key";

describe("AI provider selection", () => {
  afterEach(() => {
    if (originalProvider === undefined) delete process.env.AI_PROVIDER;
    else process.env.AI_PROVIDER = originalProvider;
  });

  it("never reaches a hosted model from the unauthenticated preview", () => {
    process.env.AI_PROVIDER = "gemini";
    const provider = getActionProposalProvider({ allowHosted: false });
    assert.equal(provider.isDemo, true);
  });

  it("uses the configured hosted provider for authenticated requests", () => {
    process.env.AI_PROVIDER = "gemini";
    const provider = getActionProposalProvider({ allowHosted: true });
    assert.equal(provider.name, "gemini");
  });

  it("keeps the demo provider when it is configured", () => {
    process.env.AI_PROVIDER = "demo";
    assert.equal(getActionProposalProvider({ allowHosted: true }).isDemo, true);
  });
});
