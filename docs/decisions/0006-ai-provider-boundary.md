# 0006 — AI provider boundary

**Status:** Implemented

## Decision
- `ActionProposalProvider` is the only application-facing AI interface. Provider SDK and HTTP types stay inside adapters.
- Gemini is called over plain `fetch` (no SDK) with an injected fetcher for tests, low temperature, an explicit timeout, and mapped error codes. There is no silent vendor fallback.
- The Gemini response schema is generated from the shared Zod schema (`z.toJSONSchema` → `toGeminiSchema`). The transform switches `oneOf`→`anyOf` and `const`→`enum`, collapses nullable unions, and drops keywords Gemini does not need (date patterns, lengths). Zod re-validates every response, so dropped keywords are still enforced. Field guidance for the model lives as `.describe()` text on the shared schema.
- Provider or model changes need `npm run eval:ai` results. Cases marked `languageModelOnly` (free-form or pasted text) are skipped, and reported as skipped, for the deterministic provider. The script backs off and retries on rate limits.

## Consequences
One dependency-free adapter that is easy to test, and one schema source instead of two.
