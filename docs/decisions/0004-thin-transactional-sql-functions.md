# 0004 — Thin transactional SQL functions

**Status:** Accepted; constraint migration planned

## Context
A confirmed change touches the drive, its assessment and interview rows, the proposal state, and the activity log atomically. PostgREST cannot run multi-statement transactions, so these writes live in `security definer` functions callable by authenticated users.

The trust boundary is that **the model cannot write without the user's approval**. It is not that the user cannot write their own data: the manual editor already allows that. Users calling these functions directly is therefore not a privilege escalation, and SQL-side checks protect **data integrity**, not security.

## Decision
- Keep transactional writes in SQL functions.
- Move value rules (allowed stages and statuses, lengths, URL shape, date ordering) into table `CHECK` constraints, defined once.
- Functions keep only structural checks (expected keys and JSON types), locking, optimistic concurrency, the write, and the activity append. Constraint violations map to `invalid_payload`.
- Executable integration tests cover these functions (see 0012).

## Alternatives
A direct Postgres connection with transactions in TypeScript. Rejected for now: keeping RLS means setting role and JWT claims in every transaction, and serverless connection pooling adds operational cost.

## Consequences
Less PL/pgSQL to maintain, one source of truth for value rules. Stage ordering still exists in SQL and TypeScript; a parity test guards it.
