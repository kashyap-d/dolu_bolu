import { NextResponse, type NextRequest } from "next/server";

import { isAppPath } from "@/lib/safe-next-path";
import { isSupabaseConfigured } from "@/server/env";
import { copySupabaseResponseState } from "@/server/supabase/response";
import { refreshSupabaseSession } from "@/server/supabase/proxy";

export async function proxy(request: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.next();

  const session = await refreshSupabaseSession(request);
  const path = request.nextUrl.pathname;

  if (isAppPath(path) && !session.authenticated) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${path}${request.nextUrl.search}`);
    return copySupabaseResponseState(
      session.response,
      NextResponse.redirect(loginUrl),
    );
  }

  if (path === "/login" && session.authenticated) {
    return copySupabaseResponseState(
      session.response,
      NextResponse.redirect(new URL("/app", request.url)),
    );
  }

  return session.response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
