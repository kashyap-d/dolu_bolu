import { NextRequest, NextResponse } from "next/server";

import { safeNextPath } from "@/lib/safe-next-path";
import { isSupabaseConfigured } from "@/server/env";
import {
  copySupabaseResponseState,
  createSupabaseResponseClient,
} from "@/server/supabase/response";

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(
      new URL("/login?error=configuration", request.url),
      303,
    );
  }

  const formData = await request.formData();
  const next = safeNextPath(formData.get("next"));
  const callback = new URL("/auth/callback", request.url);
  callback.searchParams.set("next", next);

  const authResponse = NextResponse.next();
  const supabase = createSupabaseResponseClient(request, authResponse);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callback.toString(),
      skipBrowserRedirect: true,
    },
  });

  if (error || !data.url) {
    return copySupabaseResponseState(
      authResponse,
      NextResponse.redirect(new URL("/login?error=oauth", request.url), 303),
    );
  }

  return copySupabaseResponseState(
    authResponse,
    NextResponse.redirect(data.url, 303),
  );
}
