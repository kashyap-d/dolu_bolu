# dolu bolu — Job Drive workflow

This is the request-level implementation trace. `AGENTS.md` is the canonical product and engineering brief; `docs/decisions` records why the system is shaped this way.

## Mental model

A **Job Drive** is one user's hiring process for one company and role:

```text
Planned → Applied → Assessment / OA → Interview → Offer → Accepted / Hired
                         ↘ Rejected / Withdrawn
```

The app has two input paths that converge on the same validated, transactional domain write:

```text
manual editor ───────────────┐
                             ├─> save_job_drive / apply_job_drive_change
message → AI → review card ──┘        ├─> drive + OA/interview detail
                                      └─> immutable activity event
```

Unknown information remains null. Reaching an OA can advance a drive to `assessment` without inventing an application date. Forward jumps are allowed; backward changes and reopening a rejected/withdrawn drive require an explicit correction.

## Authentication and page load

- `src/proxy.ts` refreshes the Supabase session and guards `/app/**`.
- `/login`, `/auth/google`, and `/auth/callback` implement cookie-bound Google OAuth PKCE.
- `requirePageAuth()` authenticates every workspace Server Component.
- `/app` loads owner-scoped pending proposals and recent drives.
- `/app/drives` renders the drive list.
- `/app/drives/[driveId]` loads one drive plus its activity timeline.
- `/app/applications` redirects to `/app/drives` for old bookmarks.

If Supabase is not configured, `/` renders the same workflow as an explicitly in-memory demo.

## Shared contract

`src/features/job-drives/contracts.ts` defines strict Zod schemas for:

- stages: `planned`, `applied`, `assessment`, `interview`, `offer`, `accepted`, `rejected`, `withdrawn`;
- the drive core: company, role, optional stage occurrence, application date, apply-by date, location, source URL, and notes;
- one assessment record: availability, deadline, duration, URL, status, and notes;
- a consolidated interview summary: next schedule/timezone, mode, location, meeting URL, round summary, and notes;
- manual create/update requests, duplicate candidates, confirmation outcomes, and activity events.

The OA schema rejects a deadline before availability. The interview schema requires an IANA timezone value whenever a schedule is present. HTTP boundaries reject unknown keys, malformed timestamps, and non-HTTP(S) URLs.

## Manual workflow

1. `JobDriveEditor` builds a `JobDriveProgressPayload` and validates it locally with the shared schema.
2. The view calls the workspace gateway; the signed-in gateway uses the typed API client. A create sends a retry-safe browser-generated UUID to `POST /api/job-drives`.
3. An edit sends `expectedUpdatedAt` to `PATCH /api/job-drives/[jobDriveId]`.
4. A backward/reopening edit is labeled and sent with `isCorrection: true`.
5. The route (built on `src/server/http.ts`) re-authenticates, re-validates, and calls `save_job_drive`.
6. The public SQL wrapper fixes `source = manual`; clients cannot author the source field.
7. The internal `apply_job_drive_change` function locks/creates the drive, upserts supplied OA/interview details, and appends the activity row in the same transaction.

If an exact source URL or a similar active company/role/location exists, creation returns `possible_duplicate` before writing. The UI lets the user open that drive or explicitly retry with `allowPossibleDuplicate` to create a legitimate repeated application.

## Assistant workflow

1. The composer posts `{message, timeZone, locale, clientRequestId}` to `/api/assistant/proposals`.
2. `prepareProposal` first checks `(user_id, client_request_id)` for an idempotent replay.
3. Before calling a hosted model it reserves one unit of the user's daily allowance (`consume_ai_request`). The unauthenticated preview never reaches a hosted model.
4. It sends the message, time context, and at most 20 of the user's own drive summaries to the selected `ActionProposalProvider`.
5. The provider returns exactly one of `proposal`, `needs_clarification`, or `unsupported`. The only action kind is `record_job_drive_progress`.
6. Zod validates the output. `resolveProposal` (pure, unit-tested) then checks that evidence is quoted from the message, that a correction was explicitly requested, and that a referenced drive exists and agrees on company/role. It resolves the target drive, attaches its real ID and `updatedAt`, merges omitted details, and keeps earlier news from moving a drive backwards.
7. Any issue becomes a clarification question. Otherwise one proposal is persisted with a server-owned ID/version and shown as an editable review card.

Gemini lives behind the same interface as the deterministic adapter. There is no silent provider fallback.

## Confirmation and rejection

Confirmation sends only the edited drive fields plus the proposal version. It cannot replace the server-owned target drive ID, concurrency timestamp, or correction flag stored with the proposal.

`confirm_job_drive_progress`:

1. authenticates with `auth.uid()`;
2. locks the proposal and batch and verifies ownership, version, kind, and pending state;
3. returns the prior drive for repeated confirmation (`already_executed`);
4. reads the trusted target identity/concurrency metadata from the stored proposal;
5. calls `apply_job_drive_change` with `source = assistant`;
6. atomically marks the proposal/batch executed and links the resulting drive.

Rejection uses `reject_job_drive_proposal`, the same owner/version/row-lock checks, and an idempotent `already_rejected` outcome.

## Persistence and security

Migration `20260916000000_job_drive_foundation.sql` renames `applications` to `job_drives` so record UUIDs, ownership, creation timestamps, and foreign-key relationships survive. The update trigger is temporarily disabled while legacy statuses map, preserving `updated_at` as well.

Status mapping:

| Legacy | Job Drive |
| --- | --- |
| `saved` | `planned` |
| `applied` | `applied` |
| `screening` | `applied` |
| `interviewing` | `interview` |
| all other terminal/offer states | unchanged |

The migration also:

- renames interview/task foreign keys to `job_drive_id`;
- adds `job_drive_assessments` with a composite owner FK;
- makes interview scheduling optional and adds `round_summary`;
- expires pending legacy `create_application` proposals;
- changes historic activity/execution entity labels from `application` to `job_drive`;
- replaces broad mutation policies with owner-scoped SELECT policies and narrow authenticated RPC execution;
- adds duplicate, correction, URL, length, enum, date-window, and optimistic-concurrency checks.

Every successful manual or confirmed-AI mutation appends an activity event with `source`, `previousStage`, `newStage`, `changedFields`, and the user-supplied `occurredAt` value.

## Interface

- `src/app/app/layout.tsx` authenticates once and renders `PersistentWorkspace`: the app shell, routed navigation, and the HTTP gateway. After a successful write the gateway calls `router.refresh()`, so the screen re-renders from the database rather than from optimistic client state.
- `PreviewWorkspace` (at `/` without Supabase) renders the same views with an in-memory gateway and state-based navigation.
- `CommandCenterView`: composer, review queue, manual entry, upcoming dates.
- `DrivesView` / `JobDriveList`: company, role, stage, nearest important date.
- `DriveDetailView` / `JobDriveDetail`: stage bar, OA/interview summaries, notes, activity.
- `JobDriveEditor`: the shared create/edit/review form, expanding only stage-relevant sections.
- `src/app/app/error.tsx` and `loading.tsx` handle failed and slow loads for every workspace route.

Views never branch on mode: they use `useGateway()` for writes and `WorkspaceLink` for navigation.

No placeholder task, Calendar, JD brief, marketplace, or recruiter controls are shown.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run eval:ai
npm run build
```

Current automated coverage includes all stages, unknown dates, OA windows, interview timezone rules, malformed URL/time input, forward skips, non-regression, terminal states, correction detection, AI ownership boundaries, evidence grounding, migration preservation clauses, provider error mapping, and unsafe-autonomy refusal.

The Job Drive migration and a hosted acceptance pass were completed against the connected Supabase project before the Phase 1 refactor; repeat it after applying `20261014000000_ai_quota_and_legacy_cleanup.sql`. The pass covered NLP creation and matching, manual stage changes, OA/interview persistence, duplicate resolution, explicit correction, reload persistence, legacy activity compatibility, and keyboard stage interaction. Responsive layout is implemented with breakpoint-based CSS; repeatable multi-viewport coverage remains part of the planned Playwright suite.

## Deliberate next steps

1. Calendar readiness: separate OAuth consent and per-event approval for apply-by dates, OA windows/deadlines, and interviews.
2. On-demand application brief: paste a JD and map requirements to user-supplied experience evidence without invented scores.
3. Playwright browser acceptance plus CI.
4. Structured observability and provider-evaluation history.
5. State-aware follow-up proposals only after the core remains dependable.
