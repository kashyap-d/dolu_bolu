import "server-only";

import type { z } from "zod";

/**
 * A storage failure the user can retry. Messages are for server logs only;
 * route handlers translate this into a generic "try again" response.
 */
export class RepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepositoryError";
  }
}

/**
 * Stored data that no longer matches the domain contract — usually a database
 * that is missing a migration. Names the failing fields and rules (never the
 * values, which may be personal data) so the cause is obvious from the log.
 */
export function invalidStoredData(what: string, error: z.ZodError) {
  const fields = error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
  return new RepositoryError(
    `Stored ${what} is invalid (${fields}). Check that every migration in supabase/migrations has been applied.`,
  );
}
