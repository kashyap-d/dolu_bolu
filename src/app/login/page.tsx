import { LockKeyhole, Sparkles } from "lucide-react";

import { safeNextPath } from "@/lib/safe-next-path";
import { isSupabaseConfigured } from "@/server/env";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const query = await searchParams;
  const configured = isSupabaseConfigured();

  return (
    <main className="grid min-h-screen place-items-center px-5 py-12">
      <section className="w-full max-w-md rounded-[28px] border border-[#dfe5dc] bg-white p-7 shadow-[0_24px_80px_rgba(55,74,58,0.1)] sm:p-9">
        <span className="grid size-11 place-items-center rounded-2xl bg-[#294435] text-white">
          <Sparkles size={20} />
        </span>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-[#718071]">
          dolu bolu
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-manrope)] text-3xl font-semibold tracking-[-0.05em] text-[#202820]">
          Your search, kept together.
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#747c72]">
          Sign in to keep application proposals and approved records private and available after reload.
        </p>

        <div className="mt-7">
          {configured ? (
            <form action="/auth/google" method="post">
              <input
                name="next"
                type="hidden"
                value={safeNextPath(query.next ?? null)}
              />
              <button
                className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#294435] px-5 text-sm font-semibold text-white transition hover:bg-[#365642] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#294435]"
                type="submit"
              >
                Continue with Google
              </button>
            </form>
          ) : (
            <div className="rounded-2xl bg-[#fff8eb] p-4 text-sm leading-6 text-[#725e3d]">
              Supabase is not configured yet. Add the public URL and publishable key to <code>.env.local</code>, then restart the app.
            </div>
          )}
        </div>

        {query.error ? (
          <p className="mt-4 text-sm text-[#8a4c43]" role="alert">
            Sign-in was not completed. Please try again.
          </p>
        ) : null}

        <p className="mt-7 flex items-start gap-2 border-t border-[#edf0eb] pt-5 text-xs leading-5 text-[#7a8178]">
          <LockKeyhole className="mt-0.5 shrink-0" size={14} />
          Google is used only for identity. Calendar access is a separate, optional integration.
        </p>
      </section>
    </main>
  );
}
