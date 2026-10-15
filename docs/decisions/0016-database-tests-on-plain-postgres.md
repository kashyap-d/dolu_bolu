# 0016 — Database tests on plain Postgres

**Status:** Implemented

## Context
The riskiest logic is in SQL: atomic writes, idempotency, optimistic concurrency, correction rules, duplicate detection, and row-level security. It was covered only by regex assertions over migration text. The Supabase local stack needs Docker, which is slow to start and not always running.

## Decision
- `tests/db/supabase-shim.sql` recreates the small part of Supabase the migrations use: the `anon`, `authenticated`, and `service_role` roles, `auth.users`, `auth.uid()` from JWT claims, and Supabase's default privileges.
- `tests/db/harness.ts` creates a fresh database, applies the shim and every migration in order, and runs queries as a given user through the `authenticated` role, the way PostgREST does. It can stop before a migration to test data conversions.
- `scripts/with-test-db.sh` starts a throwaway cluster when `TEST_DATABASE_URL` is unset (any local PostgreSQL 15+). CI uses a Postgres service container.
- The same harness generates the database types (0005).

## Alternatives
`supabase start` with Docker: higher fidelity (real GoTrue and PostgREST), but slow and heavy for every test run. Mocks: would not exercise the SQL at all.

## Consequences
- The suite runs in about a second, and nothing persists between runs.
- The shim can drift from Supabase. It only stands in for identity and grants, and the migrations are also applied to a real Supabase project before release.
- Writing these tests surfaced three real defects, now fixed: Postgres accepting `'yesterday'` as a date, invalid input being reported as a duplicate, and a session-zone-dependent timestamp default.
- Signed-in end-to-end tests are not automated (see 0012).
