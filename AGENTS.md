<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# dolu bolu repository guide

This file is the canonical project brief for coding agents.

## Product vision

dolu bolu is a trusted personal career-operations assistant for job seekers. Its core entity is a **Job Drive**: one user's hiring process for a specific company and role. It turns ordinary-language progress updates into reviewable changes across `planned → applied → assessment → interview → offer → accepted`, with rejection or withdrawal possible from any active stage.

The long-term product may grow into a broader professional-life assistant. A hiring-manager assistant is a possible future direction, but it is not part of the current product. Build dolu bolu well before creating a second side of the platform.

The portfolio goal matters: this should demonstrate thoughtful product scoping, full-stack engineering, secure data design, useful AI integration, testing, and operational maturity. Prefer a small, dependable workflow over a wide collection of shallow AI features.

## Current scope

V1 is a job-seeker command center with:

- Google sign-in through Supabase Auth.
- A conversational inbox as the primary input.
- Structured forms as a reliable manual alternative.
- Job Drive records with optional application date and apply-by date, one assessment detail record, and a list of interview rounds.
- AI-generated, editable action proposals.
- Explicit confirmation before any proposal becomes a stored record.
- Clear activity history and failure recovery.

The first end-to-end milestone is:

1. A user signs in.
2. They enter a message such as "I applied to Acme for frontend engineer yesterday."
3. dolu bolu proposes a typed `record_job_drive_progress` action.
4. The user reviews or edits it.
5. Only an explicit confirmation creates or updates the drive and its detail records.
6. The drive and immutable activity event remain visible after reload.

## Current implementation state

As of October 2026 (Phases 0–3 of the plan in `README.md` are complete):

- `/login` starts Google OAuth; `/auth/callback` performs the PKCE exchange; `src/proxy.ts` refreshes sessions and guards `/app` routes. `/app/applications` redirects to `/app/drives` via `next.config.ts`.
- `src/app/app/layout.tsx` authenticates once and renders the shared app shell. `/app` (command center), `/app/drives` (list) and `/app/drives/[driveId]` (detail and activity) each load only the data they render; `error.tsx` and `loading.tsx` cover failures and slow loads.
- Views write through a `WorkspaceGateway` and navigate through `WorkspaceLink`. The signed-in gateway calls the API and then `router.refresh()`, so the UI re-renders from the database. The no-Supabase preview at `/` reuses the same views with an in-memory gateway.
- Route handlers are built on `src/server/http.ts` (authentication, JSON parsing, Zod validation, retryable 503 on `RepositoryError`). The browser calls them only through `src/features/workspace/api-client.ts`.
- One message yields at most one proposal. `resolveProposal` is a pure function that resolves the target drive, merges details, and refuses unrequested corrections or regressions.
- Hosted AI calls need an authenticated user and a reserved unit of the daily allowance (`consume_ai_request`, `AI_DAILY_REQUEST_LIMIT`). The deterministic provider is a test stand-in and the preview's only provider.
- Manual saves and AI confirmation/rejection use narrow `security definer` Postgres functions. Each confirmed mutation atomically changes the drive/details and appends immutable field-level activity. Creates are idempotent via client UUIDs; edits use `updatedAt` for optimistic concurrency.
- Likely duplicates are warnings, not hard constraints. Backward moves and reopening terminal drives require an explicit audited correction.
- UI is built from tokens in `src/app/globals.css` and primitives in `src/components/ui`. Do not use raw hex colours in components.
- `appliedAt` and `applyBy` are calendar dates (`YYYY-MM-DD`); other event fields are timestamps with offsets. Render dates with `LocalDate` and timestamps with `LocalDateTime`.
- Company and role matching uses `src/features/job-drives/normalize.ts`, which must stay identical to the SQL `normalize_*` functions (a database test checks parity). The model sees only `selectModelContext` output.
- Value rules live in table `CHECK` constraints; SQL functions check JSON structure, lock, write, and append activity. The Supabase client is typed from `src/server/supabase/database.types.ts`. Regenerate it with `npm run db:types` after every migration.
- Interview rounds are a list per drive (max 10). Payloads carry the complete list; the AI proposes one `interviewRound` that `mergeProposedRound` folds into the existing ones.
- The command center shows an agenda (`buildAgenda`): loose ends, the next 14 days by day, and drives quiet for 21+ days. It renders in the browser only because it depends on the viewer's clock and zone.
- Messages may be pasted emails or invites up to 8,000 characters. `redactContactDetails` removes email addresses and phone numbers on the server before the provider, evidence checks, or storage see the text.
- Demo workspaces: `/auth/demo` signs in anonymously and calls `seed_demo_workspace`. `principal.isAnonymous` drives the demo banner. Demo users have smaller AI allowances plus a shared daily pool, and `delete_expired_demo_accounts` (pg_cron) removes them after 7 days. Deployment steps are in `docs/deployment.md`.
- `/app/settings` ("Your data") exports all of a user's rows as JSON and deletes the account through `delete_my_account`, which cascades through every user-owned table.
- Calendar, JD briefs, tasks, search, and recruiter-facing controls are hidden rather than presented as working features.

Before calling the hosted slice operational, apply every migration in `supabase/migrations` in order (through `20261017000000_demo_workspaces.sql`), configure OAuth redirect URLs, and run all quality gates with the selected provider.

## Explicit non-goals for V1

- A general job marketplace or local-gigs marketplace.
- Recruiter-facing features.
- Autonomous job applications, emails, messages, or destructive actions.
- Resume scoring, job scraping, or URL ingestion.
- Two-way calendar synchronization. Calendar writes are a later, separately authorized integration.
- LangGraph or another workflow framework before the typed single-agent workflow requires it.
- AI features added only for novelty or resume keywords.

## Trust and safety invariants

- The model may interpret context and propose actions; it may never write directly to Postgres, Calendar, email, or another external system.
- Every mutation is performed by deterministic, allowlisted application code after explicit user confirmation.
- Treat every route handler and server action as a public endpoint. Re-authenticate, authorize ownership, and validate input inside the trusted server boundary.
- Confirmation is idempotent. A repeated request must return the original result and never create duplicate records.
- Hosted AI calls require an authenticated user and a reserved daily allowance; the unauthenticated preview only uses the deterministic provider.
- Never silently send user data to a fallback AI vendor. Provider changes are explicit configuration choices.
- Send only bounded, relevant context to a model. Never send an entire job-search history when a small matching subset is sufficient.
- Unknown information stays unknown. Ask for clarification instead of inventing companies, roles, dates, times, or entity links.
- Store secrets only in server environment variables. Mark secret-bearing and data-access modules with `import "server-only"`.
- Do not log raw resumes, full user messages, provider keys, auth tokens, or unnecessary personally identifiable information. Contact details in pasted text are removed before they reach a model or the database.
- All user-owned database tables require Row Level Security policies and ownership checks.

## Architecture boundaries

Use Next.js App Router with strict TypeScript, Supabase Auth/Postgres/RLS, Zod at trust boundaries, and a feature-oriented directory structure.

The intended request flow is:

```text
message + bounded user context
  -> selected ActionProposalProvider
  -> shared schema validation
  -> deterministic domain validation
  -> persisted pending proposal
  -> editable confirmation UI
  -> idempotent deterministic executor
  -> domain record + activity event
```

Keep these responsibilities separate:

- `src/app`: routes, layouts, and thin route handlers.
- `src/features`: domain contracts and feature UI (`assistant`, `job-drives`, `workspace`).
- `src/components/ui`: design-system primitives with no domain knowledge.
- `src/server/ai`: provider-independent orchestration and provider adapters.
- `src/server/repositories`: owner-scoped persistence only.
- `src/server/services`: authorization-aware workflows and deterministic execution.
- `src/server/http.ts`: shared route-handler plumbing; new route handlers should use it.
- `src/server/supabase`: cookie-bound server client utilities.
- `src/lib`: small shared utilities that contain no privileged data access.
- `supabase/migrations`: the reproducible database source of truth.
- `docs/decisions`: architecture decision records. Read the relevant record before changing a decided area, and add a superseding record instead of contradicting one silently.
- `tests`: unit tests; `tests/db`: database tests against the migrations on plain Postgres; `e2e`: Playwright tests against the preview; `evals`: sanitized AI evaluation cases.

Browser components must not import server modules, provider SDKs, database credentials, or service-role clients. Route handlers should parse the request, call a server service, and return the smallest DTO the UI needs.

## AI contract

`ActionProposalProvider` is the stable application-facing boundary. Provider-specific SDK types stay inside adapters. The deterministic adapter requires no key and backs tests, evals, and the preview; Gemini is the hosted adapter, with Groq or OpenAI added behind the same contract only when justified by evaluations.

The only supported proposal kind in the current product is `record_job_drive_progress`. It can match or create a drive, advance its stage, attach OA details, or add or update one interview round in one reviewed transaction. Exactly one proposal per message (docs/decisions/0008).

Provider output is untrusted even when a vendor offers structured output. Validate it centrally with Zod, then run semantic checks in application code. Each proposal includes source evidence and visible assumptions; do not display invented confidence percentages.

If an action lacks information required for safe execution, return a clarification decision. Unsupported or destructive instructions must not be converted into another action.

## Data model direction

Core owner-scoped tables are `profiles`, `job_drives`, `job_drive_assessments`, `interviews`, `proposal_batches`, `action_proposals`, `activity_events`, and `ai_usage_daily` (per-user daily hosted-AI allowance). The legacy `tasks` table remains in the migration history but task workflows are deferred.

Store timestamps as `timestamptz`; unknown dates stay null. Assessments and interviews belong to a drive and use composite owner FKs. Each `interviews` row is one round with a title, kind, and status. Future Calendar integration must use separate OAuth consent from sign-in and per-event approval.

## UX principles

- The main screen is a calm command center, not an analytics dashboard filled with vanity charts.
- Chat is the fastest input, not the only input. Every AI-assisted workflow needs a clear manual path.
- Always show exactly what will change before confirmation.
- Make assumptions, uncertainty, provider failures, and sync failures legible and recoverable.
- Use accessible semantic HTML, visible focus states, keyboard-friendly controls, and responsive layouts.
- Keep copy direct and human. Avoid claiming that dolu bolu "does everything" or guarantees hiring outcomes.

## Engineering conventions

- Use strict TypeScript; avoid `any`. Prefer inferred types from shared Zod schemas.
- Validate at every boundary: HTTP input, provider output, environment configuration, and database-returned JSON payloads.
- Keep React Server Components by default and add `"use client"` only at the smallest interactive boundary.
- Prefer pure functions for parsing, normalization, validation, and action execution decisions.
- Do not duplicate domain enums or DTO shapes across client and server.
- Add a regression test with every bug fix.
- Do not add a dependency when a small, clear implementation is safer.
- Use migrations for schema changes; never rely on manual dashboard-only database edits.
- Preserve the generated Next.js agent-rules block at the top of this file.

## Local commands

Use Node.js 22.13 or newer and npm.

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm test
npm run test:db
npm run test:e2e
npm run eval:ai
npm run build
```

Before changing framework code, read the version-matched guides in `node_modules/next/dist/docs/` as required by the generated rule above.

## Definition of done

A feature is not complete until its happy path and important failure paths work, inputs and ownership are validated, loading/empty/error states are understandable, relevant tests pass, and the documentation or environment template is updated. Never call a prototype interaction "persisted" unless it survives reload through the configured database.
