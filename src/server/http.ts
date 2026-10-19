import "server-only";

import * as z from "zod";

import { getRequestAuth } from "@/server/auth/session";
import { isSupabaseConfigured } from "@/server/env";
import { RepositoryError } from "@/server/repositories/errors";

type RequestAuth = NonNullable<Awaited<ReturnType<typeof getRequestAuth>>>;

interface RouteOptions<TSchema extends z.ZodType> {
  schema: TSchema;
  /** Shown when the body fails validation. */
  invalidMessage: string;
  /** Shown when storage fails; the client should be able to retry. */
  unavailableMessage: string;
}

interface Handler<TSchema extends z.ZodType, TAuth, TContext> {
  (input: { auth: TAuth; body: z.output<TSchema> }, context: TContext): Promise<Response>;
}

export function jsonError(
  status: number,
  error: string,
  extra: Record<string, unknown> = {},
) {
  return Response.json({ error, ...extra }, { status });
}

export const unauthenticated = () => jsonError(401, "Authentication required.");

async function readBody<TSchema extends z.ZodType>(
  request: Request,
  options: RouteOptions<TSchema>,
): Promise<{ ok: true; data: z.output<TSchema> } | { ok: false; response: Response }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, response: jsonError(400, "Request body must be valid JSON.") };
  }

  const parsed = options.schema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      response: jsonError(400, options.invalidMessage, {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      }),
    };
  }
  return { ok: true, data: parsed.data };
}

async function run(
  options: { unavailableMessage: string },
  handler: () => Promise<Response>,
) {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof RepositoryError) {
      return jsonError(503, options.unavailableMessage, {
        recovery: "Please try again.",
      });
    }
    throw error;
  }
}

/**
 * Every route is a public endpoint: authenticate, then validate the JSON body
 * against a shared schema, before the handler runs. Storage failures become a
 * retryable 503 without leaking internals.
 */
export function authenticatedJsonRoute<TSchema extends z.ZodType, TContext = unknown>(
  options: RouteOptions<TSchema>,
  handler: Handler<TSchema, RequestAuth, TContext>,
) {
  return async (request: Request, context: TContext) => {
    const auth = await getRequestAuth();
    if (!auth) return unauthenticated();
    const body = await readBody(request, options);
    if (!body.ok) return body.response;
    return run(options, () => handler({ auth, body: body.data }, context));
  };
}

/** An authenticated route without a JSON body (for example a download). */
export function authenticatedRoute<TContext = unknown>(
  options: { unavailableMessage: string },
  handler: (input: { auth: RequestAuth; request: Request }, context: TContext) => Promise<Response>,
) {
  return async (request: Request, context: TContext) => {
    const auth = await getRequestAuth();
    if (!auth) return unauthenticated();
    return run(options, () => handler({ auth, request }, context));
  };
}

/**
 * Like `authenticatedJsonRoute`, but when Supabase is not configured the
 * handler runs for the local preview with `auth: null`.
 */
export function previewableJsonRoute<TSchema extends z.ZodType, TContext = unknown>(
  options: RouteOptions<TSchema>,
  handler: Handler<TSchema, RequestAuth | null, TContext>,
) {
  return async (request: Request, context: TContext) => {
    const auth = isSupabaseConfigured() ? await getRequestAuth() : null;
    if (isSupabaseConfigured() && !auth) return unauthenticated();
    const body = await readBody(request, options);
    if (!body.ok) return body.response;
    return run(options, () => handler({ auth, body: body.data }, context));
  };
}

/** Route segment ids are untrusted; anything that is not a UUID is simply not found. */
export function parseId(value: string) {
  const parsed = z.uuid().safeParse(value);
  return parsed.success ? parsed.data : null;
}
