import { readdir, readFile } from "node:fs/promises";

import postgres from "postgres";

const adminUrl = process.env.TEST_DATABASE_URL;

/** Database tests skip themselves unless a test server is available. */
export const skipWithoutDatabase = adminUrl
  ? false
  : "TEST_DATABASE_URL is not set (run `npm run test:db`)";

const root = new URL("../../", import.meta.url);

async function migrationFiles() {
  const directory = new URL("supabase/migrations/", root);
  const names = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  return Promise.all(names.map(async (name) => ({ name, sql: await readFile(new URL(name, directory), "utf8") })));
}

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;

/**
 * Creates an isolated database with the Supabase shim and every migration
 * applied in order — the same path a real project takes.
 */
export async function createTestDatabase(options: { stopBefore?: string } = {}) {
  if (!adminUrl) throw new Error("TEST_DATABASE_URL is not set.");
  const name = `dolu_bolu_test_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
  await admin.unsafe(`create database ${name}`);

  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const sql = postgres(url.toString(), { max: 4, onnotice: () => {} });

  // Roles are cluster-wide, so a previous run may already have created them.
  const shim = await readFile(new URL("tests/db/supabase-shim.sql", root), "utf8");
  await sql.unsafe(
    shim.replace(
      /create role (\w+) nologin( bypassrls)?;/g,
      (_match, role: string, bypass = "") =>
        `do $$ begin create role ${role} nologin${bypass}; exception when duplicate_object then null; end $$;`,
    ),
  );
  const migrations = await migrationFiles();
  const applyMigrations = async (selected: typeof migrations) => {
    for (const migration of selected) {
      try {
        await sql.unsafe(migration.sql);
      } catch (error) {
        throw new Error(`Migration ${migration.name} failed: ${(error as Error).message}`);
      }
    }
  };
  const isPending = (name: string) => Boolean(options.stopBefore && name >= options.stopBefore);
  await applyMigrations(migrations.filter((migration) => !isPending(migration.name)));

  return {
    sql,

    /** Applies the migrations held back by `stopBefore`, to test data conversions. */
    applyPendingMigrations: () => applyMigrations(migrations.filter((migration) => isPending(migration.name))),

    /** Inserts a user the way Supabase Auth would (which also creates the profile). */
    async createUser(metadata: Record<string, unknown> = {}) {
      const id = crypto.randomUUID();
      await sql`insert into auth.users (id, raw_user_meta_data) values (${id}, ${sql.json(metadata as postgres.JSONValue)})`;
      return id;
    },

    /** Runs `fn` as the given user through the `authenticated` API role, like PostgREST does. */
    as<T>(userId: string | null, fn: (tx: Tx) => Promise<T>) {
      return sql.begin(async (tx) => {
        await tx`select set_config('request.jwt.claim.sub', ${userId ?? ""}, true)`;
        await tx.unsafe("set local role authenticated");
        return fn(tx);
      }) as Promise<T>;
    },

    async drop() {
      await sql.end();
      await admin.unsafe(`drop database ${name} with (force)`);
      await admin.end();
    },
  };
}

export type TestDatabase = Awaited<ReturnType<typeof createTestDatabase>>;
