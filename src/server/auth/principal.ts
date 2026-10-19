import "server-only";

import { z } from "zod";

/**
 * Only `sub` decides whether a session is signed in, the same rule
 * src/proxy.ts applies. Optional profile claims fall back to "unknown"
 * instead of failing: if they could reject a session the proxy accepts, the
 * proxy (login → /app) and the layout (/app → login) would redirect forever.
 * Anonymous (demo) users, for example, have `email: ""`.
 */
const claimsSchema = z.object({
  sub: z.uuid(),
  email: z.email().optional().catch(undefined),
  user_metadata: z.record(z.string(), z.unknown()).optional().catch(undefined),
  is_anonymous: z.boolean().optional().catch(undefined),
});

export interface AuthenticatedPrincipal {
  id: string;
  email: string | null;
  displayName: string | null;
  /** A demo workspace from anonymous sign-in, deleted after 7 days. */
  isAnonymous: boolean;
}

function nonEmpty(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function principalFromClaims(claims: unknown): AuthenticatedPrincipal | null {
  const parsed = claimsSchema.safeParse(claims);
  if (!parsed.success) return null;
  const metadata = parsed.data.user_metadata ?? {};
  return {
    id: parsed.data.sub,
    email: parsed.data.email ?? null,
    displayName: nonEmpty(metadata.full_name) ?? nonEmpty(metadata.name),
    isAnonymous: parsed.data.is_anonymous ?? false,
  };
}
