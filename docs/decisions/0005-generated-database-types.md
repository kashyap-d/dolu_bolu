# 0005 — Generated database types

**Status:** Planned

## Decision
Generate `src/server/supabase/database.types.ts` with `supabase gen types typescript` and type the clients with it, so a column rename fails at compile time. Keep Zod for JSON columns (proposal payloads, activity metadata) and for RPC results, which are untyped JSON.

## Consequences
Hand-written row schemas in repositories shrink. Regenerate types as part of every migration.
