# 0004 — Thin transactional SQL functions

**Status:** Implemented (`20261015000000_job_drive_correctness.sql`)

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

## Implementation notes
- `json_shape_is` checks keys and JSON types; `iso_date` / `iso_timestamp` accept only ISO 8601 strings, because Postgres itself accepts `now`, `yesterday`, and `infinity` as dates.
- The duplicate check runs last and rolls back the whole write with a private SQLSTATE (`DL001`), so invalid input is always reported as invalid, never as a duplicate.
- Timestamp defaults use `now()`. The previous `timezone('utc', now())` produced a zone-less value that each session reinterpreted in its own zone.

## Consequences
Less PL/pgSQL to maintain, one source of truth for value rules. Stage ordering still exists in SQL and TypeScript; a parity test guards it.
