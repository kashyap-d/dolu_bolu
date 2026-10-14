"use client";

import { ArrowUp, CalendarClock, LockKeyhole, MessageCircleMore, Plus, Sparkles } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, Eyebrow, PageHeader } from "@/components/ui/card";
import { LocalDateTime } from "@/components/ui/local-date-time";
import { Notice } from "@/components/ui/notice";
import type { ActionProposal, AssistantResponse } from "@/features/assistant/contracts";
import { JobDriveEditor } from "@/features/job-drives/components/job-drive-editor";
import type { JobDrive } from "@/features/job-drives/contracts";
import { emptyJobDrivePayload, payloadFromProposal } from "@/features/job-drives/payload";
import { importantDateForDrive } from "@/features/job-drives/stage-rules";
import { useGateway } from "@/features/workspace/gateway";
import { WorkspaceLink } from "@/features/workspace/navigation";

type Reply = Exclude<AssistantResponse["decision"], { kind: "proposal" }>;

const suggestions = [
  { label: "Record an application", message: "I applied to Linear for Frontend Engineer yesterday." },
  { label: "Record an OA", message: "OA at Linear for Frontend Engineer tomorrow." },
  { label: "Try something vague", message: "I reached the next round." },
];

function upcomingDates(drives: JobDrive[], now: number, limit = 4) {
  return drives
    .map((drive) => ({ drive, important: importantDateForDrive(drive) }))
    .filter(
      (item): item is { drive: JobDrive; important: { label: string; value: string } } =>
        item.important !== undefined &&
        item.important !== null &&
        new Date(item.important.value).getTime() >= now,
    )
    .sort((left, right) => left.important.value.localeCompare(right.important.value))
    .slice(0, limit);
}

export function CommandCenterView({
  greetingName,
  drives,
  proposals: storedProposals,
}: {
  greetingName: string | null;
  drives: JobDrive[];
  proposals: ActionProposal[];
}) {
  const gateway = useGateway();
  const [message, setMessage] = useState("");
  const [isInterpreting, setIsInterpreting] = useState(false);
  const [reply, setReply] = useState<Reply | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [createId, setCreateId] = useState<string | null>(null);
  // New proposals show immediately; resolved ones hide immediately. Both
  // reconcile with the stored list when the route re-renders.
  const [newProposals, setNewProposals] = useState<ActionProposal[]>([]);
  const [resolvedIds, setResolvedIds] = useState<ReadonlySet<string>>(new Set());
  const [now] = useState(() => Date.now());

  const proposals = [
    ...newProposals.filter((proposal) => !storedProposals.some((stored) => stored.id === proposal.id)),
    ...storedProposals,
  ].filter((proposal) => !resolvedIds.has(proposal.id));
  const upcoming = upcomingDates(drives, now);

  function clearNotices() {
    setError(null);
    setSuccess(null);
    setReply(null);
  }

  function resolve(proposal: ActionProposal) {
    setResolvedIds((current) => new Set(current).add(proposal.id));
  }

  async function requestProposal(value: string) {
    const trimmed = value.trim();
    if (!trimmed || isInterpreting) return;
    setMessage(trimmed);
    setIsInterpreting(true);
    clearNotices();
    try {
      const result = await gateway.requestProposal(trimmed);
      if (result.decision.kind === "proposal") {
        const proposal = result.decision.proposal;
        setNewProposals((current) => [proposal, ...current.filter((item) => item.id !== proposal.id)]);
        setMessage("");
      } else {
        setReply(result.decision);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
    } finally {
      setIsInterpreting(false);
    }
  }

  return (
    <>
      <PageHeader
        action={
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/80 px-3 py-1.5 text-xs font-medium text-brand-text">
            <LockKeyhole aria-hidden="true" size={13} /> You approve every change
          </span>
        }
        description="Tell dolu bolu what changed — an application, OA, interview, offer, or outcome. You review every field before it is saved."
        eyebrow={greetingName ? `Welcome, ${greetingName}` : "Your career workspace"}
        title="Keep every hiring process moving."
      />

      <div className="mt-9 grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section aria-label="Assistant" className="min-w-0">
          <Card className="overflow-hidden" raised>
            <div className="flex items-start gap-4 border-b border-line px-5 py-5 sm:px-7">
              <span className="relative grid size-11 shrink-0 place-items-center rounded-2xl bg-brand text-white">
                <MessageCircleMore size={20} />
                <span className="absolute -right-1 -top-1 size-3 animate-breathe rounded-full border-2 border-surface bg-accent" />
              </span>
              <div>
                <h2 className="font-display text-base font-semibold text-ink">What changed?</h2>
                <p className="mt-1 text-sm text-muted">Describe one Job Drive update in your own words.</p>
              </div>
            </div>
            <form
              className="px-5 pb-5 pt-4 sm:px-7"
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                void requestProposal(message);
              }}
            >
              <label className="sr-only" htmlFor="assistant-message">
                Describe a Job Drive update
              </label>
              <textarea
                className="min-h-28 w-full resize-none bg-transparent text-base leading-7 text-ink outline-none placeholder:text-subtle"
                id="assistant-message"
                maxLength={2000}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    void requestProposal(message);
                  }
                }}
                placeholder="Try “OA at Linear for Frontend Engineer tomorrow.”"
                value={message}
              />
              <div className="mt-3 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex items-center gap-1.5 text-[11px] text-subtle">
                  <Sparkles aria-hidden="true" size={12} /> dolu bolu proposes. You decide.
                </p>
                <Button className="h-11 px-5" disabled={!message.trim() || isInterpreting} type="submit">
                  {isInterpreting ? "Interpreting…" : "Prepare update"} <ArrowUp size={16} />
                </Button>
              </div>
            </form>
          </Card>

          <div className="mt-4 flex flex-wrap gap-2">
            {suggestions.map((suggestion) => (
              <button
                className="rounded-full border border-line bg-surface/75 px-3.5 py-2 text-xs font-medium text-muted transition hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
                disabled={isInterpreting}
                key={suggestion.label}
                onClick={() => void requestProposal(suggestion.message)}
                type="button"
              >
                {suggestion.label}
              </button>
            ))}
            <button
              className="inline-flex items-center gap-1.5 rounded-full border border-success-line bg-success-soft px-3.5 py-2 text-xs font-semibold text-success-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              onClick={() => {
                clearNotices();
                setCreateId(crypto.randomUUID());
              }}
              type="button"
            >
              <Plus aria-hidden="true" size={13} /> Add manually
            </button>
          </div>

          {createId ? (
            <div className="mt-6">
              <JobDriveEditor
                initial={emptyJobDrivePayload}
                key={createId}
                mode="create"
                onCancel={() => setCreateId(null)}
                onSave={async (drive, { allowPossibleDuplicate }) => {
                  const result = await gateway.createDrive({ jobDriveId: createId, drive, allowPossibleDuplicate });
                  if (result.outcome !== "possible_duplicate") {
                    setCreateId(null);
                    setSuccess(`${result.jobDrive.companyName} added.`);
                  }
                  return result;
                }}
              />
            </div>
          ) : null}

          <div aria-live="polite" className="mt-6 space-y-4">
            {isInterpreting ? (
              <Notice role="status">Turning your message into a reviewable update…</Notice>
            ) : null}
            {success ? (
              <Notice role="status" tone="success">
                {success}{" "}
                <WorkspaceLink className="font-semibold underline" to={{ view: "drives" }}>
                  View Drives
                </WorkspaceLink>
              </Notice>
            ) : null}
            {error ? (
              <Notice role="alert" title="I could not prepare that safely." tone="danger">
                {error}
              </Notice>
            ) : null}
            {reply?.kind === "needs_clarification" ? (
              <Notice title="One detail first" tone="attention">
                {reply.question}
              </Notice>
            ) : null}
            {reply?.kind === "unsupported" ? <Notice>{reply.message}</Notice> : null}
          </div>

          <div className="mt-4 space-y-4">
            {proposals.map((proposal) => (
              <JobDriveEditor
                assumptions={proposal.assumptions}
                description="Check the stage and any dates. Nothing is saved until you confirm."
                evidence={proposal.evidence}
                existingStage={drives.find((drive) => drive.id === proposal.payload.jobDriveId)?.stage}
                initial={payloadFromProposal(proposal)}
                key={`${proposal.id}:${proposal.version}`}
                mode="review"
                onDiscard={async () => {
                  await gateway.discardProposal(proposal);
                  resolve(proposal);
                  setSuccess("Proposal discarded. Nothing was changed.");
                }}
                onSave={async (drive, { allowPossibleDuplicate }) => {
                  const result = await gateway.confirmProposal(proposal, drive, { allowPossibleDuplicate });
                  if (result.outcome !== "possible_duplicate") {
                    resolve(proposal);
                    setSuccess(
                      result.outcome === "already_executed"
                        ? "That update was already confirmed."
                        : `${result.jobDrive.companyName} saved from your confirmed proposal.`,
                    );
                  }
                  return result;
                }}
                title={proposal.summary}
              />
            ))}
          </div>
        </section>

        <aside className="space-y-5">
          <Card className="p-5">
            <Eyebrow>Coming up</Eyebrow>
            {upcoming.length ? (
              <ul className="mt-4 space-y-3">
                {upcoming.map(({ drive, important }) => (
                  <li key={drive.id}>
                    <WorkspaceLink
                      className="flex w-full items-start gap-3 rounded-xl p-2 text-left transition hover:bg-surface-muted"
                      to={{ view: "drive", driveId: drive.id }}
                    >
                      <CalendarClock aria-hidden="true" className="mt-0.5 shrink-0 text-brand-text" size={15} />
                      <span className="min-w-0 text-xs leading-5">
                        <span className="block truncate font-semibold text-ink-soft">
                          {important.label} · {drive.companyName}
                        </span>
                        <span className="text-muted">
                          <LocalDateTime value={important.value} />
                        </span>
                      </span>
                    </WorkspaceLink>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs leading-5 text-muted">
                Nothing dated yet. OA deadlines, interviews, and apply-by dates will show here.
              </p>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-4">
              <div className="rounded-xl bg-surface-muted px-3 py-3 text-center">
                <p className="text-xl font-semibold text-ink-soft">{drives.length}</p>
                <p className="text-[10px] uppercase text-subtle">Drives</p>
              </div>
              <div className="rounded-xl bg-accent-soft px-3 py-3 text-center">
                <p className="text-xl font-semibold text-accent-ink">{proposals.length}</p>
                <p className="text-[10px] uppercase text-accent-ink/80">To review</p>
              </div>
            </div>
          </Card>
          <section className="rounded-3xl bg-brand p-5 text-white">
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-white/70">
              <LockKeyhole aria-hidden="true" size={14} /> How this stays safe
            </p>
            <p className="mt-3 text-[15px] font-semibold leading-6">
              The model proposes. Deterministic code checks it. Only your confirmation writes.
            </p>
            <p className="mt-2 text-xs leading-5 text-white/70">
              Every saved change is atomic, safe to retry, and recorded in the drive&apos;s history.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
