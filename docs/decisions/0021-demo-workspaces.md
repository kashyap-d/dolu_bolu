# 0021 — Demo workspaces through anonymous sign-in

**Status:** Implemented (`20261017000000_demo_workspaces.sql`)

## Context
A portfolio project needs to be tried by people who will not sign in with Google, such as recruiters, reviewers, and friends. The no-Supabase preview is in-memory, uses the template provider, and shows none of the persistence, agenda, or real AI.

## Decision
- "Try a demo workspace" signs the visitor in with Supabase **anonymous sign-in**. Each visitor gets their own user, and RLS isolates them exactly as it does real users.
- `seed_demo_workspace` fills the new workspace with six sample drives dated relative to now: an interview tomorrow, an OA this week, a loose end, a planned role with an apply-by date, a quiet drive, and a rejection. It refuses real accounts and already-seeded workspaces. Sample activity is labelled "Sample data".
- Hosted AI is real for demo users, but bounded: a smaller per-user allowance and a shared daily pool for all demo users (`consume_ai_request`), on top of Supabase's per-IP sign-in rate limits.
- `delete_expired_demo_accounts`, run nightly by `pg_cron`, deletes demo users older than 7 days; cascades remove their data.
- A banner marks the demo and offers to leave it and sign in with Google. Converting a demo into a real account is out of scope.

## Alternatives
- One shared demo login: visitors see and overwrite each other's data, and it needs constant resets.
- A demo that uses the template provider: no spend, but it makes the AI look like a toy (0007).

## Consequences
Anyone can create users in the project, so CAPTCHA is the next step if abuse appears. The shared pool means a busy day can exhaust the demo's AI. The app says so and keeps manual entry available.
