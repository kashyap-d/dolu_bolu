# 0006 — AI provider boundary

**Status:** Accepted; schema derivation planned

## Decision
- `ActionProposalProvider` is the only application-facing AI interface. Provider SDK and HTTP types stay inside adapters.
- Gemini is called over plain `fetch` (no SDK) with an injected fetcher for tests, low temperature, an explicit timeout, and mapped error codes. There is no silent vendor fallback.
- The Gemini response JSON schema will be generated from the shared Zod schema (`z.toJSONSchema`) and adjusted for Gemini's supported subset, replacing the hand-written copy.
- Provider or model changes need `npm run eval:ai` results. Evals grow toward realistic pasted input and record results per model.

## Consequences
One dependency-free adapter that is easy to test, and one schema source instead of two.
