# 0003 — Supabase with user-scoped access

**Status:** Accepted

## Decision
Supabase provides Google OAuth (PKCE, cookie sessions via `@supabase/ssr`), Postgres, and RLS. Server code queries as the signed-in user, never with a service-role key, so RLS is a second line of defense behind application checks.

## Alternatives
Neon + Drizzle + Auth.js: more control, considerably more code to own for the same guarantees.

## Consequences
Coupling to Supabase's auth and PostgREST. Every user-owned table needs RLS and owner-composite foreign keys. Confirm the project uses asymmetric JWT signing keys so `getClaims()` verifies locally; the proxy and each handler both verify.
