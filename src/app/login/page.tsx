import { LockKeyhole, Sparkles } from "lucide-react";

import { buttonClasses } from "@/components/ui/button";
import { Card, Eyebrow } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { safeNextPath } from "@/lib/safe-next-path";
import { isSupabaseConfigured } from "@/server/env";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const query = await searchParams;
  const next = typeof query.next === "string" ? query.next : null;
  const configured = isSupabaseConfigured();

  return (
    <main className="grid min-h-screen place-items-center px-5 py-12">
      <Card className="w-full max-w-md p-7 sm:p-9" raised>
        <span className="grid size-11 place-items-center rounded-2xl bg-brand text-white">
          <Sparkles size={20} />
        </span>
        <Eyebrow className="mt-6">dolu bolu</Eyebrow>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.05em] text-ink">
          Your search, kept together.
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Sign in to keep your Job Drives private and saved. Nothing is written without your confirmation.
        </p>

        <div className="mt-7">
          {configured ? (
            <form action="/auth/google" method="post">
              <input name="next" type="hidden" value={safeNextPath(next)} />
              <button className={buttonClasses({ className: "h-11 w-full px-5" })} type="submit">
                Continue with Google
              </button>
            </form>
          ) : (
            <Notice tone="attention">
              Supabase is not configured yet. Add the project URL and publishable key to{" "}
              <code>.env.local</code>, then restart the app.
            </Notice>
          )}
        </div>

        {query.error ? (
          <p className="mt-4 text-sm text-danger-ink" role="alert">
            Sign-in was not completed. Please try again.
          </p>
        ) : null}

        <p className="mt-7 flex items-start gap-2 border-t border-line pt-5 text-xs leading-5 text-subtle">
          <LockKeyhole aria-hidden="true" className="mt-0.5 shrink-0" size={14} />
          Google is used only for identity. Calendar access, if it ever ships, will be a separate, optional permission.
        </p>
      </Card>
    </main>
  );
}
