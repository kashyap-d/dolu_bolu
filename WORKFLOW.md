# dolu bolu — Full Workflow

This document describes every end-to-end flow in dolu bolu. It is written against the
current source tree, so every step names the actual file, function, schema, RPC, or
table that performs it.

## 0. Mental model

dolu bolu is an *interpreter*, not an administrator:

```text
message
  -> provider-independent AI adapter (demo | gemini)
  -> Zod + domain validation
  -> reviewable, editable proposal
  -> explicit user confirmation (or rejection)
  -> deterministic, idempotent database write
```

Two runtime modes exist, selected by environment:

| Mode | Trigger | Persistence | Auth |
|---|---|---|---|
| Demo | `NEXT_PUBLIC_SUPABASE_URL` unset | In-memory only (resets on reload) | None |
| Persistent | Supabase env configured | `proposal_batches` / `action_proposals` / `applications` via RPCs | Google OAuth |

---

## 1. Bootstrapping

- `src/server/env.ts` — all configuration is validated with Zod at first use:
  - `isSupabaseConfigured()` → `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` present.
  - `getAiProviderName()` → `AI_PROVIDER` ∈ `{"demo", "gemini"}`, defaults to `demo`.
  - `getGeminiEnvironment()` → `GEMINI_API_KEY` required; `AI_MODEL`, `AI_TIMEOUT_MS`
    (1 000–60 000, default 15 000), `AI_MAX_OUTPUT_TOKENS` (256–4 096, default 1 800) optional.
- `src/server/ai/get-provider.ts` → `getActionProposalProvider()` returns
  `DemoActionProposalProvider` or `GeminiActionProposalProvider` behind the
  `ActionProposalProvider` interface (`src/server/ai/action-proposal-provider.ts`).

## 2. Entry point and routing

- `src/app/page.tsx` (`/`) — if Supabase is configured, `redirect("/app")`; otherwise renders
  `CommandCenter` in **demo mode** (mode defaults to `"demo"`).
- `src/proxy.ts` — global middleware (`config.matcher` excludes static assets):
  1. If Supabase is not configured → `NextResponse.next()`, no auth work.
  2. `refreshSupabaseSession(request)`: creates an SSR Supabase client bound to request
     cookies, calls `auth.getClaims()`, and captures any refreshed Set-Cookie state.
  3. If path is an app path (`/app`, `/app/*` — `src/lib/safe-next-path.ts`) and the user is
     **not** authenticated → 307 redirect to `/login?next=<path>`.
  4. If path is `/login` and the user **is** authenticated → redirect to `/app`.
  5. Returns a response carrying refreshed Supabase auth cookies (`copySupabaseResponseState`).
- `src/app/login/page.tsx` — `/login` page shown to unauthenticated visitors (form posts to
  the Google OAuth start route).

## 3. Authentication lifecycle (persistent mode)

### 3.1 Sign in — Google OAuth
`POST /auth/google` → `src/app/auth/google/route.ts`:
1. If Supabase unconfigured → redirect `/login?error=configuration`.
2. Reads `next` from the form and sanitizes it with `safeNextPath` (allows only leading
   `/app`-prefixed paths — prevents open redirect).
3. Creates a response-bound Supabase client (`createSupabaseResponseClient`).
4. `signInWithOAuth({ provider: "google", redirectTo: "/auth/callback?next=…", skipBrowserRedirect: true })`.
5. Redirects to the returned Google authorization URL; error → `/login?error=oauth`.
   Auth-state cookies set by Supabase are copied onto the redirect via
   `copySupabaseResponseState`.

### 3.2 Callback
`GET /auth/callback?code=…&next=…` → `src/app/auth/callback/route.ts`:
1. Reads `code` (missing → `/login?error=oauth`) and `next` (sanitized).
2. Creates a response-bound client, calls `exchangeCodeForSession(code)`.
3. On success redirects to `next` (default `/app`) carrying the new session cookies;
   on error → `/login?error=oauth`.

### 3.3 Sign out
`POST /auth/signout` → `src/app/auth/signout/route.ts`:
- `signOut({ scope: "local" })`, redirects to `/login`. (Handled via plain form submit from
  the header in `command-center.tsx`.)

### 3.4 Identity used anywhere
- `src/server/auth/session.ts`:
  - `getRequestAuth()` — for API routes; parses the JWT claims (`sub`, `email`,
    `user_metadata`) with Zod; returns `{ supabase, principal }` or `null`.
  - `requirePageAuth()` — for pages; redirects to `/login` when unauthenticated.
- Profile rows are auto-created by the `handle_new_user()` trigger on `auth.users` insert
  (`supabase/migrations/20260914000000_initial_schema.sql`), copying
  `raw_user_meta_data.full_name`/`name` into `profiles.display_name`; the UI greeting in
  `command-center.tsx` uses this name.

---

## 4. Workspace page load (persistent mode)

`/app` → `src/app/app/page.tsx`, `/app/applications` → `src/app/app/applications/page.tsx`:

1. `requirePageAuth()` — bails to `/login` if not signed in.
2. In parallel (`Promise.all`):
   - `listPendingApplicationProposals(supabase, userId)` → `action_proposals` rows with
     `user_id = me`, `kind = 'create_application'`, `status = 'pending'`, newest first,
     limit 5 (`src/server/repositories/proposal-repository.ts`).
   - `listApplications(supabase, userId)` → `applications` rows for the user, newest first
     (`src/server/repositories/application-repository.ts`).
3. Rows are parsed through Zod schemas (`applicationRecordSchema` etc.); any error becomes a
   user-visible `loadError` banner rather than a crash.
4. All of it is passed into `CommandCenter` with `mode="persistent"`, `viewer`,
   `initialProposals`, `initialApplications`, `loadError`.

---

## 5. Command center (UI) — `src/features/assistant/components/command-center.tsx`

Client component (`"use client"`). State:
- `message` — composer textarea.
- `assistantReply` — last `needs_clarification` / `unsupported` response.
- `pendingProposals: ApplicationProposal[]` — reviewable cards.
- `applications: ApplicationRecord[]` — confirmed records.
- `error` / `success` / `isLoading`.

Two views: `command` (composer + cards) and `applications` (full list). In persistent mode
the nav items are `<Link>`s to `/app` and `/app/applications`; in demo mode they swap local
state (`setDemoView`).

---

## 6. The core loop: message → proposals

### 6.1 Client request
`requestProposal(value)` in `command-center.tsx`:
1. Trims input; ignores empty / in-flight.
2. Builds `POST /api/assistant/proposals` body:
   `{ message, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, locale: navigator.language || "en-IN", clientRequestId: crypto.randomUUID() }`.
   - The `clientRequestId` is the idempotency handle for retries (see §6.5).

### 6.2 Route entry — `src/app/api/assistant/proposals/route.ts`
1. `persistenceEnabled = isSupabaseConfigured()`; `auth = getRequestAuth()`.
2. Persistent mode + unauthenticated → **401** "Sign in to prepare a saved proposal."
3. Body must parse as JSON → else **400**.
4. `assistantRequestSchema.safeParse(body)` (in `src/features/assistant/contracts.ts`):
   - `message`: trimmed, 1–2 000 chars
   - `timeZone`: valid IANA (verified at parse time with `Intl.DateTimeFormat`)
   - `locale`: 2–35 chars, default `en-IN`
   - `clientRequestId`: UUID
   - `.strict()` → unknown keys rejected. Failure → **400** with per-field issues.

### 6.3 Service: `prepareActionProposals` — `src/server/services/proposal-service.ts`

**Step A — replay check (persistent only).** `findProposalByClientRequest(userId, clientRequestId)`:
- No batch for that ID → proceed fresh.
- Batch found:
  - Message mismatch → `ClientRequestConflictError` → **409** (a request ID cannot be
    reused for a different message).
  - Batch no longer pending → `unsupported` decision ("already confirmed…"/"no longer
    pending") — no provider call, no new write.
  - Still pending → return the stored proposal immediately (idempotent replay; latency 0).

**Step B — context.** When persistence is on, `listApplicationContext(userId)` loads the
most recent 20 applications (`id, company_name, role_title, status`) so the provider can
avoid duplicate/contradictory records. In demo mode context is empty.

**Step C — provider call.** `provider.propose({ message, now: ISO now, timeZone, locale, context })`.
- Raw result is parsed by `providerResponseSchema` (strict). Anything malformed is a 5xx
  provider error.
- Decision kinds: `proposals` | `needs_clarification` | `unsupported`.

**Step D — domain validation.** For every returned proposal:
- `validateProposalEvidence(sourceMessage, proposal)` — every evidence `quote` must be an
  exact substring of the user's message.
- `validateProposalForConfirmation(proposal)` — per kind:
  - `create_application`: `companyName` and `roleTitle` required.
  - `create_interview`: `companyName` and `startsAt` required.
  - `create_task`: `title` required; `reminderRequested` needs `dueAt`.
- Any issue → `needs_clarification` response with a joined question and the unique missing
  field paths (**not persisted**).

**Step E — persistence gate (persistent mode).** Only a single `create_application` proposal
is currently persistable; anything else (interviews, tasks, multiple proposals) returns
`unsupported` "Interview and task workflows are coming next."

**Step F — persist.** `persistApplicationProposal(...)` calls the RPC
`persist_application_proposal` (§6.4). Response becomes a full `assistantResponseSchema`
with a real `batchId` and a persisted proposal `{ id, version: 1, … }`.

*(Demo mode skips E–F: proposals get `crypto.randomUUID()` ids and `version: 1` purely in
memory.)*

### 6.4 Persistence RPC — `persist_application_proposal`
`supabase/migrations/20260915000000_application_vertical_slice.sql`, `SECURITY DEFINER`,
runs as the function owner (bypasses RLS), `search_path=''`, `auth.uid()` must be set.

Validates **again** on the server (defense in depth; never trusts the app layer):
- Provider/model/summary/`action_ref` (`^draft:[1-5]$`) lengths; message 1–2 000 trimmed.
- Payload key set exactly `companyName, roleTitle, status, appliedAt, sourceUrl, notes`;
  types; trimmed lengths (company ≤120, role ≤160, notes ≤2 000); `status ∈ {saved, applied}`.
- `appliedAt` ISO-8601 with offset, parseable as `timestamptz`; `applied ⇒ appliedAt set`,
  `saved ⇒ appliedAt null`.
- `sourceUrl` http(s) only when present.
- Evidence array ≤8, each `{fieldPath, quote}` with quotes **actually present in the
  message** (`strpos(btrim(p_source_message), quote) > 0`).
- Assumptions array ≤8 strings of ≤180 chars.

Writes:
1. `INSERT proposal_batches (user_id, client_request_id, source_message, provider, model,
   status='awaiting_confirmation') … ON CONFLICT (user_id, client_request_id) DO NOTHING
   RETURNING id`. Unique constraint on `(user_id, client_request_id)`.
   - `NULL` id ⇒ batch already existed → re-read, verify the message is identical (else
     `REQUEST_ID_REUSED`), and return the existing `create_application` proposal row.
2. Otherwise `INSERT action_proposals (…, status='pending', idempotency_key =
   '<user_id>:<client_request_id>:<action_ref>')` with unique constraint
   `(user_id, idempotency_key)`, and return the new row (id + version 1).

Grants: `execute` to `authenticated` only; `revoke all … from public, anon`.

### 6.5 Idempotency story (why nothing duplicates)
- Double-submit of the same composer message reuses one `clientRequestId`:
  - Route-level: `findProposalByClientRequest` returns the stored proposal; no second RPC.
  - RPC-level: `(user_id, client_request_id)` batch conflict + message equality check → same
    deterministic result.
  - Row-level: `(user_id, idempotency_key)` unique on `action_proposals`.

### 6.6 Provider boundary
- **Demo** (`src/server/ai/providers/demo.ts`) — deterministic parser:
  - Blocks destructive/autonomous wording via regex
    (`delete|submit|send|email|apply automatically`) → `unsupported`.
  - `I applied to <co> for <role> (yesterday|today)` → application proposal with relative
    date resolved against `input.now`; evidence both fields; assumption notes the date logic.
  - `interview` mention → `needs_clarification` (needs exact company + startsAt).
  - `add/create task …` → task proposal (no deadline ⇒ assumption).
  - Otherwise → `needs_clarification` asking which action kind.
- **Gemini** (`src/server/ai/providers/gemini.ts`) — structured output:
  - Calls `generateContent` with `responseMimeType: application/json`,
    `responseJsonSchema`, `temperature: 0.1`, `maxOutputTokens`, timeout via `AbortController`.
  - System instruction (prompt injection hardening): treats `SOURCE_MESSAGE` and
    `EXISTING_APPLICATION_CONTEXT` as untrusted data; rules about evidence substrings,
    saved vs applied, no invented URLs/notes, no external actions, no update/delete/merge of
    existing applications.
  - User prompt: `CURRENT_TIME_ISO`, `USER_TIME_ZONE`, `USER_LOCALE`,
    `EXISTING_APPLICATION_CONTEXT`, `SOURCE_MESSAGE`.
  - Response validation: wraps `providerDecisionSchema`; safety-blocked finishes →
    `REFUSED`; malformed/unparseable → `INVALID_OUTPUT`.
  - HTTP error mapping: 401/403 → `AUTH`; 400/404 → `CONFIGURATION`; 408/504 → `TIMEOUT`
    (retryable); 429 → `RATE_LIMITED` (retryable); other 5xx → `UNAVAILABLE` (retryable),
    other 4xx → non-retryable. Each carries `requestId` when available.

### 6.7 Provider error mapping to HTTP — in `route.ts`
`AiProviderError.code` → status + user `error`/`recovery` message:

| code | HTTP | meaning |
|---|---|---|
| `AUTH` | 503 | provider credentials misconfigured |
| `CONFIGURATION` | 503 | model/settings misconfigured |
| `RATE_LIMITED` | 429 | too many requests, retry shortly |
| `TIMEOUT` | 504 | provider too slow |
| `UNAVAILABLE` | 503 | provider down |
| `REFUSED` | 422 | message could not be safely interpreted |
| `INVALID_OUTPUT` | 502 | provider returned invalid structure |

`ClientRequestConflictError` → 409. Unexpected failures → generic 503.

---

## 7. Review and edit — `src/features/applications/application-proposal-card.tsx`

Each pending proposal renders an editable card (client-side):
- Fields seeded from `proposal.payload`: company, role, status (`saved`/`applied`),
  applied date-time (localized via `datetime-local`), source URL, notes.
- Empty/invalid values are shown to the user as editable gaps (AI may leave values `null`).
- `Confirm`:
  1. Builds candidate payload; validates with `applicationConfirmationPayloadSchema`
     (Zod + the saved↔applied date consistency `superRefine`).
  2. Invalid → inline per-field errors (`fieldErrors`), no network call.
  3. Valid → `setPendingAction("confirm")` → `onConfirm(proposal, payload)` (see §8/§9),
     with an in-flight spinner and error capture.
- `Discard` → `onDiscard(proposal)` (see §10).

## 8. Confirm — client `confirmProposal` in `command-center.tsx`

- **Demo mode:** fabricates `{ outcome: "executed", application: {id: uuid, …now} }` locally,
  then updates local state (§9).
- **Persistent mode:** `POST /api/assistant/proposals/<id>/confirm` with body
  `{ version, application }`.

## 9. Confirm route + RPC

**Route** — `src/app/api/assistant/proposals/[proposalId]/confirm/route.ts`:
1. `getRequestAuth()` → 401 if missing.
2. Body parsed by `confirmApplicationRequestSchema` (`version` positive int, `application`
   via `applicationConfirmationPayloadSchema`, strict) → 400 with issues.
3. `confirmApplicationProposal(...)` → `supabase.rpc("confirm_create_application", …
   p_action_id, p_expected_version, p_payload)`.
4. Outcome→HTTP: `executed`/`already_executed` → 200 with the application record;
   `auth_required` → 401; `not_found` → 404; `conflict` → 409; `invalid_payload` → 422.
   `ProposalRepositoryError` → 503.

**RPC** — `confirm_create_application`, `SECURITY DEFINER`:
1. `auth.uid()` null → `auth_required`.
2. `SELECT … FOR UPDATE` the proposal join batch, filtered by `user_id`; wrong kind/missing
   → `not_found`.
3. Already executed with an `executed_entity_id` → reload the application:
   - missing → `conflict`; else → `already_executed` + the application (idempotent).
4. Optimistic concurrency: `version` mismatch / status ≠ `pending` / batch ≠
   `awaiting_confirmation` → `conflict`.
5. Re-validates the payload entirely (key set, types, lengths, URL scheme, appliedAt
   format + saved/applied coherence) → `invalid_payload` on any failure.
6. `INSERT applications (…) RETURNING *` — the **only** write of the confirmed record,
   owned by `auth.uid()`.
7. `UPDATE action_proposals` → `payload = p_payload, status='executed', version = version+1,
   executed_entity_type='application', executed_entity_id=<new id>`; constraint
   `action_proposals_execution_shape` guarantees executed rows carry their entity ids.
8. `UPDATE proposal_batches SET status='executed'` when **no** proposal in the batch remains
   `pending`.
9. Returns `{ outcome:'executed', proposalId, application }`.

After a successful confirm, `command-center.tsx` removes the card, prepends the application,
shows "Application added successfully.", and calls `router.refresh()` (persistent) so server
state re-syncs.

## 10. Reject route + RPC

**Route** — `src/app/api/assistant/proposals/[proposalId]/reject/route.ts`:
1. Auth → 401. Body `{ version }` (positive int) → 400 otherwise.
2. `rejectApplicationProposal(...)` → `rpc("reject_application_proposal", …)`.
3. Outcome→HTTP: `rejected`/`already_rejected` → 200; `auth_required` → 401;
   `not_found` → 404; `conflict` → 409. Repository error → 503.

**RPC** — `reject_application_proposal`, `SECURITY DEFINER`:
1. Auth → `auth_required`. Locked select (user-scoped) → `not_found` if missing/wrong kind.
2. Already `rejected` → `already_rejected` (idempotent).
3. Version/status/batch checks → `conflict` on mismatch.
4. `UPDATE action_proposals SET status='rejected', version=version+1`.
5. Set the batch `cancelled` if no pending proposals remain.

Client then removes the card and shows "Proposal discarded."

---

## 11. Applications list — `src/features/applications/application-list.tsx`

- Renders confirmed `ApplicationRecord`s: company, role, status badge (active
  screening/interviewing/offer/accepted green; rejected/withdrawn red; else neutral),
  applied date (localized `Intl.DateTimeFormat("en-IN", {dateStyle:"medium"})`), source link,
  notes.
- Empty state: "No applications yet" card linking back to `/app` (persistent) or to the
  composer (demo).

## 12. Data model & invariants (`supabase/migrations/20260914000000_initial_schema.sql`)

- **Tables:** `profiles`, `applications`, `interviews`, `tasks`, `proposal_batches`,
  `action_proposals`, `activity_events` — every one has RLS enabled and `user_id` FK → `auth.users`.
- **Ownership RLS:** `applications_manage_own`/`interviews_manage_own`/`tasks_manage_own` are
  `for all … using (auth.uid() = user_id) with check`. Proposal tables are
  **select-only for clients** (`…_select_own`); `revoke insert, update, delete … from anon,
  authenticated` — writes only through SECURITY DEFINER functions. `activity_events` is
  select/insert-own.
- **Referential integrity:** composite FKs `(batch_id, user_id) → proposal_batches(id, user_id)`
  and `(application_id, user_id) → applications(id, user_id)` enforce cross-row ownership;
  `ON DELETE SET NULL` keeps history when a source application is removed.
- **Check constraints** encode domain rules at the schema level (status enums, lengths,
  trimmed text, execution shape, source-message length).
- **Timestamps:** `set_updated_at()` trigger on every mutable table.
- **Indexes:** per-user sorted lookups for applications, interviews by start, tasks by
  status/due, batches by created, proposals by user+status, activity by user+created.

## 13. State machines

**`proposal_batches.status`**
```text
awaiting_confirmation ──confirm all──▶ executed
        │
        └──reject remaining──────▶ cancelled
```
(Others declared for future flows: `awaiting_clarification`, `executing`,
`partially_failed`, `failed`, `expired`.)

**`action_proposals.status`**
```text
pending ──confirm──▶ executed (writes applications row, version++)
   │
   └──reject─────▶ rejected (version++)
```
Repeated confirm/reject is safe: `already_executed` / `already_rejected` idempotent
outcomes, guarded by row locks (`FOR UPDATE`) against concurrent actors.

## 14. Quality gates (repo)

| Command | What it does |
|---|---|
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | `node --test tests/**/*.test.ts` — schema contracts, validation rules, Gemini provider error mapping (stubbed fetch) |
| `npm run eval:ai` | `scripts/evaluate-ai.ts` — runs `evals/application-capture.json` (10 fixtures: happy paths, missing-company/role, ambiguous, destructive, autonomous, email) against the **active provider**; asserts decision kind + extracted fields + evidence validity; non-zero exit on failure |
| `npm run build` | production Next.js build |

`scripts/evaluate-ai.ts` loads `.env.local` if present, so the eval gates whichever provider
is configured (demo locally, Gemini in CI with a key).

---

## 15. Sequence diagram (persistent happy path)

```text
Browser            CommandCenter              /api/assistant/proposals          proposal-service         Provider     persist_application_proposal   confirm_create_application
   │  user types message                       │                                    │                       │                │                                │
   │────────────────▶│                          │                                    │                       │                │                                │
   │  POST + clientRequestId                    │                                    │                       │                │                                │
   │────────────────▶│────────────────────────▶│ replay check (batch?)               │                       │                │                                │
   │                  │                         │────────────────────────────────────▶│ propose()           │                │                                │
   │                  │                         │                                      │──────────────────────▶│               │                                │
   │                  │ ◀────────────────────────│◀───────────────────────────────────┘ (proposals draft)  │                │                                │
   │                  │                         │ validate evidence + readiness        │                       │                │                                │
   │                  │                         │ rpc persist (awaiting_confirmation)  │                       │                │                                │
   │                  │                         │──────────────────────────────────────────────────────────────────▶│              │                                │
   │                  │ ◀────────────────────────│◀──────────────────────────────────────────────────────────────────┘ {id, version:1}│                                │
   │  editable card    │                         │                                       │                       │                │                                │
   │◀──────────────────│                         │                                       │                       │                │                                │
   │  Confirm {version, application}             │                                       │                       │                │                                │
   │────────────────▶│────────────────────────▶│                                       │                       │                │──── rpc confirm ──▶│
   │                  │ ◀────────────────────────│◀───────────────────────────────────────────────────────────────────────────────────────────┘ executed + application
   │  card removed, row shown                     │                                       │                       │                │                                │
```