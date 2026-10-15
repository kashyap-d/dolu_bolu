"use client";

import { Download, LoaderCircle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, buttonClasses } from "@/components/ui/button";
import { Card, Eyebrow, PageHeader } from "@/components/ui/card";
import { Field, TextInput } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { api } from "@/features/workspace/api-client";

import { DELETE_ACCOUNT_PHRASE } from "../contracts";

export function AccountSettings({ email }: { email: string | null }) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmed = confirmation.trim().toLowerCase() === DELETE_ACCOUNT_PHRASE;

  async function deleteAccount() {
    if (!confirmed || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await api.deleteAccount();
      // The session cookies are already cleared; drop any cached workspace pages too.
      router.replace("/login?deleted=1");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your account could not be deleted.");
      setDeleting(false);
    }
  }

  return (
    <>
      <PageHeader
        description={email ? `Signed in as ${email}.` : undefined}
        eyebrow="Account"
        title="Your data"
      />

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <Card className="p-6">
          <Eyebrow>Export</Eyebrow>
          <h2 className="mt-2 font-display text-lg font-semibold text-ink">Download everything</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            One JSON file with your profile, every Job Drive with its OA and interview details, the
            messages you sent the assistant, its proposals, and your full activity history.
          </p>
          <a
            className={buttonClasses({ variant: "secondary", className: "mt-5" })}
            download
            href="/api/account/export"
          >
            <Download size={15} /> Download my data
          </a>
        </Card>

        <Card className="border-danger-line p-6">
          <Eyebrow className="text-danger-ink">Delete</Eyebrow>
          <h2 className="mt-2 font-display text-lg font-semibold text-ink">Delete your account</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            This permanently deletes your account and everything in it. It cannot be undone, so
            download your data first if you might want it.
          </p>
          <form
            className="mt-5"
            onSubmit={(event) => {
              event.preventDefault();
              void deleteAccount();
            }}
          >
            <Field label={`Type “${DELETE_ACCOUNT_PHRASE}” to confirm`}>
              <TextInput
                autoComplete="off"
                disabled={deleting}
                onChange={(event) => setConfirmation(event.target.value)}
                value={confirmation}
              />
            </Field>
            <div aria-live="polite">
              {error ? <Notice className="mt-4" role="alert" tone="danger">{error}</Notice> : null}
            </div>
            <Button
              className="mt-4 bg-danger hover:bg-danger-ink"
              disabled={!confirmed || deleting}
              type="submit"
            >
              {deleting ? <LoaderCircle className="animate-spin" size={15} /> : <Trash2 size={15} />}
              Permanently delete my account
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}
