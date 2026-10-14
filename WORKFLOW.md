# dolu bolu — Job Drive workflow

This is the implementation trace for v0.4. `AGENTS.md` remains the canonical product and engineering brief.

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

1. `JobDriveEditor` builds a `JobDriveProgressPayload` and validates it locally.
2. A create sends a retry-safe browser-generated UUID to `POST /api/job-drives`.
3. An edit sends `expectedUpdatedAt` to `PATCH /api/job-drives/[jobDriveId]`.
4. A backward/reopening edit is labeled and sent with `isCorrection: true`.
5. The route re-authenticates, re-validates, and calls `save_job_drive`.
6. The public SQL wrapper fixes `source = manual`; clients cannot author the source field.
7. The internal `apply_job_drive_change` function locks/creates the drive, upserts supplied OA/interview details, and appends the activity row in the same transaction.

If an exact source URL or a similar active company/role/location exists, creation returns `possible_duplicate` before writing. The UI lets the user open that drive or explicitly retry with `allowPossibleDuplicate` to create a legitimate repeated application.

## Assistant workflow

1. The composer posts `{message, timeZone, locale, clientRequestId}` to `/api/assistant/proposals`.
2. `prepareJobDriveProposals` first checks `(user_id, client_request_id)` for an idempotent replay.
3. It loads at most 20 summaries from the user's recent drives and sends only those plus the message/time context to the selected provider.
4. `ActionProposalProvider` returns `proposals`, `needs_clarification`, or `unsupported`.
5. The only supported action is `record_job_drive_progress`.
6. Zod validates the provider output; deterministic code verifies exact evidence substrings and required identity.
7. A provider may reference only an opaque `job-drive:<uuid>` from supplied context. Trusted code resolves that reference, attaches the real owner-scoped ID and `updatedAt`, merges omitted existing detail, and prevents automatic regression.
8. One proposal is persisted with a server-owned ID/version and displayed as an editable review card.

Gemini lives behind the same interface as the deterministic demo adapter. There is no silent provider fallback.

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

- `JobDriveCommandCenter`: composer, review queue, manual entry, navigation, and client refresh state.
- `JobDriveList`: company, role, stage, nearest important date, duplicate-safe create entry.
- `JobDriveDetail`: lifecycle bar, OA/interview summaries, notes, and timeline.
- `StageBar`: semantic buttons for consistent keyboard and click interaction.
- `JobDriveEditor`: shared create/edit/review surface with only stage-relevant detail sections expanded.

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

The v0.4 migration and hosted acceptance pass were completed against the connected Supabase project. The pass covered NLP creation and matching, manual stage changes, OA/interview persistence, duplicate resolution, explicit correction, reload persistence, legacy activity compatibility, and keyboard stage interaction. Responsive layout is implemented with breakpoint-based CSS; repeatable multi-viewport coverage remains part of the planned Playwright suite.

## Deliberate next steps

1. Calendar readiness: separate OAuth consent and per-event approval for apply-by dates, OA windows/deadlines, and interviews.
2. On-demand application brief: paste a JD and map requirements to user-supplied experience evidence without invented scores.
3. Playwright browser acceptance plus CI.
4. Structured observability and provider-evaluation history.
5. State-aware follow-up proposals only after the core remains dependable.
