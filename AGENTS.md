<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# dolu bolu repository guide

This file is the canonical project brief for coding agents.

## Product vision

dolu bolu is a trusted personal career-operations assistant for job seekers. It turns ordinary language into organized, reviewable actions: recording applications, scheduling interviews, and creating follow-up tasks. The product should reduce administrative work around a job search without taking control away from the user.

The long-term product may grow into a broader professional-life assistant. A hiring-manager assistant is a possible future direction, but it is not part of the current product. Build dolu bolu well before creating a second side of the platform.

The portfolio goal matters: this should demonstrate thoughtful product scoping, full-stack engineering, secure data design, useful AI integration, testing, and operational maturity. Prefer a small, dependable workflow over a wide collection of shallow AI features.

## Current scope

V1 is a job-seeker command center with:

- Google sign-in through Supabase Auth.
- A conversational inbox as the primary input.
- Structured forms as a reliable manual alternative.
- Application, interview, and task records.
- AI-generated, editable action proposals.
- Explicit confirmation before any proposal becomes a stored record.
- Clear activity history and failure recovery.

The first end-to-end milestone is:

1. A user signs in.
2. They enter a message such as "I applied to Acme for frontend engineer yesterday."
3. dolu bolu proposes a typed application action.
4. The user reviews or edits it.
5. Only an explicit confirmation creates the record.
6. The new record remains visible after reload.

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
- Never silently send user data to a fallback AI vendor. Provider changes are explicit configuration choices.
- Send only bounded, relevant context to a model. Never send an entire job-search history when a small matching subset is sufficient.
- Unknown information stays unknown. Ask for clarification instead of inventing companies, roles, dates, times, or entity links.
- Store secrets only in server environment variables. Mark secret-bearing and data-access modules with `import "server-only"`.
- Do not log raw resumes, full user messages, provider keys, auth tokens, or unnecessary personally identifiable information.
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
- `src/features`: domain contracts and feature UI.
- `src/server/ai`: provider-independent orchestration and provider adapters.
- `src/server/repositories`: owner-scoped persistence only.
- `src/server/services`: authorization-aware workflows and deterministic execution.
- `src/server/supabase`: cookie-bound server client utilities.
- `src/lib`: small shared utilities that contain no privileged data access.
- `supabase/migrations`: the reproducible database source of truth.
- `tests`: unit and integration coverage; sanitized AI evaluation fixtures belong under `evals` when introduced.

Browser components must not import server modules, provider SDKs, database credentials, or service-role clients. Route handlers should parse the request, call a server service, and return the smallest DTO the UI needs.

## AI contract

`ActionProposalProvider` is the stable application-facing boundary. Provider-specific SDK types stay inside adapters. The default development adapter is deterministic and requires no key; Gemini is the intended first hosted adapter, with Groq or OpenAI added behind the same contract only when justified by evaluations.

Supported V1 proposal kinds are intentionally narrow:

- `create_application`
- `create_interview`
- `create_task`

Provider output is untrusted even when a vendor offers structured output. Validate it centrally with Zod, then run semantic checks in application code. Each proposal includes source evidence and visible assumptions; do not display invented confidence percentages.

If an action lacks information required for safe execution, return a clarification decision. Unsupported or destructive instructions must not be converted into another action.

## Data model direction

Core owner-scoped tables are `profiles`, `applications`, `interviews`, `tasks`, `proposal_batches`, `action_proposals`, and `activity_events`.

Store timestamps as `timestamptz`. Store the user's IANA timezone separately. An interview may exist without an application so conversational capture does not require a fragile cross-proposal dependency. Future Calendar integration stores the external event ID and sync status on the interview; it must use separate OAuth consent from sign-in.

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
npm run build
```

Before changing framework code, read the version-matched guides in `node_modules/next/dist/docs/` as required by the generated rule above.

## Definition of done

A feature is not complete until its happy path and important failure paths work, inputs and ownership are validated, loading/empty/error states are understandable, relevant tests pass, and the documentation or environment template is updated. Never call a prototype interaction "persisted" unless it survives reload through the configured database.
