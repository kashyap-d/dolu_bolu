"use client";

import { BriefcaseBusiness, ExternalLink, LoaderCircle, LockKeyhole, Trash2 } from "lucide-react";
import { useState } from "react";

import type { ActionProposal } from "@/features/assistant/contracts";
import {
  applicationConfirmationPayloadSchema,
  type ApplicationConfirmationPayload,
  type ConfirmApplicationResponse,
} from "@/features/applications/contracts";

type ApplicationProposal = Extract<
  ActionProposal,
  { kind: "create_application" }
>;

interface ApplicationProposalCardProps {
  proposal: ApplicationProposal;
  onConfirm: (
    proposal: ApplicationProposal,
    application: ApplicationConfirmationPayload,
  ) => Promise<ConfirmApplicationResponse>;
  onDiscard: (proposal: ApplicationProposal) => Promise<void>;
}

function toLocalDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function inputClass(hasError = false) {
  return `mt-1.5 h-11 w-full rounded-xl border bg-white px-3 text-sm text-[#30372f] outline-none transition focus:ring-2 focus:ring-[#cbdacb] ${
    hasError ? "border-[#c88474]" : "border-[#dce3d9] focus:border-[#78907d]"
  }`;
}

export function ApplicationProposalCard({
  proposal,
  onConfirm,
  onDiscard,
}: ApplicationProposalCardProps) {
  const [companyName, setCompanyName] = useState(
    proposal.payload.companyName ?? "",
  );
  const [roleTitle, setRoleTitle] = useState(proposal.payload.roleTitle ?? "");
  const [status, setStatus] = useState<"saved" | "applied">(
    proposal.payload.status,
  );
  const [appliedAt, setAppliedAt] = useState(
    toLocalDateTime(proposal.payload.appliedAt),
  );
  const [sourceUrl, setSourceUrl] = useState(proposal.payload.sourceUrl ?? "");
  const [notes, setNotes] = useState(proposal.payload.notes ?? "");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [requestError, setRequestError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"confirm" | "discard" | null>(
    null,
  );

  async function confirm() {
    if (pendingAction) return;

    const candidate = {
      companyName,
      roleTitle,
      status,
      appliedAt:
        status === "applied" && appliedAt
          ? new Date(appliedAt).toISOString()
          : null,
      sourceUrl: sourceUrl.trim() || null,
      notes: notes.trim() || null,
    };
    const parsed = applicationConfirmationPayloadSchema.safeParse(candidate);

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
    setPendingAction("confirm");
    try {
      await onConfirm(proposal, parsed.data);
    } catch (error) {
      setRequestError(
        error instanceof Error
          ? error.message
          : "The application could not be added. Please try again.",
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function discard() {
    if (pendingAction) return;
    setRequestError(null);
    setPendingAction("discard");
    try {
      await onDiscard(proposal);
    } catch (error) {
      setRequestError(
        error instanceof Error
          ? error.message
          : "The proposal could not be discarded. Please try again.",
      );
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <article className="animate-enter overflow-hidden rounded-[22px] border border-[#dce3d9] bg-white shadow-[0_18px_50px_rgba(52,72,57,0.08)]">
      <div className="flex items-start justify-between gap-4 border-b border-[#edf0eb] px-5 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#e9f0e8] text-[#365441]">
            <BriefcaseBusiness size={19} />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#748173]">
              Proposed application
            </p>
            <h3 className="mt-1 font-[family-name:var(--font-manrope)] text-[15px] font-semibold text-[#20251f]">
              {proposal.summary}
            </h3>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-[#fcf4e6] px-2.5 py-1 text-[11px] font-semibold text-[#81643a]">
          Pending review
        </span>
      </div>

      <div className="grid gap-4 px-5 py-5 sm:grid-cols-2 sm:px-6">
        <label className="text-xs font-semibold text-[#616a60]">
          Company
          <input
            aria-invalid={Boolean(fieldErrors.companyName)}
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
              const nextStatus = event.target.value as "saved" | "applied";
              setStatus(nextStatus);
              if (nextStatus === "saved") setAppliedAt("");
            }}
            value={status}
          >
            <option value="saved">Saved</option>
            <option value="applied">Applied</option>
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
            className="mt-1.5 min-h-20 w-full resize-y rounded-xl border border-[#dce3d9] bg-white px-3 py-2.5 text-sm leading-5 text-[#30372f] outline-none transition focus:border-[#78907d] focus:ring-2 focus:ring-[#cbdacb]"
            maxLength={2_000}
            onChange={(event) => setNotes(event.target.value)}
            value={notes}
          />
        </label>
      </div>

      {proposal.evidence.length > 0 ? (
        <div className="border-t border-[#edf0eb] bg-[#f8faf6] px-5 py-3.5 sm:px-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7b887b]">
            From your message
          </p>
          <div className="mt-2 space-y-1">
            {proposal.evidence.map((item) => (
              <p className="flex gap-2 text-xs leading-5 text-[#626c62]" key={`${item.fieldPath}-${item.quote}`}>
                <span aria-hidden="true">“</span>
                <span>{item.quote}</span>
              </p>
            ))}
          </div>
        </div>
      ) : null}

      {proposal.assumptions.length > 0 ? (
        <div className="border-t border-[#edf0eb] bg-[#fcf8ef] px-5 py-3.5 sm:px-6">
          <p className="text-xs leading-5 text-[#725e3d]">
            <span className="font-semibold">Please verify: </span>
            {proposal.assumptions.join(" ")}
          </p>
        </div>
      ) : null}

      <div className="border-t border-[#edf0eb] px-5 py-4 sm:px-6">
        {requestError ? (
          <p aria-live="polite" className="mb-3 text-xs leading-5 text-[#9a574a]">
            {requestError}
          </p>
        ) : null}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-1.5 text-xs text-[#7a8178]">
            <LockKeyhole size={13} /> Nothing is saved until you confirm.
          </p>
          <div className="flex gap-2">
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#dfe4dc] bg-white px-4 text-sm font-semibold text-[#657065] transition hover:border-[#c9d1c7] hover:text-[#39463c] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={Boolean(pendingAction)}
              onClick={() => void discard()}
              type="button"
            >
              {pendingAction === "discard" ? (
                <LoaderCircle className="animate-spin" size={15} />
              ) : (
                <Trash2 size={15} />
              )}
              Discard
            </button>
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#294435] px-4 text-sm font-semibold text-white transition hover:bg-[#365642] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={Boolean(pendingAction)}
              onClick={() => void confirm()}
              type="button"
            >
              {pendingAction === "confirm" ? (
                <LoaderCircle className="animate-spin" size={15} />
              ) : (
                <ExternalLink size={15} />
              )}
              Add application
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
