# 0007 — AI cost control and demo safety

**Status:** Implemented (`20261014000000_ai_quota_and_legacy_cleanup.sql`)

## Context
Any signed-in user could call the assistant endpoint without limit. Worse, with Supabase unconfigured and `AI_PROVIDER=gemini`, the unauthenticated preview was a public proxy to a paid model.

## Decision
- The unauthenticated preview always uses the deterministic provider (`getActionProposalProvider({ allowHosted: false })`).
- Hosted provider calls reserve one unit from a per-user, per-UTC-day allowance (`consume_ai_request`, default `AI_DAILY_REQUEST_LIMIT=50`) before the provider runs. Idempotent replays and the demo provider do not count.
- Over the limit, the API returns 429 and the UI keeps the message and points to the manual form.
- The deterministic provider is a test double and an offline fallback for development, not the product demo. A public demo uses the real model behind the quota.

## Consequences
Bounded spend per user. A failed provider call still uses one unit; this is accepted, because it also limits retry storms.
