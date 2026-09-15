import { NextRequest, NextResponse } from "next/server";

import { isSupabaseConfigured } from "@/server/env";
import { createSupabaseResponseClient } from "@/server/supabase/response";

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login", request.url), 303);

  if (!isSupabaseConfigured()) return response;

  const supabase = createSupabaseResponseClient(request, response);
  await supabase.auth.signOut({ scope: "local" });
  return response;
}
