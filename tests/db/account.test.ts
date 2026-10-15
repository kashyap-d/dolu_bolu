import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { createTestDatabase, skipWithoutDatabase, type TestDatabase, type Tx } from "./harness";

const userTables = [
  "profiles", "job_drives", "job_drive_assessments", "interviews", "tasks",
  "proposal_batches", "action_proposals", "activity_events", "ai_usage_daily",
];

async function seed(tx: Tx) {
  const drive = {
    companyName: "Acme", roleTitle: "Engineer", stage: "assessment", stageOccurredAt: null,
    appliedAt: "2026-10-01", applyBy: null, location: null, sourceUrl: null, notes: "private",
    assessment: { status: "invited", availableFrom: null, dueAt: null, durationMinutes: null, assessmentUrl: null, notes: null },
    interview: { nextScheduledAt: null, timeZone: null, mode: "unknown", location: null, meetingUrl: null, roundSummary: "R1", notes: null },
  };
  await tx`select public.save_job_drive(gen_random_uuid(), null, ${tx.json(drive as never)}::jsonb, false, false)`;
  await tx`select public.consume_ai_request(5)`;
  await tx`
    select * from public.persist_job_drive_proposal(
      gen_random_uuid(), 'I applied to Acme', 'demo', 'model', 'draft:1', 'Record Acme',
      ${tx.json({ ...drive, interview: null, assessment: null, jobDriveId: null, expectedUpdatedAt: null, isCorrection: false } as never)}::jsonb,
      ${tx.json([{ fieldPath: "companyName", quote: "Acme" }] as never)}::jsonb, '[]'::jsonb)`;
}

async function rowCounts(db: TestDatabase, userId: string) {
  const counts: Record<string, number> = {};
  for (const table of userTables) {
    const column = table === "profiles" ? "id" : "user_id";
    const [row] = await db.sql.unsafe(`select count(*)::int as n from public.${table} where ${column} = $1`, [userId]);
    counts[table] = row!.n as number;
  }
  return counts;
}

describe("account deletion", { skip: skipWithoutDatabase }, () => {
  let db: TestDatabase;
  before(async () => {
    db = await createTestDatabase();
  });
  after(async () => {
    await db?.drop();
  });

  it("requires the confirmation phrase", async () => {
    const userId = await db.createUser();
    const [row] = await db.as(userId, (tx) => tx`select public.delete_my_account('yes') as result`);
    assert.equal((row!.result as { outcome: string }).outcome, "confirmation_required");
    const [user] = await db.sql`select 1 from auth.users where id = ${userId}`;
    assert.ok(user);
  });

  it("removes the user and every row they own, and nobody else's", async () => {
    const asha = await db.createUser();
    const ravi = await db.createUser();
    await db.as(asha, seed);
    await db.as(ravi, seed);

    const [row] = await db.as(asha, (tx) => tx`select public.delete_my_account('delete my account') as result`);
    assert.equal((row!.result as { outcome: string }).outcome, "deleted");

    assert.deepEqual(Object.values(await rowCounts(db, asha)).filter((count) => count > 0), []);
    const remaining = await rowCounts(db, ravi);
    assert.ok(remaining.job_drives === 1 && remaining.activity_events === 1 && remaining.profiles === 1);
  });

  it("requires authentication", async () => {
    const [row] = await db.as(null, (tx) => tx`select public.delete_my_account('delete my account') as result`);
    assert.equal((row!.result as { outcome: string }).outcome, "auth_required");
  });
});
