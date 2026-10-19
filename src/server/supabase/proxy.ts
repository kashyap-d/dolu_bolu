import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { principalFromClaims } from "@/server/auth/principal";
import { getSupabaseEnvironment } from "@/server/env";

export async function refreshSupabaseSession(request: NextRequest) {
  const environment = getSupabaseEnvironment();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          response = NextResponse.next({ request });

          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
          Object.entries(headers).forEach(([name, value]) => {
            response.headers.set(name, value);
          });
        },
      },
    },
  );

  const { data, error } = await supabase.auth.getClaims();

  return {
    // The same rule as the page layout, so the two can never disagree and
    // redirect between /login and /app forever.
    authenticated: !error && principalFromClaims(data?.claims) !== null,
    response,
  };
}
