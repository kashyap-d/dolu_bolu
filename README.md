# dolu bolu

dolu bolu is a personal career-operations assistant for job seekers. The current release tracks each company-and-role hiring process as one **Job Drive**, from planning and application through OA, interview, offer, and final outcome. A user can update a drive manually or describe progress in ordinary language, then review the structured change before anything is saved.

The product is deliberately not a job marketplace, an autonomous application bot, or a generic chatbot with unrelated AI features.

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

The Job Drive foundation is implemented end to end in code:

```text
Google sign-in
  -> protected workspace
  -> manual form or natural-language progress message
  -> editable Job Drive proposal
  -> atomic authenticated mutation + activity event
  -> reload-safe drive list, detail view, and timeline
```

### Implemented

- Next.js 16 App Router, React 19, TypeScript, and Tailwind CSS.
- Google OAuth through cookie-bound Supabase SSR clients.
- Protected `/app`, `/app/drives`, and `/app/drives/[driveId]` routes with server-side data loading; old `/app/applications` bookmarks redirect to Drives.
- A responsive command center, direct Job Drive editor, keyboard/click stage bar, drive list, contextual OA/interview fields, and activity timeline.
- Shared strict schemas for Job Drives, lifecycle stages, one OA detail record, a consolidated interview phase, activity events, and proposal decisions.
- A provider interface, a no-key deterministic development adapter, and a server-only Gemini structured-output adapter.
- Durable `record_job_drive_progress` proposals that can match or create a drive, advance its stage, and attach OA or interview details.
- Atomic, retry-safe manual and AI writes with optimistic concurrency, duplicate warnings, explicit audited corrections, and immutable field-level activity metadata.
- Owner-scoped Row Level Security with direct client mutation revoked for Job Drives, assessments, interviews, proposals, and activity history.
- Unknown dates remain optional: an OA may imply application progress without inventing an application date.
- A reload-safe drive workspace plus local demo mode when Supabase is not configured.
- 61 unit/contract/migration tests and a 14-case live provider evaluation covering the Job Drive contract.
- A completed hosted acceptance pass covering AI create/update, manual stage changes, OA/interview persistence, duplicate resolution, explicit correction, reload persistence, legacy activity compatibility, and keyboard stage interaction.
- Repository-wide product guidance in `AGENTS.md` and an implementation trace in [`JOB_DRIVE_WORKFLOW.md`](JOB_DRIVE_WORKFLOW.md).

### Engineering decisions worth discussing

| Decision | Why it matters |
| --- | --- |
| The model proposes; deterministic code writes | Prevents unreviewed AI output from mutating user data. |
| Provider-independent contract | Gemini, a local model, or another hosted model can be compared without rewriting the workflow. |
| Schema and semantic validation | Treats model output as untrusted input and catches structurally valid but unsafe actions. |
| Database RPC for every drive mutation | Makes drive/detail changes and immutable activity recording atomic and retry-safe. |
| Row Level Security | Enforces ownership in the database instead of relying only on UI or route checks. |
| Optimistic concurrency for edits | Detects stale updates rather than silently overwriting a newer drive state. |
| Explicit lifecycle correction | Forward progress is easy; backward moves and reopening terminal drives require an audited correction. |
| Duplicate warning, not hard uniqueness | Protects users from accidents while permitting legitimate repeat applications. |

### Current limitations

- Calendar authorization/synchronization is not implemented yet; dated deadlines and interviews remain inside dolu bolu.
- The stage-aware JD application brief is intentionally deferred until Calendar readiness.
- Tests cover contracts and core logic, but there is no automated browser test suite or CI pipeline yet.
- Provider latency and request IDs are returned, but there is no production observability dashboard or prompt/model regression history.
- The Drives list is capped at the 100 most recently updated records and does not yet expose search/filtering or cursor pagination.

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
3. Apply every SQL file in `supabase/migrations` in filename order, including `20260916000000_job_drive_foundation.sql`. They are the database source of truth; connecting a GitHub repository does not by itself run them against an existing project.
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

The adapter sends only the current message, current time/timezone/locale, and at most 20 recent owner-scoped drive summaries. Provider output remains untrusted: Zod and deterministic semantic checks run before a pending proposal can be stored. Verify the selected model's current availability and terms on [Google's Gemini pricing page](https://ai.google.dev/gemini-api/docs/pricing); free-tier inputs may be used to improve Google products, so do not test with sensitive personal data.

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
| 1. Job Drive foundation — complete | The migration and manual/AI create-update flows are verified against hosted Supabase, including audit history, duplicate resolution, correction, and reload persistence. | Data migration, RLS, transactions, concurrency, audit design. |
| 2. Calendar readiness | Separately authorize Google Calendar and propose per-event sync for deadlines, OA windows, and interviews. | Scoped OAuth, third-party APIs, idempotency, reconciliation. |
| 3. Evidence-grounded application brief | Map pasted JD requirements to user-supplied experience evidence and identify gaps on demand. | Retrieval, provenance, structured generation, AI evaluation. |
| 4. Production hardening | Add Playwright acceptance tests, GitHub Actions, structured logs, metrics, and a deployed demo. | CI/CD, E2E testing, observability, operational ownership. |
| 5. State-aware next actions | Propose a small number of useful follow-ups from actual drive state, always behind approval. | Scheduling, retries, notifications, policy-based automation. |

## Selective additions that could make the project stand out

These are useful extensions after the core roadmap, not a feature checklist:

- **Evidence-grounded application brief:** extract requirements from a pasted job description and map them to facts the user has supplied about their experience. Show evidence and gaps rather than inventing a compatibility score. This can demonstrate retrieval, provenance, and AI evaluation without becoming another generic resume scorer.
- **Next-action planner:** examine the user’s actual application state and propose a small set of reviewable next actions, such as preparing for an interview or following up after a chosen interval. Every action should use the same proposal-and-approval boundary as application capture.
- **Provider evaluation report:** expand the sanitized fixture suite, compare model versions behind the common interface, and track correctness, latency, and cost. This makes the loosely coupled AI design measurable instead of merely architectural.

A marketplace, autonomous mass application, email-wide access, and the hiring-manager assistant (“bolu”) are intentionally deferred. The strongest portfolio version is a smaller system with trustworthy workflows, failure handling, tests, and measurable AI quality—not a broad collection of disconnected features.
