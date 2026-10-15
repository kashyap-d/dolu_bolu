/**
 * Normalised names for matching and duplicate detection, so "Globex Pvt.
 * Ltd." and "globex" are recognised as the same company. These mirror
 * public.normalize_company_name / normalize_role_title exactly;
 * tests/db/normalize.test.ts checks that they agree.
 */

const companySuffix =
  / (private limited|pvt ltd|pvt|ltd|limited|inc|incorporated|llc|llp|plc|corp|corporation|co|company|gmbh)$/;

function collapse(value: string) {
  return value.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function orOriginal(normalized: string, original: string) {
  // Names with no ASCII letters or digits keep their original form.
  return normalized || original.trim().toLowerCase();
}

export function normalizeCompanyName(value: string) {
  let normalized = collapse(value.toLowerCase().replaceAll("&", " and ")).replace(/^the /, "");
  for (let previous = ""; previous !== normalized; ) {
    previous = normalized;
    normalized = normalized.replace(companySuffix, "");
  }
  return orOriginal(normalized, value);
}

const roleAbbreviations: Array<[RegExp, string]> = [
  [/(^| )sr(?= |$)/g, "$1senior"],
  [/(^| )jr(?= |$)/g, "$1junior"],
  [/(^| )swe(?= |$)/g, "$1software engineer"],
  [/(^| )sde(?= |$)/g, "$1software development engineer"],
];

export function normalizeRoleTitle(value: string) {
  let normalized = collapse(value.toLowerCase());
  for (const [pattern, replacement] of roleAbbreviations) {
    normalized = normalized.replace(pattern, replacement);
  }
  return orOriginal(normalized, value);
}
