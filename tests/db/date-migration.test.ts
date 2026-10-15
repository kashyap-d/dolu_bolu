import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { createTestDatabase, skipWithoutDatabase, type TestDatabase } from "./harness";

describe("date-only migration", { skip: skipWithoutDatabase }, () => {
  let db: TestDatabase;
  before(async () => {
    db = await createTestDatabase({ stopBefore: "20261015000000" });
  });
  after(async () => {
    await db?.drop();
  });

  it("converts stored timestamps to the calendar date in each owner's time zone", async () => {
    const kolkata = await db.createUser();
    const utc = await db.createUser();
    await db.sql`update public.profiles set timezone = 'Asia/Kolkata' where id = ${kolkata}`;
    // 20:00 UTC on the 12th is already the 13th in India.
    const appliedAt = "2026-10-12T20:00:00Z";
    for (const userId of [kolkata, utc]) {
      await db.sql`
        insert into public.job_drives (id, user_id, company_name, role_title, stage, applied_at, apply_by)
        values (gen_random_uuid(), ${userId}, 'Acme', 'Engineer', 'applied', ${appliedAt}::text::timestamptz, ${appliedAt}::text::timestamptz)`;
    }
    const [before] = await db.sql`select updated_at from public.job_drives where user_id = ${kolkata}`;

    await db.applyPendingMigrations();

    const rows = await db.sql`
      select user_id, applied_at::text as applied, apply_by::text as apply_by, updated_at
      from public.job_drives where user_id in (${kolkata}, ${utc})`;
    const byUser = new Map(rows.map((row) => [row.user_id as string, row]));
    assert.equal(byUser.get(kolkata)?.applied, "2026-10-13");
    assert.equal(byUser.get(kolkata)?.apply_by, "2026-10-13");
    assert.equal(byUser.get(utc)?.applied, "2026-10-12");
    assert.deepEqual(byUser.get(kolkata)?.updated_at, before!.updated_at, "conversion must not bump updated_at");
  });
});

describe("interview rounds migration", { skip: skipWithoutDatabase }, () => {
  let db: TestDatabase;
  before(async () => {
    db = await createTestDatabase({ stopBefore: "20261016010000" });
  });
  after(async () => {
    await db?.drop();
  });

  it("turns each consolidated interview into a titled round, keeping its summary in the notes", async () => {
    const userId = await db.createUser();
    const [drive] = await db.sql`
      insert into public.job_drives (id, user_id, company_name, role_title, stage)
      values (gen_random_uuid(), ${userId}, 'Acme', 'Engineer', 'interview') returning id`;
    await db.sql`
      insert into public.interviews (user_id, job_drive_id, company_name, stage, starts_at, timezone, mode, round_summary, notes)
      values (${userId}, ${drive!.id}, 'Acme', 'other', '2020-01-01T10:00:00Z', 'UTC', 'virtual', 'R1 and R2 done', 'Ask about team')`;

    await db.applyPendingMigrations();

    const [round] = await db.sql`select title, kind, status, notes from public.interviews where job_drive_id = ${drive!.id}`;
    assert.equal(round!.title, "Interview");
    assert.equal(round!.kind, "other");
    assert.equal(round!.status, "completed");
    assert.equal(round!.notes, "R1 and R2 done\n\nAsk about team");
  });
});
