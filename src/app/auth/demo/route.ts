import { NextRequest, NextResponse } from "next/server";

import { isDemoSignInEnabled } from "@/server/env";
import {
  copySupabaseResponseState,
  createSupabaseResponseClient,
} from "@/server/supabase/response";

/**
 * Starts a private demo workspace: an anonymous Supabase user with sample
 * drives, deleted after 7 days (docs/decisions/0021).
 */
export async function POST(request: NextRequest) {
  const failed = (reason: string) =>
    NextResponse.redirect(new URL(`/login?error=${reason}`, request.url), 303);
  if (!isDemoSignInEnabled()) return failed("demo_unavailable");

  const authResponse = NextResponse.next();
  const supabase = createSupabaseResponseClient(request, authResponse);
  const { error } = await supabase.auth.signInAnonymously();
  if (error) return copySupabaseResponseState(authResponse, failed("demo"));

  // The new session is already on this client, so the RPC runs as the demo user.
  const { error: seedError } = await supabase.rpc("seed_demo_workspace");
  if (seedError) return copySupabaseResponseState(authResponse, failed("demo"));

  return copySupabaseResponseState(authResponse, NextResponse.redirect(new URL("/app", request.url), 303));
}
