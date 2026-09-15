import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

import { getSupabaseEnvironment } from "@/server/env";

const authResponseHeaders = ["cache-control", "expires", "pragma"] as const;

export function createSupabaseResponseClient(
  request: NextRequest,
  response: NextResponse,
) {
  const environment = getSupabaseEnvironment();

  return createServerClient(
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
}

export function copySupabaseResponseState(
  source: NextResponse,
  target: NextResponse,
) {
  source.cookies.getAll().forEach((cookie) => target.cookies.set(cookie));

  authResponseHeaders.forEach((name) => {
    const value = source.headers.get(name);
    if (value) target.headers.set(name, value);
  });

  return target;
}
