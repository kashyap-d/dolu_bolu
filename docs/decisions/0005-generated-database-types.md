# 0005 — Generated database types

**Status:** Implemented

## Decision
Type the Supabase client with `src/server/supabase/database.types.ts`, so a renamed or mistyped column fails at compile time. Keep Zod for JSON columns (proposal payloads, activity metadata), for RPC results (untyped JSON), and for values the database stores as plain text but the domain treats as enums.

The file is produced by `npm run db:types` (`scripts/generate-db-types.ts`), not the Supabase CLI. The script applies every migration to the same throwaway Postgres database the tests use and reads the catalog. It emits the CLI's shape, with one deliberate difference: function arguments admit `null`, because SQL arguments do and our functions rely on it.

## Alternatives
`supabase gen types` against a local stack (needs Docker) or the hosted project (needs an access token, and reflects whatever was last applied there rather than the migrations in the branch).

## Consequences
The repositories' hand-written row schemas are gone. CI regenerates the file and fails if it differs from the committed copy, so types cannot drift from migrations.
