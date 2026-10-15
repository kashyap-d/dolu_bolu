# 0013 — Data export and account deletion

**Status:** Implemented (`/app/settings`, `20261016000000_account_deletion.sql`)

## Decision
The product claims to be private by design, so V1 lets users export all their data (JSON) and delete their account. Deletion cascades through `auth.users` foreign keys and is confirmed explicitly in the UI.

## Implementation
- `GET /api/account/export` returns one JSON file with the profile and every row the user owns, read through their own session (RLS applies).
- `POST /api/account/delete` requires the phrase "delete my account" in the body and calls `delete_my_account`, a `security definer` function that deletes the `auth.users` row; cascades remove the rest. The route then clears the session cookies.
- A database test seeds two users, deletes one, and checks that every table is empty for them and untouched for the other.
- Deleting from `auth.users` inside a database function relies on the `postgres` role's privileges on the `auth` schema, which Supabase grants today. If that changes, switch to the Admin API with a server-only service-role key.

## Consequences
Every new user-owned table must cascade on user deletion and be included in the export.
