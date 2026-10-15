# 0012 — Testing, CI, and hosting

**Status:** Implemented except hosting

## Decision
- **Unit:** `node:test` + `tsx` for pure domain logic, including proposal materialisation (to be extracted from the service).
- **Database integration:** `npm run test:db` calls the SQL functions as different users through the `authenticated` role (see 0016).
- **End to end:** `npm run test:e2e` runs Playwright against the no-sign-in preview on desktop and mobile, in time zones on either side of UTC. The signed-in flow needs Google OAuth, so it stays a manual acceptance pass; the database tests cover what it would add.
- **CI:** GitHub Actions runs three jobs on every PR: quality (lint, typecheck, unit tests, key-free evals, build), database (Postgres 17 service, database tests, generated-types freshness), and e2e (Playwright).
- **Hosting:** Vercel, with Supabase hosted. Production secrets live only in Vercel environment variables.

## Consequences
The test pyramid matches the risk: most logic is pure, the riskiest writes are SQL, and one browser test proves persistence.
