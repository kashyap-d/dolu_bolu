import "server-only";

import { redirect } from "next/navigation";

import { principalFromClaims } from "@/server/auth/principal";
import { isSupabaseConfigured } from "@/server/env";
import { createSupabaseServerClient } from "@/server/supabase/server";

export async function getRequestAuth() {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const principal = error ? null : principalFromClaims(data?.claims);
  if (!principal) return null;
  return { supabase, principal };
}

export async function requirePageAuth() {
  const auth = await getRequestAuth();
  if (!auth) redirect("/login");
  return auth;
}

export type { AuthenticatedPrincipal } from "@/server/auth/principal";
