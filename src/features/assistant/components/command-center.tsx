"use client";

import {
  ArrowLeft,
  ArrowUp,
  BriefcaseBusiness,
  ChevronRight,
  CircleDot,
  LockKeyhole,
  LogOut,
  MessageCircleMore,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";

import {
  assistantResponseSchema,
  type ActionProposal,
  type AssistantResponse,
} from "@/features/assistant/contracts";
import { ApplicationList } from "@/features/applications/application-list";
import { ApplicationProposalCard } from "@/features/applications/application-proposal-card";
import {
  confirmApplicationResponseSchema,
  type ApplicationConfirmationPayload,
  type ApplicationRecord,
  type ConfirmApplicationResponse,
} from "@/features/applications/contracts";

type ApplicationProposal = Extract<
  ActionProposal,
  { kind: "create_application" }
>;
type WorkspaceView = "command" | "applications";

interface CommandCenterProps {
  mode?: "demo" | "persistent";
  initialView?: WorkspaceView;
  initialProposals?: ActionProposal[];
  initialApplications?: ApplicationRecord[];
  viewer?: {
    displayName: string | null;
    email: string | null;
  };
  loadError?: string | null;
}

const suggestions = [
  {
    label: "Record an application",
    message: "I applied to Linear for Frontend Engineer yesterday.",
  },
  {
    label: "Test safe clarification",
    message: "I submitted a job application recently.",
  },
];

function initials(name: string | null, email: string | null) {
  const source = name?.trim() || email?.split("@")[0] || "You";
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

async function responseError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as {
      error?: unknown;
      recovery?: unknown;
    };
    return (
      [body.error, body.recovery]
        .filter((value): value is string => typeof value === "string")
        .join(" ") || fallback
    );
  } catch {
    return fallback;
  }
}

function NavigationItem({
  activeView,
  itemView,
  label,
  icon: Icon,
  persistent,
  onSelect,
}: {
  activeView: WorkspaceView;
  itemView: WorkspaceView;
  label: string;
  icon: typeof Sparkles;
  persistent: boolean;
  onSelect: (view: WorkspaceView) => void;
}) {
  const active = activeView === itemView;
  const className = `flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#294435] ${
    active
      ? "bg-white text-[#294435] shadow-[0_1px_3px_rgba(32,37,31,0.06)]"
      : "text-[#6e776d] hover:bg-white/70 hover:text-[#2c382f]"
  }`;
  const contents = (
    <>
      <Icon size={17} strokeWidth={active ? 2.2 : 1.8} />
      {label}
      {active ? (
        <span className="ml-auto size-1.5 rounded-full bg-[#d8a451]" />
      ) : null}
    </>
  );

  return persistent ? (
    <Link
      aria-current={active ? "page" : undefined}
      className={className}
      href={itemView === "command" ? "/app" : "/app/applications"}
    >
      {contents}
    </Link>
  ) : (
    <button
      aria-current={active ? "page" : undefined}
      className={className}
      onClick={() => onSelect(itemView)}
      type="button"
    >
      {contents}
    </button>
  );
}

export function CommandCenter({
  mode = "demo",
  initialView = "command",
  initialProposals = [],
  initialApplications = [],
  viewer = { displayName: null, email: null },
  loadError = null,
}: CommandCenterProps) {
  const persistent = mode === "persistent";
  const router = useRouter();
  const [demoView, setDemoView] = useState<WorkspaceView>(initialView);
  const view = persistent ? initialView : demoView;
  const [message, setMessage] = useState("");
  const [assistantReply, setAssistantReply] = useState<AssistantResponse | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingProposals, setPendingProposals] = useState<
    ApplicationProposal[]
  >(() =>
    initialProposals.filter(
      (proposal): proposal is ApplicationProposal =>
        proposal.kind === "create_application",
    ),
  );
  const [applications, setApplications] = useState(initialApplications);

  const greetingName = useMemo(
    () => viewer.displayName?.split(/\s+/)[0] || null,
    [viewer.displayName],
  );

  async function requestProposal(value: string) {
    const trimmedMessage = value.trim();
    if (!trimmedMessage || isLoading) return;

    setMessage(trimmedMessage);
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    setAssistantReply(null);

    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const result = await fetch("/api/assistant/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmedMessage,
          timeZone,
          locale: navigator.language || "en-IN",
          clientRequestId: crypto.randomUUID(),
        }),
      });

      if (!result.ok) {
        throw new Error(
          await responseError(
            result,
            "dolu bolu could not interpret that message.",
          ),
        );
      }

      const parsed = assistantResponseSchema.safeParse(await result.json());
      if (!parsed.success) {
        throw new Error("The assistant returned an invalid response. Try again.");
      }

      if (parsed.data.decision.kind === "proposals") {
        const applicationProposals = parsed.data.decision.proposals.filter(
          (proposal): proposal is ApplicationProposal =>
            proposal.kind === "create_application",
        );

        if (applicationProposals.length === 0) {
          throw new Error(
            "Application capture is available now. Interview and task workflows are coming later.",
          );
        }

        setPendingProposals((current) => {
          const newIds = new Set(
            applicationProposals.map((proposal) => proposal.id),
          );
          return [
            ...applicationProposals,
            ...current.filter((proposal) => !newIds.has(proposal.id)),
          ];
        });
        setMessage("");
      } else {
        setAssistantReply(parsed.data);
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void requestProposal(message);
  }

  async function confirmProposal(
    proposal: ApplicationProposal,
    application: ApplicationConfirmationPayload,
  ): Promise<ConfirmApplicationResponse> {
    let result: ConfirmApplicationResponse;

    if (persistent) {
      const response = await fetch(
        `/api/assistant/proposals/${encodeURIComponent(proposal.id)}/confirm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ version: proposal.version, application }),
        },
      );

      if (!response.ok) {
        throw new Error(
          await responseError(
            response,
            "The application could not be added. Please try again.",
          ),
        );
      }

      const parsed = confirmApplicationResponseSchema.safeParse(
        await response.json(),
      );
      if (!parsed.success) {
        throw new Error("The server returned an invalid confirmation.");
      }
      result = parsed.data;
    } else {
      const now = new Date().toISOString();
      result = {
        outcome: "executed",
        proposalId: proposal.id,
        application: {
          id: crypto.randomUUID(),
          ...application,
          createdAt: now,
          updatedAt: now,
        },
      };
    }

    setPendingProposals((current) =>
      current.filter((item) => item.id !== proposal.id),
    );
    setApplications((current) => [
      result.application,
      ...current.filter((item) => item.id !== result.application.id),
    ]);
    setSuccess(
      result.outcome === "already_executed"
        ? "This application had already been added. Your workspace is up to date."
        : "Application added successfully.",
    );
    if (persistent) router.refresh();
    return result;
  }

  async function discardProposal(proposal: ApplicationProposal) {
    if (persistent) {
      const response = await fetch(
        `/api/assistant/proposals/${encodeURIComponent(proposal.id)}/reject`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ version: proposal.version }),
        },
      );
      if (!response.ok) {
        throw new Error(
          await responseError(
            response,
            "The proposal could not be discarded. Please try again.",
          ),
        );
      }
    }

    setPendingProposals((current) =>
      current.filter((item) => item.id !== proposal.id),
    );
    setSuccess("Proposal discarded.");
    if (persistent) router.refresh();
  }

  return (
    <div className="min-h-screen bg-transparent lg:grid lg:grid-cols-[246px_minmax(0,1fr)]">
      <aside className="hidden border-r border-[#e5e8e1] bg-[#f5f7f2]/90 px-4 py-5 backdrop-blur lg:flex lg:min-h-screen lg:flex-col">
        <div className="flex items-center gap-3 px-2 py-1">
          <span className="relative grid size-9 place-items-center rounded-[13px] bg-[#294435] text-white shadow-[0_8px_20px_rgba(41,68,53,0.18)]">
            <Sparkles size={17} />
            <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-[#f5f7f2] bg-[#e0ae5e]" />
          </span>
          <div>
            <p className="font-[family-name:var(--font-manrope)] text-lg font-bold tracking-[-0.04em] text-[#253028]">
              dolu bolu
            </p>
            <p className="-mt-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-[#8a9188]">
              Career assistant
            </p>
          </div>
        </div>

        <nav aria-label="Primary" className="mt-9 space-y-1">
          <NavigationItem
            activeView={view}
            icon={Sparkles}
            itemView="command"
            label="Command center"
            onSelect={setDemoView}
            persistent={persistent}
          />
          <NavigationItem
            activeView={view}
            icon={BriefcaseBusiness}
            itemView="applications"
            label="Applications"
            onSelect={setDemoView}
            persistent={persistent}
          />
        </nav>

        <div className="mt-auto rounded-2xl border border-[#dfe5dc] bg-white/80 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#4f5d51]">
              {persistent ? "Connected workspace" : "Local preview"}
            </span>
            <span className="rounded-full bg-[#eef3eb] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#55705b]">
              v0.2
            </span>
          </div>
          <p className="mt-2 text-xs leading-5 text-[#828981]">
            {persistent
              ? "Confirmed applications are private to your account and survive reloads."
              : "Preview data stays in this tab and resets when you reload."}
          </p>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="flex min-h-16 items-center justify-between border-b border-[#e7eae4] bg-[#fbfcf8]/80 px-5 py-3 backdrop-blur sm:px-8 lg:h-[72px] lg:px-10">
          <div className="flex items-center gap-2.5 lg:hidden">
            <span className="grid size-8 place-items-center rounded-xl bg-[#294435] text-white">
              <Sparkles size={15} />
            </span>
            <span className="font-[family-name:var(--font-manrope)] font-bold tracking-[-0.04em]">
              dolu bolu
            </span>
          </div>
          <div className="hidden items-center gap-2 text-xs font-medium text-[#7d857b] lg:flex">
            <CircleDot size={13} className="text-[#66806c]" />
            Workspace
            <ChevronRight size={13} />
            <span className="text-[#49534a]">
              {view === "command" ? "Command center" : "Applications"}
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex rounded-xl border border-[#dfe5dc] bg-white p-1 lg:hidden">
              {persistent ? (
                <>
                  <Link
                    aria-label="Command center"
                    className={`grid size-8 place-items-center rounded-lg ${view === "command" ? "bg-[#e8efe6] text-[#294435]" : "text-[#7d867b]"}`}
                    href="/app"
                  >
                    <Sparkles size={15} />
                  </Link>
                  <Link
                    aria-label="Applications"
                    className={`grid size-8 place-items-center rounded-lg ${view === "applications" ? "bg-[#e8efe6] text-[#294435]" : "text-[#7d867b]"}`}
                    href="/app/applications"
                  >
                    <BriefcaseBusiness size={15} />
                  </Link>
                </>
              ) : (
                <>
                  <button
                    aria-label="Command center"
                    className={`grid size-8 place-items-center rounded-lg ${view === "command" ? "bg-[#e8efe6] text-[#294435]" : "text-[#7d867b]"}`}
                    onClick={() => setDemoView("command")}
                    type="button"
                  >
                    <Sparkles size={15} />
                  </button>
                  <button
                    aria-label="Applications"
                    className={`grid size-8 place-items-center rounded-lg ${view === "applications" ? "bg-[#e8efe6] text-[#294435]" : "text-[#7d867b]"}`}
                    onClick={() => setDemoView("applications")}
                    type="button"
                  >
                    <BriefcaseBusiness size={15} />
                  </button>
                </>
              )}
            </div>
            <span
              aria-label={viewer.displayName || viewer.email || "Preview user"}
              className="grid size-9 place-items-center rounded-full bg-[#dce7dc] text-xs font-bold text-[#365441]"
              title={viewer.displayName || viewer.email || "Preview user"}
            >
              {initials(viewer.displayName, viewer.email)}
            </span>
            {persistent ? (
              <form action="/auth/signout" method="post">
                <button
                  aria-label="Sign out"
                  className="grid size-9 place-items-center rounded-xl border border-[#e1e5de] bg-white text-[#687168] transition hover:border-[#cbd3c8] hover:text-[#294435]"
                  title="Sign out"
                  type="submit"
                >
                  <LogOut size={15} />
                </button>
              </form>
            ) : null}
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1180px] px-5 py-8 sm:px-8 lg:px-10 lg:py-12">
          {view === "applications" ? (
            <>
              <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#718071]">
                    Your pipeline
                  </p>
                  <h1 className="mt-2 font-[family-name:var(--font-manrope)] text-[clamp(2rem,4vw,3.2rem)] font-semibold leading-[1.08] tracking-[-0.055em] text-[#202820]">
                    Applications
                  </h1>
                  <p className="mt-3 max-w-xl text-sm leading-6 text-[#747c72] sm:text-[15px]">
                    Confirmed records, ordered by their latest update.
                  </p>
                </div>
                {persistent ? (
                  <Link
                    className="inline-flex items-center gap-2 self-start rounded-xl border border-[#dbe2d8] bg-white px-4 py-2.5 text-sm font-semibold text-[#536155] transition hover:border-[#bdcbb9] hover:text-[#294435]"
                    href="/app"
                  >
                    <ArrowLeft size={15} /> Record an application
                  </Link>
                ) : (
                  <button
                    className="inline-flex items-center gap-2 self-start rounded-xl border border-[#dbe2d8] bg-white px-4 py-2.5 text-sm font-semibold text-[#536155]"
                    onClick={() => setDemoView("command")}
                    type="button"
                  >
                    <ArrowLeft size={15} /> Record an application
                  </button>
                )}
              </section>

              {loadError ? (
                <p className="mt-7 rounded-2xl border border-[#ead5cf] bg-[#fff8f6] p-4 text-sm text-[#83564c]">
                  {loadError}
                </p>
              ) : null}
              <div className="mt-8">
                <ApplicationList
                  applications={applications}
                  onReturnToCommandCenter={() => setDemoView("command")}
                  persistent={persistent}
                />
              </div>
            </>
          ) : (
            <>
              <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#718071]">
                    {greetingName
                      ? `Welcome, ${greetingName}`
                      : "Your career workspace"}
                  </p>
                  <h1 className="mt-2 max-w-2xl font-[family-name:var(--font-manrope)] text-[clamp(2rem,4vw,3.2rem)] font-semibold leading-[1.08] tracking-[-0.055em] text-[#202820]">
                    Keep your search moving.
                  </h1>
                  <p className="mt-3 max-w-xl text-sm leading-6 text-[#747c72] sm:text-[15px]">
                    Tell dolu bolu what changed. Review and correct every detail before it enters your workspace.
                  </p>
                </div>
                <div className="flex items-center gap-2 self-start rounded-full border border-[#dde4da] bg-white/80 px-3 py-1.5 text-xs font-medium text-[#58705d] sm:self-auto">
                  <LockKeyhole size={13} /> Private by design
                </div>
              </section>

              {loadError ? (
                <p className="mt-7 rounded-2xl border border-[#ead5cf] bg-[#fff8f6] p-4 text-sm text-[#83564c]">
                  {loadError}
                </p>
              ) : null}

              <div className="mt-9 grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
                <section className="min-w-0">
                  <div className="overflow-hidden rounded-[28px] border border-[#dfe5dc] bg-white shadow-[0_22px_70px_rgba(55,74,58,0.09)]">
                    <div className="border-b border-[#edf0eb] px-5 py-5 sm:px-7 sm:py-6">
                      <div className="flex items-start gap-4">
                        <span className="relative grid size-11 shrink-0 place-items-center rounded-2xl bg-[#294435] text-white shadow-[0_10px_24px_rgba(41,68,53,0.16)]">
                          <MessageCircleMore size={20} />
                          <span className="animate-breathe absolute -right-1 -top-1 size-3 rounded-full border-2 border-white bg-[#e2ad57]" />
                        </span>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="font-[family-name:var(--font-manrope)] text-base font-semibold tracking-[-0.02em] text-[#263027]">
                              What changed?
                            </h2>
                            <span className="rounded-full bg-[#eff3ed] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#667567]">
                              {persistent ? "Review workflow" : "Demo mode"}
                            </span>
                          </div>
                          <p className="mt-1 text-sm leading-5 text-[#81887f]">
                            Start with one application update in natural language.
                          </p>
                        </div>
                      </div>
                    </div>

                    <form
                      className="px-5 pb-5 pt-4 sm:px-7 sm:pb-6"
                      onSubmit={handleSubmit}
                    >
                      <label className="sr-only" htmlFor="assistant-message">
                        Tell dolu bolu about a job application
                      </label>
                      <textarea
                        className="min-h-28 w-full resize-none bg-transparent text-[16px] leading-7 text-[#2a312a] outline-none placeholder:text-[#a0a79e]"
                        id="assistant-message"
                        maxLength={2_000}
                        onChange={(event) => setMessage(event.target.value)}
                        placeholder="Try “I applied to Linear for Frontend Engineer yesterday.”"
                        value={message}
                      />
                      <div className="mt-3 flex flex-col gap-3 border-t border-[#edf0eb] pt-4 sm:flex-row sm:items-center sm:justify-between">
                        <p className="flex items-center gap-1.5 text-[11px] text-[#8a9188]">
                          <Sparkles size={12} /> dolu bolu proposes. You decide.
                        </p>
                        <button
                          className="inline-flex h-11 items-center justify-center gap-2 rounded-[14px] bg-[#294435] px-5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(41,68,53,0.16)] transition hover:bg-[#365642] disabled:cursor-not-allowed disabled:opacity-45"
                          disabled={
                            !message.trim() || isLoading || Boolean(loadError)
                          }
                          type="submit"
                        >
                          {isLoading
                            ? "Interpreting…"
                            : "Prepare application"}
                          <ArrowUp size={16} />
                        </button>
                      </div>
                    </form>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {suggestions.map((suggestion) => (
                      <button
                        className="rounded-full border border-[#dfe4dc] bg-white/75 px-3.5 py-2 text-xs font-medium text-[#5c675d] transition hover:border-[#c7d2c5] hover:bg-white hover:text-[#294435] disabled:opacity-50"
                        disabled={isLoading || Boolean(loadError)}
                        key={suggestion.label}
                        onClick={() => void requestProposal(suggestion.message)}
                        type="button"
                      >
                        {suggestion.label}
                      </button>
                    ))}
                  </div>

                  <div aria-live="polite" className="mt-6 space-y-4">
                    {isLoading ? (
                      <div className="rounded-[22px] border border-[#e1e6df] bg-white/70 p-6">
                        <div className="flex items-center gap-3 text-sm font-medium text-[#5d6b60]">
                          <span className="animate-breathe size-2.5 rounded-full bg-[#5f7a65]" />
                          Turning your message into a reviewable record…
                        </div>
                      </div>
                    ) : null}

                    {success ? (
                      <div className="animate-enter flex items-center justify-between gap-4 rounded-[20px] border border-[#d5e4d3] bg-[#f4faf2] p-4 text-sm text-[#45604a]">
                        <span>{success}</span>
                        {applications.length > 0 ? (
                          persistent ? (
                            <Link
                              className="shrink-0 font-semibold underline"
                              href="/app/applications"
                            >
                              View applications
                            </Link>
                          ) : (
                            <button
                              className="shrink-0 font-semibold underline"
                              onClick={() => setDemoView("applications")}
                              type="button"
                            >
                              View applications
                            </button>
                          )
                        ) : null}
                      </div>
                    ) : null}

                    {error ? (
                      <div className="animate-enter rounded-[22px] border border-[#edd7d2] bg-[#fff9f7] p-5 text-sm leading-6 text-[#7b4e45]">
                        <p className="font-semibold">
                          I could not prepare that safely.
                        </p>
                        <p className="mt-1">{error}</p>
                      </div>
                    ) : null}

                    {assistantReply?.decision.kind ===
                    "needs_clarification" ? (
                      <div className="animate-enter rounded-[22px] border border-[#eadfca] bg-[#fffbf3] p-5 sm:p-6">
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9a7944]">
                          One detail first
                        </p>
                        <p className="mt-2 text-sm leading-6 text-[#5f523e]">
                          {assistantReply.decision.question}
                        </p>
                      </div>
                    ) : null}

                    {assistantReply?.decision.kind === "unsupported" ? (
                      <div className="animate-enter rounded-[22px] border border-[#e4ddd4] bg-[#fcfaf7] p-5 text-sm leading-6 text-[#675b4e] sm:p-6">
                        <p className="font-semibold">
                          That workflow is not connected yet.
                        </p>
                        <p className="mt-1">
                          {assistantReply.decision.message}
                        </p>
                      </div>
                    ) : null}

                    {pendingProposals.map((proposal) => (
                      <ApplicationProposalCard
                        key={proposal.id}
                        onConfirm={confirmProposal}
                        onDiscard={discardProposal}
                        proposal={proposal}
                      />
                    ))}
                  </div>
                </section>

                <aside className="space-y-5">
                  <section className="rounded-[22px] border border-[#e0e5de] bg-white/85 p-5 shadow-[0_10px_36px_rgba(57,72,59,0.05)]">
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#849083]">
                      Workspace snapshot
                    </p>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <div className="rounded-xl bg-[#f5f7f3] px-3 py-4 text-center">
                        <p className="font-[family-name:var(--font-manrope)] text-xl font-semibold text-[#344338]">
                          {applications.length}
                        </p>
                        <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-[#899187]">
                          Applications
                        </p>
                      </div>
                      <div className="rounded-xl bg-[#faf6ec] px-3 py-4 text-center">
                        <p className="font-[family-name:var(--font-manrope)] text-xl font-semibold text-[#62563e]">
                          {pendingProposals.length}
                        </p>
                        <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-[#968a70]">
                          To review
                        </p>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-[22px] bg-[#294435] p-5 text-white shadow-[0_16px_45px_rgba(41,68,53,0.16)]">
                    <div className="flex items-center gap-2 text-[#cbdacc]">
                      <LockKeyhole size={14} />
                      <p className="text-[11px] font-bold uppercase tracking-[0.16em]">
                        Trust contract
                      </p>
                    </div>
                    <p className="mt-3 font-[family-name:var(--font-manrope)] text-[15px] font-semibold leading-6">
                      The model can suggest. Only deterministic code can act.
                    </p>
                    <p className="mt-2 text-xs leading-5 text-[#b8cabd]">
                      Every field is validated again, and a real write requires your explicit confirmation.
                    </p>
                  </section>
                </aside>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
