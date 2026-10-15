import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { createTestDatabase, skipWithoutDatabase, type TestDatabase, type Tx } from "./harness";

function payload(overrides: Record<string, unknown> = {}) {
  return {
    companyName: "Acme",
    roleTitle: "Backend Engineer",
    stage: "applied",
    stageOccurredAt: null,
    appliedAt: "2026-10-13",
    applyBy: null,
    location: null,
    sourceUrl: null,
    notes: null,
    assessment: null,
    interviewRounds: [],
    ...overrides,
  };
}

function round(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(), title: "Technical 1", kind: "technical", status: "scheduled",
    scheduledAt: null, timeZone: null, mode: "virtual", location: null, meetingUrl: null, notes: null,
    ...overrides,
  };
}

type Result = { outcome: string; jobDrive?: Record<string, unknown>; candidates?: unknown[] };

async function save(
  tx: Tx,
  input: { id: string; expectedUpdatedAt?: string | null; drive?: Record<string, unknown>; allowDuplicate?: boolean; correction?: boolean },
) {
  const [row] = await tx`
    select public.save_job_drive(
      ${input.id}::uuid,
      -- Sent as text: postgres.js would round a timestamptz parameter to milliseconds.
      ${input.expectedUpdatedAt ?? null}::text::timestamptz,
      ${tx.json(payload(input.drive) as never)}::jsonb, ${input.allowDuplicate ?? false}, ${input.correction ?? false}
    ) as result`;
  return row!.result as Result;
}

describe("Job Drive writes", { skip: skipWithoutDatabase }, () => {
  let db: TestDatabase;
  let asha: string;
  let ravi: string;

  before(async () => {
    db = await createTestDatabase();
    asha = await db.createUser();
    ravi = await db.createUser();
  });
  after(async () => {
    await db?.drop();
  });

  it("creates a drive, records activity, and replays an identical create", async () => {
    const id = crypto.randomUUID();
    const first = await db.as(asha, (tx) => save(tx, { id }));
    assert.equal(first.outcome, "created");
    assert.equal(first.jobDrive?.appliedAt, "2026-10-13");

    const replay = await db.as(asha, (tx) => save(tx, { id }));
    assert.equal(replay.outcome, "already_created");

    const events = await db.sql`select event_type, metadata from public.activity_events where entity_id = ${id}`;
    assert.equal(events.length, 1);
    assert.equal(events[0]!.event_type, "job_drive_created");
  });

  it("warns about a likely duplicate, including differently written company names", async () => {
    await db.as(asha, (tx) => save(tx, { id: crypto.randomUUID(), drive: { companyName: "Globex Pvt. Ltd." } }));
    const duplicate = await db.as(asha, (tx) =>
      save(tx, { id: crypto.randomUUID(), drive: { companyName: "globex" } }),
    );
    assert.equal(duplicate.outcome, "possible_duplicate");
    const globexRows = await db.sql`select 1 from public.job_drives where user_id = ${asha} and company_name ilike 'globex%'`;
    assert.equal(globexRows.length, 1, "a duplicate warning must not leave a row behind");

    const deliberate = await db.as(asha, (tx) =>
      save(tx, { id: crypto.randomUUID(), drive: { companyName: "globex" }, allowDuplicate: true }),
    );
    assert.equal(deliberate.outcome, "created");
  });

  it("rejects stale edits and requires an explicit correction to move backwards", async () => {
    const id = crypto.randomUUID();
    const created = await db.as(asha, (tx) => save(tx, { id, drive: { companyName: "Initech", stage: "interview" } }));
    const version = created.jobDrive!.updatedAt as string;

    const stale = await db.as(asha, (tx) =>
      save(tx, { id, expectedUpdatedAt: "2020-01-01T00:00:00Z", drive: { companyName: "Initech", stage: "offer" } }),
    );
    assert.equal(stale.outcome, "conflict");

    const backwards = await db.as(asha, (tx) =>
      save(tx, { id, expectedUpdatedAt: version, drive: { companyName: "Initech", stage: "applied" } }),
    );
    assert.equal(backwards.outcome, "correction_required");

    const corrected = await db.as(asha, (tx) =>
      save(tx, { id, expectedUpdatedAt: version, drive: { companyName: "Initech", stage: "applied" }, correction: true }),
    );
    assert.equal(corrected.outcome, "updated");
    const [event] = await db.sql`
      select event_type from public.activity_events where entity_id = ${id} order by created_at desc limit 1`;
    assert.equal(event!.event_type, "job_drive_corrected");
  });

  it("stores OA and interview details atomically with the drive", async () => {
    const id = crypto.randomUUID();
    const result = await db.as(asha, (tx) =>
      save(tx, {
        id,
        drive: {
          companyName: "Hooli",
          stage: "assessment",
          assessment: {
            status: "scheduled", availableFrom: "2026-10-16T09:00:00Z", dueAt: "2026-10-18T18:30:00Z",
            durationMinutes: 90, assessmentUrl: "https://hooli.example/oa", notes: null,
          },
        },
      }),
    );
    assert.equal(result.outcome, "created");
    assert.equal((result.jobDrive!.assessment as { durationMinutes: number }).durationMinutes, 90);
  });

  it("rejects invalid values without writing anything", async () => {
    const cases: Array<Record<string, unknown>> = [
      { stage: "hired" },
      { companyName: "" },
      { sourceUrl: "javascript:alert(1)" },
      { appliedAt: "yesterday" },
      { companyName: "Umbrella", assessment: { status: "invited", availableFrom: "2026-10-20T00:00:00Z", dueAt: "2026-10-19T00:00:00Z", durationMinutes: null, assessmentUrl: null, notes: null } },
      { companyName: "Umbrella", interviewRounds: [round({ scheduledAt: "2026-10-20T10:00:00Z", timeZone: null })] },
      { companyName: "Umbrella", interviewRounds: [round({ timeZone: "Mars/Olympus" })] },
      { companyName: "Umbrella", interviewRounds: [round({ kind: "lunch" })] },
      { companyName: "Umbrella", interviewRounds: [round({ title: "" })] },
      { companyName: "Umbrella", interviewRounds: Array.from({ length: 11 }, () => round()) },
      { unexpected: true },
    ];
    for (const drive of cases) {
      const id = crypto.randomUUID();
      const result = await db.as(asha, (tx) => save(tx, { id, drive }));
      assert.equal(result.outcome, "invalid_payload", JSON.stringify(drive));
      const rows = await db.sql`select 1 from public.job_drives where id = ${id}`;
      assert.equal(rows.length, 0);
    }
  });

  it("keeps interview rounds as a list: adds, updates, and removes them in one write", async () => {
    const id = crypto.randomUUID();
    const first = round({ title: "Technical 1", scheduledAt: "2026-10-20T04:30:00Z", timeZone: "Asia/Kolkata" });
    const second = round({ title: "HR", kind: "hr" });
    const created = await db.as(asha, (tx) =>
      save(tx, { id, drive: { companyName: "Rounds Co", stage: "interview", interviewRounds: [second, first] } }),
    );
    const rounds = created.jobDrive!.interviewRounds as Array<{ id: string; title: string; status: string }>;
    assert.deepEqual(rounds.map((r) => r.title), ["Technical 1", "HR"], "scheduled rounds first, by time");

    const updated = await db.as(asha, (tx) =>
      save(tx, {
        id,
        expectedUpdatedAt: created.jobDrive!.updatedAt as string,
        drive: { companyName: "Rounds Co", stage: "interview", interviewRounds: [{ ...first, status: "completed" }] },
      }),
    );
    const after = updated.jobDrive!.interviewRounds as Array<{ id: string; status: string }>;
    assert.deepEqual(after.map((r) => [r.id, r.status]), [[first.id, "completed"]]);

    const [event] = await db.sql`
      select metadata from public.activity_events where entity_id = ${id} order by created_at desc limit 1`;
    assert.deepEqual((event!.metadata as { changedFields: string[] }).changedFields, ["interviewRounds"]);
  });

  it("refuses to take over another user's interview round by id", async () => {
    const ashaRound = round();
    await db.as(asha, (tx) => save(tx, { id: crypto.randomUUID(), drive: { companyName: "Theirs", interviewRounds: [ashaRound] } }));
    const hijack = await db.as(ravi, (tx) =>
      save(tx, { id: crypto.randomUUID(), drive: { companyName: "Mine", interviewRounds: [{ ...ashaRound, title: "Hijacked" }] } }),
    );
    assert.equal(hijack.outcome, "invalid_payload");
    const [stored] = await db.sql`select title, user_id from public.interviews where id = ${ashaRound.id}`;
    assert.equal(stored!.title, "Technical 1");
    assert.equal(stored!.user_id, asha);
  });

  it("keeps each user's drives invisible and unwritable to others", async () => {
    const id = crypto.randomUUID();
    await db.as(asha, (tx) => save(tx, { id, drive: { companyName: "Private Co" } }));

    const visible = await db.as(ravi, (tx) => tx`select id from public.job_drives where id = ${id}`);
    assert.equal(visible.length, 0);

    const hijack = await db.as(ravi, (tx) =>
      save(tx, { id, expectedUpdatedAt: new Date().toISOString(), drive: { companyName: "Private Co", stage: "rejected" } }),
    );
    assert.notEqual(hijack.outcome, "updated");

    await assert.rejects(
      db.as(asha, (tx) => tx`update public.job_drives set stage = 'offer' where id = ${id}`),
      /permission denied/,
    );
    await assert.rejects(
      db.as(asha, (tx) => tx`insert into public.activity_events (user_id, event_type, entity_type, entity_id, metadata) values (${asha}, 'x', 'job_drive', ${id}, '{}')`),
      /permission denied|row-level security/,
    );
  });

  it("requires authentication", async () => {
    const result = await db.as(null, (tx) => save(tx, { id: crypto.randomUUID() }));
    assert.equal(result.outcome, "auth_required");
  });
});
