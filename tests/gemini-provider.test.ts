import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AiProviderError } from "../src/server/ai/action-proposal-provider";
import {
  GeminiActionProposalProvider,
  type GeminiProviderConfig,
} from "../src/server/ai/providers/gemini";

const config: GeminiProviderConfig = {
  apiKey: "test-key",
  model: "gemini-test",
  timeoutMs: 1_000,
  maxOutputTokens: 800,
};

const input = {
  message: "I applied to Acme for Frontend Engineer yesterday.",
  now: "2026-09-15T12:00:00.000Z",
  timeZone: "Asia/Kolkata",
  locale: "en-IN",
  context: { applications: [] },
};

function successfulResponse() {
  return new Response(
    JSON.stringify({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  kind: "proposals",
                  proposals: [
                    {
                      ref: "draft:1",
                      kind: "create_application",
                      summary: "Record Frontend Engineer application at Acme",
                      evidence: [
                        { fieldPath: "companyName", quote: "Acme" },
                        { fieldPath: "roleTitle", quote: "Frontend Engineer" },
                      ],
                      assumptions: ["Yesterday was resolved using the supplied time."],
                      payload: {
                        companyName: "Acme",
                        roleTitle: "Frontend Engineer",
                        status: "applied",
                        appliedAt: "2026-09-14T12:00:00.000Z",
                        sourceUrl: null,
                        notes: null,
                      },
                    },
                  ],
                }),
              },
            ],
          },
          finishReason: "STOP",
        },
      ],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("Gemini action proposal provider", () => {
  it("uses server credentials and parses a valid structured decision", async () => {
    let apiKey: string | null = null;
    let requestBody: unknown;
    const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
      apiKey = new Headers(init?.headers).get("x-goog-api-key");
      requestBody = JSON.parse(String(init?.body));
      return successfulResponse();
    }) as typeof fetch;
    const provider = new GeminiActionProposalProvider(config, fetcher);

    const result = await provider.propose(input);

    assert.equal(apiKey, "test-key");
    assert.equal(result.metadata.provider, "gemini");
    assert.equal(result.decision.kind, "proposals");
    assert.equal(
      typeof requestBody === "object" && requestBody !== null,
      true,
    );
  });

  it("maps rate limiting to a retryable provider error", async () => {
    const fetcher = (async () => new Response(null, { status: 429 })) as typeof fetch;
    const provider = new GeminiActionProposalProvider(config, fetcher);

    await assert.rejects(provider.propose(input), (error: unknown) => {
      assert.equal(error instanceof AiProviderError, true);
      if (!(error instanceof AiProviderError)) return false;
      assert.equal(error.code, "RATE_LIMITED");
      assert.equal(error.retryable, true);
      return true;
    });
  });

  it("maps an unavailable model ID to a non-retryable configuration error", async () => {
    const fetcher = (async () => new Response(null, { status: 404 })) as typeof fetch;
    const provider = new GeminiActionProposalProvider(config, fetcher);

    await assert.rejects(provider.propose(input), (error: unknown) => {
      assert.equal(error instanceof AiProviderError, true);
      if (!(error instanceof AiProviderError)) return false;
      assert.equal(error.code, "CONFIGURATION");
      assert.equal(error.retryable, false);
      return true;
    });
  });

  it("rejects schema-invalid model output", async () => {
    const fetcher = (async () =>
      new Response(
        JSON.stringify({
          candidates: [
            { content: { parts: [{ text: '{"kind":"proposals"}' }] } },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )) as typeof fetch;
    const provider = new GeminiActionProposalProvider(config, fetcher);

    await assert.rejects(provider.propose(input), (error: unknown) => {
      assert.equal(error instanceof AiProviderError, true);
      if (!(error instanceof AiProviderError)) return false;
      assert.equal(error.code, "INVALID_OUTPUT");
      return true;
    });
  });
});
