# dolu bolu

dolu bolu is a personal career-operations assistant for job seekers. The current release focuses on application tracking: a user can add and update applications manually, or write a message such as “I applied to Acme yesterday” and review the structured action proposed by the assistant before anything is saved.

The longer-term product is a trusted workspace for applications, interviews, and follow-ups. It is deliberately not a job marketplace, an autonomous application bot, or a generic chatbot with unrelated AI features.

## Why this architecture

The model is an interpreter, not an administrator:

```text
message
  -> provider-independent AI adapter
  -> Zod + domain validation
  -> reviewable proposal
  -> explicit user approval
  -> deterministic, idempotent write
```

This keeps provider choice loosely coupled and makes the trust boundary testable. Development works with a deterministic demo provider; Gemini is the intended first free hosted provider. Other vendors can be evaluated behind the same contract without changing the product workflow.

## Current project state

The application vertical slice is working end to end:

```text
Google sign-in
  -> protected workspace
  -> manual form or natural-language message
  -> editable application/proposal
  -> authenticated database mutation
  -> reload-safe application list
```

### Implemented

- Next.js 16 App Router, React 19, TypeScript, and Tailwind CSS.
- Google OAuth through cookie-bound Supabase SSR clients.
- Protected `/app` and `/app/applications` routes with server-side data loading.
- A responsive command center with manual application entry and editable AI proposals.
- Shared schemas for applications, interviews, tasks, and proposal decisions.
- A provider interface, a no-key deterministic development adapter, and a server-only Gemini structured-output adapter.
- Durable pending proposals, atomic/idempotent application confirmation, and rejection through narrow Postgres functions.
- Deterministic manual application entry with retry-safe client IDs, plus editable lifecycle statuses guarded by optimistic concurrency.
- Owner-scoped Row Level Security and a server-authored activity event when an AI proposal is confirmed.
- A reload-safe application list plus local demo mode when Supabase is not configured.
- Unit and contract tests for proposal validation, provider behavior, application payloads, and environment handling.
- Repository-wide product and engineering guidance in `AGENTS.md` and a detailed trace of the AI proposal workflow in `WORKFLOW.md`.

### Engineering decisions worth discussing

| Decision | Why it matters |
| --- | --- |
| The model proposes; deterministic code writes | Prevents unreviewed AI output from mutating user data. |
| Provider-independent contract | Gemini, a local model, or another hosted model can be compared without rewriting the workflow. |
| Schema and semantic validation | Treats model output as untrusted input and catches structurally valid but unsafe actions. |
| Database RPC for proposal confirmation | Makes application creation, proposal completion, and activity recording atomic and retry-safe. |
| Row Level Security | Enforces ownership in the database instead of relying only on UI or route checks. |
| Optimistic concurrency for edits | Detects stale updates rather than silently overwriting a newer application state. |

### Current limitations

- Interviews and follow-up tasks have domain schemas, but do not yet have complete persistence and user workflows.
- Manual application creation and lifecycle edits do not yet write activity events; only confirmed AI-created applications have an audit event.
- The activity log is not yet visible in the interface.
- Tests cover contracts and core logic, but there is no automated browser test suite or CI pipeline yet.
- Provider latency and request IDs are returned, but there is no production observability dashboard or prompt/model regression history.
- Application lists are intentionally simple and currently lack search, filtering, pagination, and duplicate warnings.

## Run locally

Requirements: Node.js 22.13+ and npm.

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). With `AI_PROVIDER=demo`, no API key or Supabase project is required to explore the current interface.

When valid Supabase values are present, `/` redirects to the authenticated workspace. Without them, `/` runs a clearly labeled, in-memory preview.

## Supabase setup

1. Create a Supabase project and copy `.env.example` to `.env.local`.
2. Set `NEXT_PUBLIC_SUPABASE_URL` to the project base URL (for example, `https://<project-ref>.supabase.co`) and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to the public publishable key. Do not include `/rest/v1` in the URL.
3. Apply both SQL files in `supabase/migrations` in filename order. They are the database source of truth; connecting a GitHub repository does not by itself guarantee that they have run against an existing project.
4. In Supabase Authentication, enable Google and add the Google OAuth client ID and secret.
5. In the Google Cloud OAuth web client, add Supabase's callback URL:

   ```text
   https://<project-ref>.supabase.co/auth/v1/callback
   ```

6. In Supabase Authentication URL Configuration, set the local Site URL to `http://localhost:3000` and add this redirect URL:

   ```text
   http://localhost:3000/auth/callback
   ```

Restart `npm run dev` after environment changes. A Gemini key is not needed while `AI_PROVIDER=demo`.

Do not put real credentials in `.env.example` or commit `.env.local`.

## Gemini setup and evaluation

Gemini is an explicit alternative to the deterministic demo provider; there is no silent vendor fallback.

1. Add `GEMINI_API_KEY` to `.env.local`. Keep it server-only—never use a `NEXT_PUBLIC_` prefix.
2. Set `AI_PROVIDER=gemini`. Leave `AI_MODEL` empty to use `gemini-3.5-flash-lite`, or set a reviewed model ID explicitly.
3. Run the sanitized provider evaluation before exercising real job-search messages:

   ```bash
   npm run eval:ai
   ```

4. Restart the development server and test proposal, edit, confirmation, and reload end to end.

The adapter sends only the current message, current time/timezone/locale, and at most 20 recent application labels/statuses. Provider output remains untrusted: Zod and deterministic semantic checks run before a pending proposal can be stored. Verify the selected model's current availability and terms on [Google's Gemini pricing page](https://ai.google.dev/gemini-api/docs/pricing); free-tier inputs may be used to improve Google products, so do not test with sensitive personal data.

## Quality checks

```bash
npm run lint
npm run typecheck
npm test
npm run eval:ai
npm run build
```

## Environment

See `.env.example`. Only `NEXT_PUBLIC_` values may enter the browser bundle. AI keys and future service credentials stay server-side.

## Recommended roadmap

The order below deepens the real use case while making each milestone demonstrate a different engineering skill.

| Phase | Product outcome | Engineering signal |
| --- | --- | --- |
| 1. Trustworthy history | Record manual creates and edits atomically, show field-level activity, and warn about likely duplicates. | Transactions, audit design, concurrency, database constraints. |
| 2. Interview workflow | Capture an interview from text, clarify missing date/timezone data, persist it, and allow edits. | Multi-step agent workflow, temporal validation, reusable domain architecture. |
| 3. Calendar integration | Create a Google Calendar event only after approval and reconcile retries or later edits. | Scoped OAuth, third-party API integration, idempotency, failure recovery. |
| 4. Follow-up engine | Suggest and schedule follow-ups from application state while keeping the user in control. | Background jobs, scheduling, retries, notifications, policy-based automation. |
| 5. Production hardening | Add GitHub Actions, browser-level tests, structured logs, metrics, and a deployed demo. | CI/CD, E2E testing, observability, operational ownership. |

## Selective additions that could make the project stand out

These are useful extensions after the core roadmap, not a feature checklist:

- **Evidence-grounded application brief:** extract requirements from a pasted job description and map them to facts the user has supplied about their experience. Show evidence and gaps rather than inventing a compatibility score. This can demonstrate retrieval, provenance, and AI evaluation without becoming another generic resume scorer.
- **Next-action planner:** examine the user’s actual application state and propose a small set of reviewable next actions, such as preparing for an interview or following up after a chosen interval. Every action should use the same proposal-and-approval boundary as application capture.
- **Provider evaluation report:** expand the sanitized fixture suite, compare model versions behind the common interface, and track correctness, latency, and cost. This makes the loosely coupled AI design measurable instead of merely architectural.

A marketplace, autonomous mass application, email-wide access, and the hiring-manager assistant (“bolu”) are intentionally deferred. The strongest portfolio version is a smaller system with trustworthy workflows, failure handling, tests, and measurable AI quality—not a broad collection of disconnected features.
