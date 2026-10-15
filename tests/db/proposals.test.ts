import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { createTestDatabase, skipWithoutDatabase, type TestDatabase, type Tx } from "./harness";

const drive = {
  companyName: "Acme",
  roleTitle: "Backend Engineer",
  stage: "applied",
  stageOccurredAt: null,
  appliedAt: null,
  applyBy: null,
  location: null,
  sourceUrl: null,
  notes: null,
  assessment: null,
  interviewRounds: [],
};

async function persist(tx: Tx, clientRequestId: string, message = "I applied to Acme for Backend Engineer") {
  const rows = await tx`
    select * from public.persist_job_drive_proposal(
      ${clientRequestId}::uuid, ${message}, 'demo', 'test-model', 'draft:1', 'Record Acme',
      ${tx.json({ ...drive, jobDriveId: null, expectedUpdatedAt: null, isCorrection: false } as never)}::jsonb,
      ${tx.json([{ fieldPath: "companyName", quote: "Acme" }] as never)}::jsonb,
      '[]'::jsonb
    )`;
  return rows[0] as { proposal_id: string; proposal_version: number };
}

async function confirm(tx: Tx, proposalId: string, version: number) {
  const [row] = await tx`
    select public.confirm_job_drive_progress(${proposalId}::uuid, ${version}, ${tx.json(drive as never)}::jsonb, false) as result`;
  return row!.result as { outcome: string; jobDrive?: { id: string } };
}

describe("AI proposals", { skip: skipWithoutDatabase }, () => {
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

  it("persists one proposal per client request and replays it", async () => {
    const requestId = crypto.randomUUID();
    const first = await db.as(asha, (tx) => persist(tx, requestId));
    const replay = await db.as(asha, (tx) => persist(tx, requestId));
    assert.equal(replay.proposal_id, first.proposal_id);
    await assert.rejects(
      db.as(asha, (tx) => persist(tx, requestId, "A different message about Acme")),
      /REQUEST_ID_REUSED/,
    );
  });

  it("refuses evidence that is not quoted from the message", async () => {
    await assert.rejects(
      db.as(asha, (tx) => persist(tx, crypto.randomUUID(), "I applied somewhere")),
      /INVALID_PROPOSAL/,
    );
  });

  it("confirms exactly once and returns the same drive on retry", async () => {
    const proposal = await db.as(asha, (tx) => persist(tx, crypto.randomUUID()));
    const first = await db.as(asha, (tx) => confirm(tx, proposal.proposal_id, proposal.proposal_version));
    assert.equal(first.outcome, "executed");

    const retry = await db.as(asha, (tx) => confirm(tx, proposal.proposal_id, proposal.proposal_version));
    assert.equal(retry.outcome, "already_executed");
    assert.equal(retry.jobDrive?.id, first.jobDrive?.id);

    const drives = await db.sql`select id from public.job_drives where user_id = ${asha} and company_name = 'Acme'`;
    assert.equal(drives.length, 1);
  });

  it("does not let another user confirm or reject someone else's proposal", async () => {
    const proposal = await db.as(asha, (tx) => persist(tx, crypto.randomUUID()));
    const confirmed = await db.as(ravi, (tx) => confirm(tx, proposal.proposal_id, proposal.proposal_version));
    assert.equal(confirmed.outcome, "not_found");
    const [rejected] = await db.as(ravi, (tx) =>
      tx`select public.reject_job_drive_proposal(${proposal.proposal_id}::uuid, ${proposal.proposal_version}) as result`,
    );
    assert.equal((rejected!.result as { outcome: string }).outcome, "not_found");
  });

  it("rejects idempotently and blocks confirmation afterwards", async () => {
    const proposal = await db.as(asha, (tx) => persist(tx, crypto.randomUUID()));
    const reject = (tx: Tx) =>
      tx`select public.reject_job_drive_proposal(${proposal.proposal_id}::uuid, ${proposal.proposal_version}) as result`;
    const [first] = await db.as(asha, reject);
    const [second] = await db.as(asha, reject);
    assert.equal((first!.result as { outcome: string }).outcome, "rejected");
    assert.equal((second!.result as { outcome: string }).outcome, "already_rejected");
    const confirmed = await db.as(asha, (tx) => confirm(tx, proposal.proposal_id, proposal.proposal_version));
    assert.equal(confirmed.outcome, "conflict");
  });

  it("does not let the browser role change proposal execution state directly", async () => {
    const proposal = await db.as(asha, (tx) => persist(tx, crypto.randomUUID()));
    await assert.rejects(
      db.as(asha, (tx) => tx`update public.action_proposals set status = 'executed' where id = ${proposal.proposal_id}`),
      /permission denied/,
    );
  });
});

describe("AI request allowance", { skip: skipWithoutDatabase }, () => {
  let db: TestDatabase;

  before(async () => {
    db = await createTestDatabase();
  });
  after(async () => {
    await db?.drop();
  });

  it("allows exactly the daily limit per user", async () => {
    const asha = await db.createUser();
    const ravi = await db.createUser();
    const consume = (tx: Tx) => tx`select public.consume_ai_request(2, 10, 300) as result`;
    const outcomes = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const [row] = await db.as(asha, consume);
      outcomes.push((row!.result as { outcome: string }).outcome);
    }
    assert.deepEqual(outcomes, ["allowed", "allowed", "limit_reached"]);

    const [other] = await db.as(ravi, consume);
    assert.equal((other!.result as { outcome: string }).outcome, "allowed");
  });

  it("cannot be reset by the user", async () => {
    const asha = await db.createUser();
    await assert.rejects(
      db.as(asha, (tx) => tx`delete from public.ai_usage_daily where user_id = ${asha}`),
      /permission denied/,
    );
  });

  it("requires authentication", async () => {
    const [row] = await db.as(null, (tx) => tx`select public.consume_ai_request(5, 10, 300) as result`);
    assert.equal((row!.result as { outcome: string }).outcome, "auth_required");
  });
});

describe("long source messages", { skip: skipWithoutDatabase }, () => {
  let db: TestDatabase;
  before(async () => {
    db = await createTestDatabase();
  });
  after(async () => {
    await db?.drop();
  });

  it("accepts a pasted email up to 8,000 characters and rejects longer ones", async () => {
    const userId = await db.createUser();
    const email = "I applied to Acme. ".padEnd(8000, "Thank you for your interest in this role. ");
    assert.equal(email.length, 8000);
    const accepted = await db.as(userId, (tx) => persist(tx, crypto.randomUUID(), email));
    assert.ok(accepted.proposal_id);
    await assert.rejects(db.as(userId, (tx) => persist(tx, crypto.randomUUID(), `${email}x`)), /INVALID_PROPOSAL/);
  });
});
