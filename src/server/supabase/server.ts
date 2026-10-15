import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { getSupabaseEnvironment } from "@/server/env";

import type { Database } from "./database.types";

/** A Supabase client typed from the migrations (see `npm run db:types`). */
export type AppSupabaseClient = SupabaseClient<Database>;

export async function createSupabaseServerClient(): Promise<AppSupabaseClient> {
  const cookieStore = await cookies();
  const environment = getSupabaseEnvironment();

  return createServerClient<Database>(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components cannot write cookies; src/proxy.ts refreshes
            // sessions before authenticated pages reach this client.
          }
        },
      },
    },
  );
}

