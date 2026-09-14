# dolu bolu

dolu bolu is a personal career-operations assistant for job seekers. It turns messages such as “I applied to Acme yesterday” into typed, editable action proposals, then waits for explicit approval before changing anything.

The project is deliberately focused: dolu bolu helps a job seeker maintain applications, interviews, and follow-up tasks. It is not a job marketplace, an autonomous application bot, or a pile of unrelated AI features.

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

## Current foundation

- Next.js 16 App Router, React 19, TypeScript, and Tailwind CSS.
- A responsive command-center prototype.
- Shared schemas for applications, interviews, tasks, and proposal decisions.
- A provider interface plus a no-key deterministic development adapter.
- Supabase-ready schema with owner-based Row Level Security.
- Repository-wide product and engineering guidance in `AGENTS.md`.

The command-center approval interaction is currently an in-memory UI prototype. Database-backed confirmation, Google Auth, and the hosted Gemini adapter are the next vertical-slice work; the UI does not claim that prototype approvals are persisted.

## Run locally

Requirements: Node.js 22.13+ and npm.

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). With `AI_PROVIDER=demo`, no API key or Supabase project is required to explore the current interface.

## Quality checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Environment

See `.env.example`. Only `NEXT_PUBLIC_` values may enter the browser bundle. AI keys and future service credentials stay server-side.

## Near-term roadmap

1. Complete the authenticated Supabase vertical slice: Google sign-in, pending proposal persistence, idempotent confirmation, and reload-safe records.
2. Add the Gemini structured-output adapter and run the shared provider evaluation set.
3. Add first-class application, interview, and task views with manual forms.
4. Add separately authorized one-way Google Calendar event creation.

A hiring-manager assistant is intentionally deferred until dolu bolu is useful and dependable on its own.
