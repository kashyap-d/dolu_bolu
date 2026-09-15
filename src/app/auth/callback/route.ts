import { NextRequest, NextResponse } from "next/server";

import { safeNextPath } from "@/lib/safe-next-path";
import { isSupabaseConfigured } from "@/server/env";
import {
  copySupabaseResponseState,
  createSupabaseResponseClient,
} from "@/server/supabase/response";

export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(new URL("/login?error=configuration", request.url));
  }

  const code = request.nextUrl.searchParams.get("code");
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=oauth", request.url));
  }

  const response = NextResponse.redirect(new URL(next, request.url));
  const supabase = createSupabaseResponseClient(request, response);
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return copySupabaseResponseState(
      response,
      NextResponse.redirect(new URL("/login?error=oauth", request.url)),
    );
  }

  return response;
}
