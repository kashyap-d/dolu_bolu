import "server-only";

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
