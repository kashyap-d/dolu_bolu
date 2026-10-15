/**
 * Generates src/server/supabase/database.types.ts from the migrations, in the
 * shape `supabase gen types typescript` produces, without Docker or a hosted
 * project: it applies every migration to a throwaway database and reads the
 * catalog. Run with `npm run db:types`; CI fails if the file is stale.
 */
import { writeFile } from "node:fs/promises";

import { createTestDatabase } from "../tests/db/harness";

const outputUrl = new URL("../src/server/supabase/database.types.ts", import.meta.url);

const scalarTypes: Record<string, string> = {
  bool: "boolean",
  int2: "number",
  int4: "number",
  int8: "number",
  float4: "number",
  float8: "number",
  numeric: "number",
  json: "Json",
  jsonb: "Json",
  void: "undefined",
};

function tsType(udtName: string): string {
  if (udtName.startsWith("_")) return `${tsType(udtName.slice(1))}[]`;
  return scalarTypes[udtName] ?? "string";
}

function property(name: string, type: string, optional: boolean) {
  return `${JSON.stringify(name).replace(/^"([a-z_][a-z0-9_]*)"$/, "$1")}${optional ? "?" : ""}: ${type}`;
}

function block(lines: string[], indent: string) {
  return lines.length ? `{\n${lines.map((line) => `${indent}  ${line}`).join("\n")}\n${indent}}` : "{ [_ in never]: never }";
}

async function main() {
  const db = await createTestDatabase();
  try {
    const columns = await db.sql<
      { table_name: string; column_name: string; udt_name: string; is_nullable: string; has_default: boolean; is_identity: string }[]
    >`
      select c.table_name, c.column_name, c.udt_name, c.is_nullable,
        c.column_default is not null as has_default, c.is_identity
      from information_schema.columns as c
      join information_schema.tables as t using (table_schema, table_name)
      where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
      order by c.table_name, c.ordinal_position`;

    const relationships = await db.sql<
      { table_name: string; name: string; columns: string[]; referenced_table: string; referenced_columns: string[]; one_to_one: boolean }[]
    >`
      select con.conrelid::regclass::text as table_name, con.conname as name,
        array(select attname from unnest(con.conkey) with ordinality k(n, i) join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.n order by k.i)::text[] as columns,
        regexp_replace(con.confrelid::regclass::text, '^public\\.', '') as referenced_table,
        array(select attname from unnest(con.confkey) with ordinality k(n, i) join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.n order by k.i)::text[] as referenced_columns,
        exists (
          select 1 from pg_index as ix
          where ix.indrelid = con.conrelid and ix.indisunique
            and (select array_agg(x order by x) from unnest(ix.indkey::int2[]) as x) = (select array_agg(x order by x) from unnest(con.conkey) as x)
        ) as one_to_one
      from pg_constraint as con
      where con.contype = 'f' and con.connamespace = 'public'::regnamespace
        and con.confrelid::regclass::text not like 'auth.%'
      order by 1, 2`;

    const functions = await db.sql<
      { name: string; arg_names: string[] | null; arg_types: string[]; arg_modes: string[] | null; default_count: number; return_type: string; returns_set: boolean }[]
    >`
      select p.proname as name, p.proargnames as arg_names,
        array(select t.typname from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) with ordinality u(oid, i) join pg_type t on t.oid = u.oid order by u.i)::text[] as arg_types,
        p.proargmodes::text[] as arg_modes, p.pronargdefaults as default_count,
        rt.typname as return_type, p.proretset as returns_set
      from pg_proc as p
      join pg_type as rt on rt.oid = p.prorettype
      where p.pronamespace = 'public'::regnamespace and rt.typname <> 'trigger'
        -- Extension functions (pgcrypto lands in public on plain Postgres).
        and not exists (select 1 from pg_depend as d where d.objid = p.oid and d.deptype = 'e')
      order by p.proname`;

    const tables = new Map<string, Array<(typeof columns)[number]>>();
    for (const column of columns) tables.set(column.table_name, [...(tables.get(column.table_name) ?? []), column]);

    const tableLines = [...tables].map(([table, tableColumns]) => {
      const row = tableColumns.map((c) => property(c.column_name, `${tsType(c.udt_name)}${c.is_nullable === "YES" ? " | null" : ""}`, false));
      const insert = tableColumns.map((c) =>
        property(
          c.column_name,
          `${tsType(c.udt_name)}${c.is_nullable === "YES" ? " | null" : ""}`,
          c.is_nullable === "YES" || c.has_default || c.is_identity === "YES",
        ),
      );
      const update = tableColumns.map((c) => property(c.column_name, `${tsType(c.udt_name)}${c.is_nullable === "YES" ? " | null" : ""}`, true));
      const rels = relationships
        .filter((r) => r.table_name === table)
        .map(
          (r) =>
            `{ foreignKeyName: ${JSON.stringify(r.name)}; columns: ${JSON.stringify(r.columns)}; isOneToOne: ${r.one_to_one}; referencedRelation: ${JSON.stringify(r.referenced_table)}; referencedColumns: ${JSON.stringify(r.referenced_columns)} }`,
        );
      return `${table}: {\n        Row: ${block(row, "        ")}\n        Insert: ${block(insert, "        ")}\n        Update: ${block(update, "        ")}\n        Relationships: [${rels.length ? `\n          ${rels.join(",\n          ")}\n        ` : ""}]\n      }`;
    });

    const functionLines = functions.map((fn) => {
      const modes = fn.arg_modes ?? fn.arg_types.map(() => "i");
      const names = fn.arg_names ?? [];
      const inputs = fn.arg_types
        .map((type, index) => ({ type, name: names[index] ?? `arg${index}`, mode: modes[index] }))
        .filter((arg) => arg.mode === "i" || arg.mode === "b");
      const firstDefault = inputs.length - fn.default_count;
      // SQL arguments accept NULL, which several functions rely on (e.g. no expected version on create).
      const args = inputs.map((arg, index) => property(arg.name, `${tsType(arg.type)} | null`, index >= firstDefault));
      const outputs = fn.arg_types
        .map((type, index) => ({ type, name: names[index] ?? `column${index}`, mode: modes[index] }))
        .filter((arg) => arg.mode === "t" || arg.mode === "o");
      const returns = outputs.length
        ? `${block(outputs.map((arg) => property(arg.name, tsType(arg.type), false)), "        ")}${fn.returns_set ? "[]" : ""}`
        : `${tsType(fn.return_type)}${fn.returns_set ? "[]" : ""}`;
      return `${fn.name}: {\n        Args: ${block(args, "        ")}\n        Returns: ${returns}\n      }`;
    });

    const source = `// Generated by \`npm run db:types\` from supabase/migrations. Do not edit.
// Same shape as \`supabase gen types typescript\`, except function arguments admit null.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      ${tableLines.join("\n      ")}
    }
    Views: { [_ in never]: never }
    Functions: {
      ${functionLines.join("\n      ")}
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
};
`;
    await writeFile(outputUrl, source);
    process.stdout.write(`Wrote ${tables.size} tables and ${functions.length} functions.\n`);
  } finally {
    await db.drop();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
