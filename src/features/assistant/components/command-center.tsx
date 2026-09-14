"use client";

import {
  ArrowUp,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  ListTodo,
  LockKeyhole,
  MessageCircleMore,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

import {
  assistantResponseSchema,
  type ActionProposal,
  type AssistantResponse,
} from "../contracts";

const suggestions = [
  {
    label: "Record an application",
    message: "I applied to Linear for Frontend Engineer yesterday.",
  },
  {
    label: "Create a follow-up task",
    message: "Add a task to tailor my resume for Figma.",
  },
  {
    label: "Test safe clarification",
    message: "I have an interview next week.",
  },
];

const navigation = [
  { label: "Command center", icon: Sparkles, active: true },
  { label: "Applications", icon: BriefcaseBusiness, active: false },
  { label: "Interviews", icon: CalendarDays, active: false },
  { label: "Tasks", icon: ListTodo, active: false },
];

interface ActivityItem {
  id: string;
  kind: ActionProposal["kind"];
  title: string;
  detail: string;
}

function proposalLabel(kind: ActionProposal["kind"]) {
  switch (kind) {
    case "create_application":
      return "Application";
    case "create_interview":
      return "Interview";
    case "create_task":
      return "Task";
  }
}

function ProposalIcon({
  kind,
  size = 16,
}: {
  kind: ActionProposal["kind"];
  size?: number;
}) {
  switch (kind) {
    case "create_application":
      return <BriefcaseBusiness size={size} />;
    case "create_interview":
      return <CalendarDays size={size} />;
    case "create_task":
      return <ListTodo size={size} />;
  }
}

function formatDate(value: string | null, timeZone?: string) {
  if (!value) return "Not set";

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

function proposalRows(proposal: ActionProposal) {
  switch (proposal.kind) {
    case "create_application":
      return [
        ["Company", proposal.payload.companyName ?? "Not set"],
        ["Role", proposal.payload.roleTitle ?? "Not set"],
        ["Status", proposal.payload.status],
        ["Applied", formatDate(proposal.payload.appliedAt)],
      ];
    case "create_interview":
      return [
        ["Company", proposal.payload.companyName ?? "Not set"],
        ["Stage", proposal.payload.stage],
        [
          "When",
          formatDate(proposal.payload.startsAt, proposal.payload.timeZone),
        ],
        ["Mode", proposal.payload.mode],
      ];
    case "create_task":
      return [
        ["Task", proposal.payload.title ?? "Not set"],
        ["Due", formatDate(proposal.payload.dueAt)],
        ["Priority", proposal.payload.priority],
        ["Reminder", proposal.payload.reminderRequested ? "Yes" : "No"],
      ];
  }
}

function activityFromProposal(proposal: ActionProposal): ActivityItem {
  switch (proposal.kind) {
    case "create_application":
      return {
        id: proposal.id,
        kind: proposal.kind,
        title: proposal.payload.companyName ?? "Application",
        detail: proposal.payload.roleTitle ?? "Role not set",
      };
    case "create_interview":
      return {
        id: proposal.id,
        kind: proposal.kind,
        title: proposal.payload.companyName ?? "Interview",
        detail: formatDate(
          proposal.payload.startsAt,
          proposal.payload.timeZone,
        ),
      };
    case "create_task":
      return {
        id: proposal.id,
        kind: proposal.kind,
        title: proposal.payload.title ?? "Task",
        detail: proposal.payload.dueAt
          ? formatDate(proposal.payload.dueAt)
          : "No deadline",
      };
  }
}

function ProposalCard({
  proposal,
  approved,
  onApprove,
}: {
  proposal: ActionProposal;
  approved: boolean;
  onApprove: (proposal: ActionProposal) => void;
}) {
  return (
    <article className="animate-enter overflow-hidden rounded-[22px] border border-[#dce3d9] bg-white shadow-[0_18px_50px_rgba(52,72,57,0.08)]">
      <div className="flex items-start justify-between gap-4 border-b border-[#edf0eb] px-5 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#e9f0e8] text-[#365441]">
            <ProposalIcon kind={proposal.kind} size={19} />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#748173]">
              Proposed {proposalLabel(proposal.kind)}
            </p>
            <h3 className="mt-1 truncate font-[family-name:var(--font-manrope)] text-[15px] font-semibold text-[#20251f]">
              {proposal.summary}
            </h3>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-[#f1f4ef] px-2.5 py-1 text-[11px] font-semibold text-[#627064]">
          Review first
        </span>
      </div>

      <dl className="grid grid-cols-1 gap-px bg-[#edf0eb] sm:grid-cols-2">
        {proposalRows(proposal).map(([label, value]) => (
          <div className="bg-white px-5 py-3.5 sm:px-6" key={label}>
            <dt className="text-[11px] font-medium text-[#899087]">{label}</dt>
            <dd className="mt-1 truncate text-sm font-medium capitalize text-[#30372f]">
              {value}
            </dd>
          </div>
        ))}
      </dl>

      {proposal.assumptions.length > 0 ? (
        <div className="border-t border-[#edf0eb] bg-[#fcf8ef] px-5 py-3.5 sm:px-6">
          <p className="text-xs leading-5 text-[#725e3d]">
            <span className="font-semibold">Assumption: </span>
            {proposal.assumptions.join(" ")}
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 border-t border-[#edf0eb] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="flex items-center gap-1.5 text-xs text-[#7a8178]">
          <LockKeyhole size={13} /> Nothing changes until you approve.
        </p>
        <button
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#294435] px-4 text-sm font-semibold text-white transition hover:bg-[#365642] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#294435] disabled:cursor-default disabled:bg-[#dce7dc] disabled:text-[#416047]"
          disabled={approved}
          onClick={() => onApprove(proposal)}
          type="button"
        >
          {approved ? <Check size={16} /> : null}
          {approved ? "Approved in preview" : "Approve preview"}
        </button>
      </div>
    </article>
  );
}

export function CommandCenter() {
  const [message, setMessage] = useState("");
  const [response, setResponse] = useState<AssistantResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [approvedIds, setApprovedIds] = useState<Set<string>>(() => new Set());
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  const counts = useMemo(
    () => ({
      applications: activity.filter((item) => item.kind === "create_application")
        .length,
      interviews: activity.filter((item) => item.kind === "create_interview").length,
      tasks: activity.filter((item) => item.kind === "create_task").length,
    }),
    [activity],
  );

  async function requestProposal(value: string) {
    const trimmedMessage = value.trim();
    if (!trimmedMessage || isLoading) return;

    setMessage(trimmedMessage);
    setIsLoading(true);
    setError(null);
    setResponse(null);

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
      const body: unknown = await result.json();

      if (!result.ok) {
        const apiError = body as { error?: string; recovery?: string };
        throw new Error(
          [apiError.error, apiError.recovery].filter(Boolean).join(" ") ||
            "dolu bolu could not interpret that message.",
        );
      }

      const parsed = assistantResponseSchema.safeParse(body);
      if (!parsed.success) {
        throw new Error("The assistant returned an invalid response. Try again.");
      }

      setResponse(parsed.data);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Something went wrong. Try the manual path instead.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void requestProposal(message);
  }

  function approveProposal(proposal: ActionProposal) {
    if (approvedIds.has(proposal.id)) return;

    setApprovedIds((current) => new Set(current).add(proposal.id));
    setActivity((current) => [activityFromProposal(proposal), ...current]);
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
          {navigation.map(({ label, icon: Icon, active }) => (
            <button
              aria-current={active ? "page" : undefined}
              className={`flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#294435] ${
                active
                  ? "bg-white text-[#294435] shadow-[0_1px_3px_rgba(32,37,31,0.06)]"
                  : "text-[#6e776d] hover:bg-white/70 hover:text-[#2c382f]"
              }`}
              key={label}
              type="button"
            >
              <Icon size={17} strokeWidth={active ? 2.2 : 1.8} />
              {label}
              {active ? (
                <span className="ml-auto size-1.5 rounded-full bg-[#d8a451]" />
              ) : null}
            </button>
          ))}
        </nav>

        <div className="mt-auto rounded-2xl border border-[#dfe5dc] bg-white/80 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#4f5d51]">Foundation</span>
            <span className="rounded-full bg-[#eef3eb] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#55705b]">
              v0.1
            </span>
          </div>
          <p className="mt-2 text-xs leading-5 text-[#828981]">
            Demo proposals are temporary until Supabase confirmation is connected.
          </p>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="flex h-16 items-center justify-between border-b border-[#e7eae4] bg-[#fbfcf8]/80 px-5 backdrop-blur sm:px-8 lg:h-[72px] lg:px-10">
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
            Command center
            <ChevronRight size={13} />
            <span className="text-[#49534a]">Inbox</span>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              aria-label="Search"
              className="grid size-9 place-items-center rounded-xl border border-[#e1e5de] bg-white text-[#687168] transition hover:border-[#cbd3c8] hover:text-[#294435] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#294435]"
              type="button"
            >
              <Search size={16} />
            </button>
            <button
              className="flex h-9 items-center gap-2 rounded-xl border border-[#e1e5de] bg-white px-3 text-xs font-semibold text-[#4d584e] transition hover:border-[#cbd3c8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#294435]"
              type="button"
            >
              <Plus size={14} />
              <span className="hidden sm:inline">Add manually</span>
            </button>
            <span className="grid size-9 place-items-center rounded-full bg-[#dce7dc] text-xs font-bold text-[#365441]">
              DK
            </span>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1180px] px-5 py-8 sm:px-8 lg:px-10 lg:py-12">
          <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#718071]">
                Good afternoon
              </p>
              <h1 className="mt-2 max-w-2xl font-[family-name:var(--font-manrope)] text-[clamp(2rem,4vw,3.2rem)] font-semibold leading-[1.08] tracking-[-0.055em] text-[#202820]">
                Keep your search moving.
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[#747c72] sm:text-[15px]">
                Tell dolu bolu what changed. You will review every action before it becomes part of your workspace.
              </p>
            </div>
            <div className="flex items-center gap-2 self-start rounded-full border border-[#dde4da] bg-white/80 px-3 py-1.5 text-xs font-medium text-[#58705d] sm:self-auto">
              <LockKeyhole size={13} />
              Private by design
            </div>
          </section>

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
                          Demo provider
                        </span>
                      </div>
                      <p className="mt-1 text-sm leading-5 text-[#81887f]">
                        One message can become a clean application, interview, or task proposal.
                      </p>
                    </div>
                  </div>
                </div>

                <form className="px-5 pb-5 pt-4 sm:px-7 sm:pb-6" onSubmit={handleSubmit}>
                  <label className="sr-only" htmlFor="assistant-message">
                    Tell dolu bolu about a job-search update
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
                      <Sparkles size={12} />
                      dolu bolu proposes. You decide.
                    </p>
                    <button
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-[14px] bg-[#294435] px-5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(41,68,53,0.16)] transition hover:bg-[#365642] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#294435] disabled:cursor-not-allowed disabled:opacity-45"
                      disabled={!message.trim() || isLoading}
                      type="submit"
                    >
                      {isLoading ? "Thinking…" : "Prepare actions"}
                      <ArrowUp size={16} />
                    </button>
                  </div>
                </form>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {suggestions.map((suggestion) => (
                  <button
                    className="rounded-full border border-[#dfe4dc] bg-white/75 px-3.5 py-2 text-xs font-medium text-[#5c675d] transition hover:border-[#c7d2c5] hover:bg-white hover:text-[#294435] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#294435]"
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
                      Turning your message into a reviewable plan…
                    </div>
                  </div>
                ) : null}

                {error ? (
                  <div className="animate-enter rounded-[22px] border border-[#edd7d2] bg-[#fff9f7] p-5 text-sm leading-6 text-[#7b4e45]">
                    <p className="font-semibold">I could not prepare that safely.</p>
                    <p className="mt-1">{error}</p>
                  </div>
                ) : null}

                {response?.decision.kind === "needs_clarification" ? (
                  <div className="animate-enter rounded-[22px] border border-[#eadfca] bg-[#fffbf3] p-5 sm:p-6">
                    <div className="flex gap-3">
                      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-[#f4e7ce] text-[#8b6830]">
                        <MessageCircleMore size={15} />
                      </span>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9a7944]">
                          One detail first
                        </p>
                        <p className="mt-2 text-sm leading-6 text-[#5f523e]">
                          {response.decision.question}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}

                {response?.decision.kind === "unsupported" ? (
                  <div className="animate-enter rounded-[22px] border border-[#e4ddd4] bg-[#fcfaf7] p-5 text-sm leading-6 text-[#675b4e] sm:p-6">
                    <p className="font-semibold">That action stays with you.</p>
                    <p className="mt-1">{response.decision.message}</p>
                  </div>
                ) : null}

                {response?.decision.kind === "proposals"
                  ? response.decision.proposals.map((proposal) => (
                      <ProposalCard
                        approved={approvedIds.has(proposal.id)}
                        key={proposal.id}
                        onApprove={approveProposal}
                        proposal={proposal}
                      />
                    ))
                  : null}
              </div>
            </section>

            <aside className="space-y-5">
              <section className="rounded-[22px] border border-[#e0e5de] bg-white/85 p-5 shadow-[0_10px_36px_rgba(57,72,59,0.05)]">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#849083]">
                      This preview
                    </p>
                    <h2 className="mt-1 font-[family-name:var(--font-manrope)] text-base font-semibold text-[#283129]">
                      Approved actions
                    </h2>
                  </div>
                  <span className="grid size-8 place-items-center rounded-xl bg-[#eef3eb] text-[#53705a]">
                    <CheckCircle2 size={16} />
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-2">
                  {[
                    ["Apps", counts.applications],
                    ["Calls", counts.interviews],
                    ["Tasks", counts.tasks],
                  ].map(([label, count]) => (
                    <div className="rounded-xl bg-[#f5f7f3] px-2 py-3 text-center" key={label}>
                      <p className="font-[family-name:var(--font-manrope)] text-lg font-semibold text-[#344338]">
                        {count}
                      </p>
                      <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-[#899187]">
                        {label}
                      </p>
                    </div>
                  ))}
                </div>

                {activity.length === 0 ? (
                  <div className="mt-5 rounded-2xl border border-dashed border-[#dce2d9] px-4 py-5 text-center">
                    <Clock3 className="mx-auto text-[#96a095]" size={18} />
                    <p className="mt-2 text-xs leading-5 text-[#858d84]">
                      Approved preview actions will appear here. They reset on reload for now.
                    </p>
                  </div>
                ) : (
                  <div className="mt-4 space-y-2">
                    {activity.slice(0, 4).map((item) => {
                      return (
                        <div className="flex items-center gap-3 rounded-xl border border-[#edf0eb] p-3" key={item.id}>
                          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#edf3eb] text-[#54705a]">
                            <ProposalIcon kind={item.kind} size={14} />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-[#3c463d]">
                              {item.title}
                            </p>
                            <p className="mt-0.5 truncate text-[11px] text-[#8a9188]">
                              {item.detail}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
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
                  Every provider is held to one typed contract, and every real write will require your approval.
                </p>
              </section>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}
