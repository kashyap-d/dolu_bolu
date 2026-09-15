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
- Google OAuth through cookie-bound Supabase SSR clients.
- Protected `/app` and `/app/applications` routes with server-side data loading.
- A responsive command center with editable application proposals.
- Shared schemas for applications, interviews, tasks, and proposal decisions.
- A provider interface, a no-key deterministic development adapter, and a server-only Gemini structured-output adapter.
- Durable pending proposals, atomic/idempotent application confirmation, and rejection through narrow Postgres functions.
- Owner-scoped Row Level Security and server-authored activity history.
- A reload-safe application list plus local demo mode when Supabase is not configured.
- Repository-wide product and engineering guidance in `AGENTS.md`.

The first application-capture vertical slice is implemented. Interview/task execution, manual entry, and Calendar access remain intentionally out of scope for this milestone.

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

## Near-term roadmap

1. Run the Gemini evaluation with a real key, then exercise application capture end to end without changing the repository default from demo.
2. Add a deterministic manual application form and application lifecycle updates.
3. Extend the proven proposal/confirmation pattern to interviews and tasks.
4. Add separately authorized one-way Google Calendar event creation only after interview capture is dependable.

A hiring-manager assistant is intentionally deferred until dolu bolu is useful and dependable on its own.
