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
- interview rounds (up to 10): title, kind, status, time and time zone, mode, location, meeting URL, and notes;
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

1. The composer posts `{message, timeZone, locale, clientRequestId}` to `/api/assistant/proposals`. The message may be up to 8,000 characters, including a pasted email or invite.
1. The service replaces email addresses and phone numbers with placeholders (`redactContactDetails`). Every later step sees only the redacted text.
2. `prepareProposal` first checks `(user_id, client_request_id)` for an idempotent replay.
3. Before calling a hosted model it reserves one unit of the user's daily allowance (`consume_ai_request`). The unauthenticated preview never reaches a hosted model.
4. It sends the message, time context, and the drive summaries chosen by `selectModelContext`: drives at companies the message names, or up to 10 recent active drives if it names none.
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

Migration `20261015000000_job_drive_correctness.sql` then:

- converts `applied_at` and `apply_by` to `date`, using each owner's profile time zone;
- moves value rules (URL format, lengths, time zones, interview schedule ⇒ time zone) into table constraints;
- reduces `apply_job_drive_change` to structure checks, locking, the write, and the activity append; constraint violations return `invalid_payload`;
- accepts only ISO 8601 dates and timestamps (Postgres alone would accept `yesterday` or `now`);
- detects duplicates on normalised company and role names, last, rolling back the write if it finds any;
- makes timestamp defaults independent of the session time zone.

## Interface

- `src/app/app/layout.tsx` authenticates once and renders `PersistentWorkspace`: the app shell, routed navigation, and the HTTP gateway. After a successful write the gateway calls `router.refresh()`, so the screen re-renders from the database rather than from optimistic client state.
- `PreviewWorkspace` (at `/` without Supabase) renders the same views with an in-memory gateway and state-based navigation.
- `CommandCenterView`: composer, review queue, manual entry, and the agenda.
- `DrivesView` / `JobDriveList`: company, role, stage, nearest important date.
- `DriveDetailView` / `JobDriveDetail`: stage bar, OA summary, interview rounds, notes, activity.
- `AgendaPanel`: loose ends, the next two weeks, and quiet drives, computed by `buildAgenda`.
- `AccountSettings` (`/app/settings`): JSON export and account deletion.
- `JobDriveEditor`: the shared create/edit/review form, expanding only stage-relevant sections.
- `src/app/app/error.tsx` and `loading.tsx` handle failed and slow loads for every workspace route.

Views never branch on mode: they use `useGateway()` for writes and `WorkspaceLink` for navigation.

No placeholder task, Calendar, JD brief, marketplace, or recruiter controls are shown.

## Verification

```bash
npm run lint
npm run typecheck
npm test          # unit
npm run test:db   # SQL functions, constraints, RLS, migrations, SQL/TS parity
npm run test:e2e  # Playwright against the preview, desktop and mobile, two time zones
npm run eval:ai
npm run build
```

Automated coverage spans stage rules and non-regression, proposal resolution, evidence grounding, correction detection, normalisation, model-context selection, provider error mapping, and Gemini schema derivation (unit); atomic writes, idempotent creates and confirmations, stale-edit conflicts, corrections, duplicate warnings, value constraints, cross-user isolation, the AI allowance, and the date conversion (database); and the main preview flows (end to end).

The signed-in flow uses Google OAuth and remains a manual acceptance pass. Repeat it after applying `20261014000000_ai_quota_and_legacy_cleanup.sql` and `20261015000000_job_drive_correctness.sql`: sign in, send a message, confirm, reload, edit with a correction, and check the drive's activity.
