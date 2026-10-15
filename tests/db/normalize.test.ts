import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { normalizeCompanyName, normalizeRoleTitle } from "../../src/features/job-drives/normalize";
import { primaryJobDriveStages, terminalJobDriveStages } from "../../src/features/job-drives/stage-rules";
import { createTestDatabase, skipWithoutDatabase, type TestDatabase } from "./harness";

const companies = [
  "Globex Pvt. Ltd.", "globex", "The Acme Corporation", "Acme Co.", "AT&T", "Procter & Gamble Co",
  "Zeta Technologies Private Limited", "  Infosys  Limited ", "Company", "Co-op Bank", "Café Coffee Day",
  "टाटा", "", "Inc", "Johnson & Johnson Inc. LLC",
];
const roles = [
  "Sr. Software Engineer", "senior software engineer", "SWE II", "SDE-1", "Jr Frontend Dev",
  "sr sr", "Engineer (Backend)", "Sprint Lead", "SRE", "नौकरी", "",
];

describe("name normalisation parity", { skip: skipWithoutDatabase }, () => {
  let db: TestDatabase;
  before(async () => {
    db = await createTestDatabase();
  });
  after(async () => {
    await db?.drop();
  });

  it("matches SQL for company names", async () => {
    for (const value of companies) {
      const [row] = await db.sql`select public.normalize_company_name(${value}) as normalized`;
      assert.equal(normalizeCompanyName(value), row!.normalized, JSON.stringify(value));
    }
  });

  it("matches SQL for role titles", async () => {
    for (const value of roles) {
      const [row] = await db.sql`select public.normalize_role_title(${value}) as normalized`;
      assert.equal(normalizeRoleTitle(value), row!.normalized, JSON.stringify(value));
    }
  });
});

describe("stage order parity", { skip: skipWithoutDatabase }, () => {
  let db: TestDatabase;
  before(async () => {
    db = await createTestDatabase();
  });
  after(async () => {
    await db?.drop();
  });

  it("ranks the primary stages in the same order as stage-rules.ts", async () => {
    const rows = await db.sql`
      select stage, public.job_drive_stage_rank(stage) as rank
      from unnest(${db.sql.array([...primaryJobDriveStages, ...terminalJobDriveStages])}::text[]) as stage`;
    const ranked = rows
      .filter((row) => row.rank !== null)
      .sort((left, right) => (left.rank as number) - (right.rank as number))
      .map((row) => row.stage);
    assert.deepEqual(ranked, [...primaryJobDriveStages]);
    assert.ok(rows.filter((row) => terminalJobDriveStages.includes(row.stage)).every((row) => row.rank === null));
  });
});
