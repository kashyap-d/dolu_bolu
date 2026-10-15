import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { createTestDatabase, skipWithoutDatabase, type TestDatabase, type Tx } from "./harness";

const outcome = (rows: Array<Record<string, unknown>>) => (rows[0]!.result as { outcome: string }).outcome;

describe("demo workspaces", { skip: skipWithoutDatabase }, () => {
  let db: TestDatabase;
  before(async () => {
    db = await createTestDatabase();
  });
  after(async () => {
    await db?.drop();
  });

  it("seeds a demo user's empty workspace once, with something in every agenda section", async () => {
    const demo = await db.createUser({}, { anonymous: true });
    const seed = (tx: Tx) => tx`select public.seed_demo_workspace() as result`;
    assert.equal(outcome(await db.as(demo, seed)), "seeded");
    assert.equal(outcome(await db.as(demo, seed)), "already_seeded");

    // What the user can see through RLS, rebuilt with the same JSON the app receives.
    const ids = await db.as(demo, (tx) => tx`select id from public.job_drives`);
    const drives = await db.sql`
      select public.job_drive_json(id, ${demo}) as drive from public.job_drives where id in ${db.sql(ids.map((row) => row.id as string))}`;
    assert.equal(drives.length, 6);
    const stages = drives.map((row) => (row.drive as { stage: string }).stage).sort();
    assert.deepEqual(stages, ["applied", "assessment", "interview", "interview", "planned", "rejected"]);

    const rounds = await db.sql`select status, starts_at < now() as past from public.interviews where user_id = ${demo}`;
    assert.ok(rounds.some((round) => round.status === "scheduled" && round.past), "a loose end");
    assert.ok(rounds.some((round) => round.status === "scheduled" && !round.past), "an upcoming round");

    const [quiet] = await db.sql`select updated_at < now() - interval '21 days' as quiet from public.job_drives where user_id = ${demo} and company_name = 'Meesho'`;
    assert.equal(quiet!.quiet, true);
    const events = await db.sql`select metadata ->> 'source' as source from public.activity_events where user_id = ${demo}`;
    assert.ok(events.length === 6 && events.every((event) => event.source === "demo"));
  });

  it("never seeds a real account", async () => {
    const real = await db.createUser();
    assert.equal(outcome(await db.as(real, (tx) => tx`select public.seed_demo_workspace() as result`)), "not_demo");
  });

  it("gives demo users a smaller allowance and caps all demo users together", async () => {
    const consume = (tx: Tx) => tx`select public.consume_ai_request(50, 2, 3) as result`;
    const first = await db.createUser({}, { anonymous: true });
    const second = await db.createUser({}, { anonymous: true });
    const real = await db.createUser();

    const firstOutcomes = [];
    for (let i = 0; i < 3; i += 1) firstOutcomes.push(outcome(await db.as(first, consume)));
    assert.deepEqual(firstOutcomes, ["allowed", "allowed", "limit_reached"]);

    // One request left in the shared demo pool of three.
    assert.equal(outcome(await db.as(second, consume)), "allowed");
    assert.equal(outcome(await db.as(second, consume)), "demo_capacity_reached");
    const [personal] = await db.sql`select request_count from public.ai_usage_daily where user_id = ${second}`;
    assert.equal(personal!.request_count, 1, "a refused request is not counted against the user");

    // Real accounts are unaffected by the demo pool.
    assert.equal(outcome(await db.as(real, consume)), "allowed");
  });

  it("deletes demo accounts after seven days, and nothing else", async () => {
    const oldDemo = await db.createUser({}, { anonymous: true });
    const newDemo = await db.createUser({}, { anonymous: true });
    const oldReal = await db.createUser();
    await db.as(oldDemo, (tx) => tx`select public.seed_demo_workspace()`);
    await db.sql`update auth.users set created_at = now() - interval '8 days' where id in (${oldDemo}, ${oldReal})`;

    const [row] = await db.sql`select public.delete_expired_demo_accounts() as deleted`;
    assert.ok((row!.deleted as number) >= 1);
    const remaining = await db.sql`select id from auth.users where id in (${oldDemo}, ${newDemo}, ${oldReal})`;
    assert.deepEqual(remaining.map((user) => user.id).sort(), [newDemo, oldReal].sort());
    const orphans = await db.sql`select 1 from public.job_drives where user_id = ${oldDemo}`;
    assert.equal(orphans.length, 0);
  });

  it("does not let the API call the cleanup", async () => {
    const demo = await db.createUser({}, { anonymous: true });
    await assert.rejects(db.as(demo, (tx) => tx`select public.delete_expired_demo_accounts()`), /permission denied/);
  });
});
