# dolu bolu

dolu bolu is a personal career-operations assistant for early-career job seekers. It tracks each company-and-role hiring process as one **Job Drive** — planned → applied → assessment → interview → offer → accepted, or rejected/withdrawn at any point. You can update a drive with a form, or describe what happened in plain language and review the structured change before anything is saved.

It is deliberately not a job marketplace, an autonomous application bot, or a chatbot with unrelated AI features.

## How it works

The model interprets; it never writes.

```text
message + a bounded slice of your drives
  -> ActionProposalProvider (Gemini, or a deterministic stand-in)
  -> shared Zod schema            (provider output is untrusted)
  -> resolveProposal              (match the drive, merge details, block silent regressions)
  -> pending proposal             (persisted, idempotent per request)
  -> editable review card
  -> your explicit confirmation
  -> one atomic SQL function      (drive + OA/interview details + immutable activity)
```

Manual edits take the same final step. Every architectural choice and its trade-offs is recorded in [`docs/decisions`](docs/decisions/README.md); the detailed request trace is in [`WORKFLOW.md`](WORKFLOW.md).

## What works today

- Google sign-in (Supabase, cookie-bound PKCE) and a protected workspace at `/app`.
- A command center whose main input accepts your own words or a pasted OA invite, recruiter email, or interview invitation. Email addresses and phone numbers are removed before anything is sent or saved.
- An agenda of what needs you next: loose ends (a round that has passed but is still marked scheduled, missed OA or apply-by dates), the next two weeks by day, and drives that have gone quiet.
- A drive list and a drive page with an interactive stage bar, OA details, interview rounds as a list, and an activity history.
- "Your data": export everything as JSON, or permanently delete your account.
- Retry-safe creates, optimistic concurrency on edits, duplicate warnings that recognise "Globex Pvt. Ltd." and "globex" as the same company, and explicitly audited corrections for backward moves.
- Day-precision facts (applied on, apply by) stored as calendar dates in your own time zone.
- Row Level Security on every user table; the browser cannot write tables directly.
- A per-user daily cap on hosted AI requests.
- Demo workspaces: visitors can try a private, seeded workspace without an account. It is deleted after 7 days, and its AI use is capped.
- A no-sign-in local preview at `/` when Supabase is not configured. It always uses the deterministic provider and stores nothing.

## Project structure

```text
src/app                 routes, layouts, thin route handlers
src/components/ui       design-system primitives (Button, Card, Field, Notice, …)
src/features/assistant  proposal contracts, resolution logic, command center
src/features/job-drives domain contracts, stage rules, matching, drive views
src/features/workspace  app shell, navigation, gateway (HTTP or in-memory), API client
src/server/ai           provider boundary and adapters
src/server/repositories owner-scoped persistence
src/server/services     authorization-aware workflows
src/server/http.ts      shared route-handler plumbing (auth, validation, errors)
supabase/migrations     the database source of truth
tests                   unit tests; tests/db holds database tests
e2e                     Playwright tests against the local preview
evals                   sanitized AI evaluation cases
scripts                 eval runner, database type generator, test-database helper
```

## Run locally

Requires Node.js 22.13+ and npm.

```bash
cp .env.example .env.local
npm install
npm run dev
```

With the template values, [http://localhost:3000](http://localhost:3000) opens the in-memory preview — no keys needed.

### Connect Supabase

1. Create a Supabase project. Set `NEXT_PUBLIC_SUPABASE_URL` (the base URL, without `/rest/v1`) and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local`.
2. Apply the migrations with the Supabase CLI: `npx supabase login`, `npx supabase link --project-ref <project-ref>`, then `npm run db:push`. `npm run db:status` shows what is applied. See [`docs/deployment.md`](docs/deployment.md) if the project was previously migrated by hand.
3. Enable the Google provider in Supabase Authentication, and add `https://<project-ref>.supabase.co/auth/v1/callback` to the Google OAuth client.
4. In Supabase URL Configuration, set the Site URL to `http://localhost:3000` and allow `http://localhost:3000/auth/callback`.
5. Restart `npm run dev`. `/` now redirects to `/app`.

### Use Gemini

1. Add a server-only `GEMINI_API_KEY` (never `NEXT_PUBLIC_`) and set `AI_PROVIDER=gemini`.
2. Run `npm run eval:ai` before using real messages.
3. Optionally tune `AI_MODEL`, `AI_TIMEOUT_MS`, `AI_MAX_OUTPUT_TOKENS`, and `AI_DAILY_REQUEST_LIMIT`.

The provider receives only the message (with email addresses and phone numbers removed), the current time/time zone/locale, and a few summaries of your own drives: those at companies the message names, or up to 10 recent active ones if it names none. There is no silent fallback to another vendor. Check Google's current [Gemini terms and pricing](https://ai.google.dev/gemini-api/docs/pricing); free-tier inputs may be used to improve Google products, so don't test with sensitive data.

### Deploy

See [`docs/deployment.md`](docs/deployment.md) for Vercel and Supabase setup, including the optional demo workspaces and their AI limits.

## Quality gates

```bash
npm run lint
npm run typecheck   # generates Next route types, then runs tsc
npm test            # unit tests
npm run test:db     # database tests; needs PostgreSQL 15+ installed locally, or TEST_DATABASE_URL
npm run test:e2e    # Playwright; run `npx playwright install chromium` once
npm run eval:ai     # uses the configured provider
npm run build
```

After changing a migration, run `npm run db:types` to regenerate `src/server/supabase/database.types.ts`. CI runs everything above with the deterministic provider and fails if the generated types are stale.

## Roadmap

| Phase | Outcome |
| --- | --- |
| 0. Cleanup — done | Legacy application slice removed, AI quota, CI, decision records. |
| 1. Structure — done | App shell layout, gateway/navigation abstractions, typed API client, shared route helper, design tokens and primitives, single-proposal contract, tested proposal resolution. |
| 2. Correctness — done | Date-only fields, normalised drive matching, relevance-based model context, value rules as table constraints, generated database types, Gemini schema derived from Zod, database and end-to-end tests in CI. |
| 3. Product — done | Agenda home screen with loose ends and quiet drives, paste-anything extraction with contact-detail redaction, interview rounds as a list, data export and account deletion. |
| 4. Deploy — in progress | Demo workspaces and the deployment guide are done; the Vercel project and domain are set up by hand (docs/deployment.md). |
| Next | A smaller client bundle, reminders for loose ends (with explicit consent), Calendar sync per interview round. |
| Later | Separately authorized Calendar sync, an evidence-grounded application brief. |

A marketplace, autonomous applications, inbox-wide email access, and a recruiter-facing product are out of scope.
