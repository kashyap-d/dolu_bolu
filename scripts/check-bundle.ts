/**
 * Fails when the browser bundle grows past its budget or regains code that
 * should never ship to the client (docs/decisions/0022). Run after
 * `next build`; reads .next/static/chunks.
 */
import { readdir, readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

const BUDGET_TOTAL_GZIP_KB = 290;
const BUDGET_LARGEST_CHUNK_GZIP_KB = 75;

/** Text that only appears if a server-only or unused library part was bundled. */
const forbidden: Array<{ label: string; pattern: RegExp }> = [
  { label: "Zod locale messages (import zod as a namespace)", pattern: /Nieprawidłowe|Ungültige Eingabe/ },
  { label: "Gemini adapter (server-only)", pattern: /generativelanguage\.googleapis\.com/ },
  { label: "Supabase service code", pattern: /consume_ai_request|delete_my_account/ },
];

async function main() {
  const directory = new URL("../.next/static/chunks/", import.meta.url);
  const files = (await readdir(directory)).filter((name) => name.endsWith(".js"));
  if (files.length === 0) throw new Error("No client chunks found. Run `npm run build` first.");

  let total = 0;
  let largest = { name: "", size: 0 };
  const problems: string[] = [];

  for (const name of files) {
    const source = await readFile(new URL(name, directory));
    const size = gzipSync(source).length / 1024;
    total += size;
    if (size > largest.size) largest = { name, size };
    const text = source.toString("utf8");
    for (const { label, pattern } of forbidden) {
      if (pattern.test(text)) problems.push(`${name} contains ${label}`);
    }
  }

  if (total > BUDGET_TOTAL_GZIP_KB) {
    problems.push(`client JavaScript is ${total.toFixed(1)} KB gzipped (budget ${BUDGET_TOTAL_GZIP_KB} KB)`);
  }
  if (largest.size > BUDGET_LARGEST_CHUNK_GZIP_KB) {
    problems.push(`${largest.name} is ${largest.size.toFixed(1)} KB gzipped (budget ${BUDGET_LARGEST_CHUNK_GZIP_KB} KB)`);
  }

  process.stdout.write(
    `Client JavaScript: ${total.toFixed(1)} KB gzipped in ${files.length} chunks; largest ${largest.size.toFixed(1)} KB.\n`,
  );
  if (problems.length) {
    process.stderr.write(`Bundle check failed:\n${problems.map((problem) => `- ${problem}`).join("\n")}\n`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
