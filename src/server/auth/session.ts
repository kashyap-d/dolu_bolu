import "server-only";

import { redirect } from "next/navigation";
import { z } from "zod";

import { isSupabaseConfigured } from "@/server/env";
import { createSupabaseServerClient } from "@/server/supabase/server";

const principalClaimsSchema = z.object({
  sub: z.uuid(),
  email: z.email().optional(),
  user_metadata: z.record(z.string(), z.unknown()).optional(),
});

export interface AuthenticatedPrincipal {
  id: string;
  email: string | null;
  displayName: string | null;
}

export async function getRequestAuth() {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const parsed = principalClaimsSchema.safeParse(data?.claims);

  if (error || !parsed.success) return null;

  const fullName = parsed.data.user_metadata?.full_name;
  const name = parsed.data.user_metadata?.name;
  const displayName =
    typeof fullName === "string" && fullName.trim()
      ? fullName.trim()
      : typeof name === "string" && name.trim()
        ? name.trim()
        : null;

  return {
    supabase,
    principal: {
      id: parsed.data.sub,
      email: parsed.data.email ?? null,
      displayName,
    } satisfies AuthenticatedPrincipal,
  };
}

export async function requirePageAuth() {
  const auth = await getRequestAuth();
  if (!auth) redirect("/login");
  return auth;
}
