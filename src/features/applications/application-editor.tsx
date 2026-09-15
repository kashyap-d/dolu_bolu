"use client";

import { LoaderCircle, Plus, Save, X } from "lucide-react";
import { useState, type FormEvent } from "react";

import {
  applicationConfirmationPayloadSchema,
  applicationUpdatePayloadSchema,
  type ApplicationEditorPayload,
  type ApplicationRecord,
} from "@/features/applications/contracts";

interface ApplicationEditorProps {
  mode: "create" | "edit";
  application?: ApplicationRecord;
  onCancel: () => void;
  onSave: (
    applicationId: string,
    application: ApplicationEditorPayload,
  ) => Promise<void>;
}

const statusOptions: Array<{
  value: ApplicationRecord["status"];
  label: string;
}> = [
  { value: "saved", label: "Saved" },
  { value: "applied", label: "Applied" },
  { value: "screening", label: "Screening" },
  { value: "interviewing", label: "Interviewing" },
  { value: "offer", label: "Offer" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
  { value: "withdrawn", label: "Withdrawn" },
];

function toLocalDateTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function inputClass(hasError = false) {
  return `mt-1.5 h-11 w-full rounded-xl border bg-white px-3 text-sm text-[#30372f] outline-none transition focus:ring-2 focus:ring-[#cbdacb] ${
    hasError
      ? "border-[#c88474]"
      : "border-[#dce3d9] focus:border-[#78907d]"
  }`;
}

export function ApplicationEditor({
  mode,
  application,
  onCancel,
  onSave,
}: ApplicationEditorProps) {
  const [createId] = useState(() => crypto.randomUUID());
  const [companyName, setCompanyName] = useState(application?.companyName ?? "");
  const [roleTitle, setRoleTitle] = useState(application?.roleTitle ?? "");
  const [status, setStatus] = useState<ApplicationRecord["status"]>(
    application?.status ?? "saved",
  );
  const [appliedAt, setAppliedAt] = useState(
    toLocalDateTime(application?.appliedAt),
  );
  const [sourceUrl, setSourceUrl] = useState(application?.sourceUrl ?? "");
  const [notes, setNotes] = useState(application?.notes ?? "");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [requestError, setRequestError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const date = appliedAt ? new Date(appliedAt) : null;
    const candidate = {
      companyName,
      roleTitle,
      status,
      appliedAt:
        date && !Number.isNaN(date.getTime()) ? date.toISOString() : null,
      sourceUrl: sourceUrl.trim() || null,
      notes: notes.trim() || null,
    };
    const schema =
      mode === "create"
        ? applicationConfirmationPayloadSchema
        : applicationUpdatePayloadSchema;
    const parsed = schema.safeParse(candidate);

    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        errors[key] ??= issue.message;
      }
      setFieldErrors(errors);
      setRequestError("Please correct the highlighted fields.");
      return;
    }

    setFieldErrors({});
    setRequestError(null);
    setPending(true);

    try {
      await onSave(application?.id ?? createId, parsed.data);
    } catch (error) {
      setRequestError(
        error instanceof Error
          ? error.message
          : "The application could not be saved. Please try again.",
      );
    } finally {
      setPending(false);
    }
  }

  const availableStatuses =
    mode === "create"
      ? statusOptions.filter(({ value }) => value === "saved" || value === "applied")
      : statusOptions;

  return (
    <section
      aria-label={mode === "create" ? "Add application manually" : "Edit application"}
      className="animate-enter overflow-hidden rounded-[24px] border border-[#dce3d9] bg-white shadow-[0_18px_50px_rgba(52,72,57,0.08)]"
    >
      <div className="flex items-start justify-between gap-4 border-b border-[#edf0eb] px-5 py-4 sm:px-6">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#748173]">
            Deterministic form
          </p>
          <h2 className="mt-1 font-[family-name:var(--font-manrope)] text-lg font-semibold tracking-[-0.025em] text-[#253028]">
            {mode === "create" ? "Add an application" : "Update application"}
          </h2>
          <p className="mt-1 text-xs leading-5 text-[#7e877c]">
            {mode === "create"
              ? "Enter the details directly—no AI request is made."
              : "Changes are saved only when you submit this form."}
          </p>
        </div>
        <button
          aria-label="Close application form"
          className="grid size-9 shrink-0 place-items-center rounded-xl border border-[#e0e5de] text-[#717a70] transition hover:border-[#c6d0c3] hover:text-[#294435]"
          disabled={pending}
          onClick={onCancel}
          type="button"
        >
          <X size={16} />
        </button>
      </div>

      <form onSubmit={submit}>
        <div className="grid gap-4 px-5 py-5 sm:grid-cols-2 sm:px-6">
          <label className="text-xs font-semibold text-[#616a60]">
            Company
            <input
              aria-invalid={Boolean(fieldErrors.companyName)}
              autoFocus
              className={inputClass(Boolean(fieldErrors.companyName))}
              maxLength={120}
              onChange={(event) => setCompanyName(event.target.value)}
              value={companyName}
            />
            {fieldErrors.companyName ? (
              <span className="mt-1 block text-[11px] text-[#9a574a]">
                {fieldErrors.companyName}
              </span>
            ) : null}
          </label>

          <label className="text-xs font-semibold text-[#616a60]">
            Role
            <input
              aria-invalid={Boolean(fieldErrors.roleTitle)}
              className={inputClass(Boolean(fieldErrors.roleTitle))}
              maxLength={160}
              onChange={(event) => setRoleTitle(event.target.value)}
              value={roleTitle}
            />
            {fieldErrors.roleTitle ? (
              <span className="mt-1 block text-[11px] text-[#9a574a]">
                {fieldErrors.roleTitle}
              </span>
            ) : null}
          </label>

          <label className="text-xs font-semibold text-[#616a60]">
            Status
            <select
              className={inputClass()}
              onChange={(event) => {
                const nextStatus = event.target.value as ApplicationRecord["status"];
                setStatus(nextStatus);
                if (nextStatus === "saved") setAppliedAt("");
              }}
              value={status}
            >
              {availableStatuses.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-semibold text-[#616a60]">
            Applied date and time
            <input
              aria-invalid={Boolean(fieldErrors.appliedAt)}
              className={inputClass(Boolean(fieldErrors.appliedAt))}
              disabled={status === "saved"}
              onChange={(event) => setAppliedAt(event.target.value)}
              type="datetime-local"
              value={appliedAt}
            />
            {fieldErrors.appliedAt ? (
              <span className="mt-1 block text-[11px] text-[#9a574a]">
                {fieldErrors.appliedAt}
              </span>
            ) : null}
          </label>

          <label className="text-xs font-semibold text-[#616a60] sm:col-span-2">
            Source URL <span className="font-normal text-[#949b92]">(optional)</span>
            <input
              aria-invalid={Boolean(fieldErrors.sourceUrl)}
              className={inputClass(Boolean(fieldErrors.sourceUrl))}
              maxLength={2_048}
              onChange={(event) => setSourceUrl(event.target.value)}
              placeholder="https://company.com/jobs/..."
              type="url"
              value={sourceUrl}
            />
            {fieldErrors.sourceUrl ? (
              <span className="mt-1 block text-[11px] text-[#9a574a]">
                {fieldErrors.sourceUrl}
              </span>
            ) : null}
          </label>

          <label className="text-xs font-semibold text-[#616a60] sm:col-span-2">
            Notes <span className="font-normal text-[#949b92]">(optional)</span>
            <textarea
              className="mt-1.5 min-h-24 w-full resize-y rounded-xl border border-[#dce3d9] bg-white px-3 py-2.5 text-sm leading-5 text-[#30372f] outline-none transition focus:border-[#78907d] focus:ring-2 focus:ring-[#cbdacb]"
              maxLength={2_000}
              onChange={(event) => setNotes(event.target.value)}
              value={notes}
            />
          </label>
        </div>

        <div className="border-t border-[#edf0eb] px-5 py-4 sm:px-6">
          {requestError ? (
            <p aria-live="polite" className="mb-3 text-xs leading-5 text-[#9a574a]">
              {requestError}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              className="inline-flex h-10 items-center justify-center rounded-xl border border-[#dfe4dc] bg-white px-4 text-sm font-semibold text-[#657065] transition hover:border-[#c9d1c7] hover:text-[#39463c] disabled:opacity-50"
              disabled={pending}
              onClick={onCancel}
              type="button"
            >
              Cancel
            </button>
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#294435] px-4 text-sm font-semibold text-white transition hover:bg-[#365642] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={pending}
              type="submit"
            >
              {pending ? (
                <LoaderCircle className="animate-spin" size={15} />
              ) : mode === "create" ? (
                <Plus size={15} />
              ) : (
                <Save size={15} />
              )}
              {pending
                ? "Saving…"
                : mode === "create"
                  ? "Add application"
                  : "Save changes"}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
