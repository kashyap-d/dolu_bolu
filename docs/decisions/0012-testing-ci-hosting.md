# 0012 — Testing, CI, and hosting

**Status:** CI implemented; test layers and hosting planned

## Decision
- **Unit:** `node:test` + `tsx` for pure domain logic, including proposal materialisation (to be extracted from the service).
- **Database integration:** tests against `supabase start` that call the RPCs as two different users: idempotent confirmation, version conflicts, RLS isolation, and the AI quota.
- **End to end:** one Playwright test for the definition-of-done flow: sign in, message, confirm, reload, drive still present.
- **CI:** GitHub Actions runs lint, typecheck, tests, key-free evals, and build on every PR (`.github/workflows/ci.yml`).
- **Hosting:** Vercel, with Supabase hosted. Production secrets live only in Vercel environment variables.

## Consequences
The test pyramid matches the risk: most logic is pure, the riskiest writes are SQL, and one browser test proves persistence.
