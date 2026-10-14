# 0008 — One proposal per message

**Status:** Planned

## Decision
Contracts currently accept 1–5 proposals per message, then the service rejects more than one. Change the contracts to exactly one proposal. Keep the `proposal_batches` table, since it also anchors request idempotency.

## Consequences
Simpler types and UI. Multi-update messages remain an explicit non-goal until evaluations show demand.
