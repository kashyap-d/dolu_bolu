# 0008 — One proposal per message

**Status:** Implemented

## Decision
Contracts previously accepted 1–5 proposals and then rejected more than one. Decisions are now `{ kind: "proposal", proposal }`, and the provider-facing draft no longer carries a `ref`. The `proposal_batches` table stays because it anchors request idempotency; `action_ref` is always `draft:1`.

## Consequences
Simpler types and UI. Multi-update messages remain an explicit non-goal until evaluations show demand.
