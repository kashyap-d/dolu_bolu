import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { createTestDatabase, skipWithoutDatabase, type TestDatabase } from "./harness";

describe("migrations", { skip: skipWithoutDatabase }, () => {
  let db: TestDatabase;
  before(async () => {
    db = await createTestDatabase();
  });
  after(async () => {
    await db?.drop();
  });

  it("apply cleanly in order and create a profile for each new user", async () => {
    const userId = await db.createUser({ full_name: "Asha Rao" });
    const [profile] = await db.sql`select display_name from public.profiles where id = ${userId}`;
    assert.equal(profile?.display_name, "Asha Rao");
  });
});
