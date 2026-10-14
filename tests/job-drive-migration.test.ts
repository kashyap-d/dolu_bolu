import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const migrationUrl = new URL("../supabase/migrations/20260916000000_job_drive_foundation.sql", import.meta.url);

describe("Job Drive migration", () => {
  it("renames records and relationships instead of replacing their UUIDs", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    assert.match(sql, /alter table public\.applications rename to job_drives/i);
    assert.match(sql, /alter table public\.interviews rename column application_id to job_drive_id/i);
    assert.match(sql, /alter table public\.tasks rename column application_id to job_drive_id/i);
    assert.doesNotMatch(sql, /drop table public\.applications/i);
    assert.match(sql, /disable trigger applications_set_updated_at[\s\S]*update public\.job_drives[\s\S]*enable trigger applications_set_updated_at/i);
  });

  it("contains every legacy status mapping and expires obsolete proposals", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    for (const mapping of ["when 'saved' then 'planned'", "when 'screening' then 'applied'", "when 'interviewing' then 'interview'"]) assert.match(sql, new RegExp(mapping));
    assert.match(sql, /kind = 'create_application'[\s\S]*status = 'pending'/i);
  });

  it("uses atomic RPCs for drive saves and confirmed assistant updates", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    assert.match(sql, /create or replace function public\.save_job_drive/i);
    assert.match(sql, /create or replace function public\.confirm_job_drive_progress/i);
    assert.match(sql, /insert into public\.activity_events/i);
    assert.match(sql, /p_expected_updated_at/i);
  });
});
