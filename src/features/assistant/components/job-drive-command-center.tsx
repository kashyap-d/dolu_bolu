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
  Plus,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";

import {
  assistantResponseSchema,
  type ActionProposal,
  type AssistantResponse,
} from "@/features/assistant/job-drive-contracts";
import {
  confirmJobDriveResponseSchema,
  saveJobDriveResponseSchema,
  type ActivityEvent,
  type ConfirmJobDriveResponse,
  type JobDrive,
  type JobDriveProgressPayload,
  type JobDriveStage,
  type SaveJobDriveResponse,
} from "@/features/job-drives/contracts";
import { JobDriveDetail } from "@/features/job-drives/job-drive-detail";
import { JobDriveEditor } from "@/features/job-drives/job-drive-editor";
import { JobDriveList } from "@/features/job-drives/job-drive-list";

type WorkspaceView = "command" | "drives" | "detail";
type EditorState =
  | { mode: "create"; id: string; initial: JobDriveProgressPayload }
  | { mode: "edit"; driveId: string; existingStage: JobDriveStage; initial: JobDriveProgressPayload };

interface JobDriveCommandCenterProps {
  mode?: "demo" | "persistent";
  initialView?: WorkspaceView;
  initialProposals?: ActionProposal[];
  initialJobDrives?: JobDrive[];
  selectedJobDriveId?: string;
  initialActivity?: ActivityEvent[];
  viewer?: { displayName: string | null; email: string | null };
  loadError?: string | null;
}

const emptyDrive: JobDriveProgressPayload = {
  companyName: "",
  roleTitle: "",
  stage: "planned",
  stageOccurredAt: null,
  appliedAt: null,
  applyBy: null,
  location: null,
  sourceUrl: null,
  notes: null,
  assessment: null,
  interview: null,
};

const suggestions = [
  { label: "Record an application", message: "I applied to Linear for Frontend Engineer yesterday." },
  { label: "Record an OA", message: "OA at Linear for Frontend Engineer tomorrow." },
  { label: "Test clarification", message: "I reached the next round." },
];

function drivePayload(drive: JobDrive): JobDriveProgressPayload {
  return {
    companyName: drive.companyName,
    roleTitle: drive.roleTitle,
    stage: drive.stage,
    stageOccurredAt: drive.stageOccurredAt,
    appliedAt: drive.appliedAt,
    applyBy: drive.applyBy,
    location: drive.location,
    sourceUrl: drive.sourceUrl,
    notes: drive.notes,
    assessment: drive.assessment ? {
      status: drive.assessment.status,
      availableFrom: drive.assessment.availableFrom,
      dueAt: drive.assessment.dueAt,
      durationMinutes: drive.assessment.durationMinutes,
      assessmentUrl: drive.assessment.assessmentUrl,
      notes: drive.assessment.notes,
    } : null,
    interview: drive.interview ? {
      nextScheduledAt: drive.interview.nextScheduledAt,
      timeZone: drive.interview.timeZone,
      mode: drive.interview.mode,
      location: drive.interview.location,
      meetingUrl: drive.interview.meetingUrl,
      roundSummary: drive.interview.roundSummary,
      notes: drive.interview.notes,
    } : null,
  };
}

function proposalPayload(proposal: ActionProposal): JobDriveProgressPayload {
  return {
    companyName: proposal.payload.companyName,
    roleTitle: proposal.payload.roleTitle,
    stage: proposal.payload.stage,
    stageOccurredAt: proposal.payload.stageOccurredAt,
    appliedAt: proposal.payload.appliedAt,
    applyBy: proposal.payload.applyBy,
    location: proposal.payload.location,
    sourceUrl: proposal.payload.sourceUrl,
    notes: proposal.payload.notes,
    assessment: proposal.payload.assessment,
    interview: proposal.payload.interview,
  };
}

function initials(name: string | null, email: string | null) {
  const source = name?.trim() || email?.split("@")[0] || "You";
  return source.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

async function responseError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { error?: unknown; recovery?: unknown };
    return [body.error, body.recovery].filter((value): value is string => typeof value === "string").join(" ") || fallback;
  } catch {
    return fallback;
  }
}

function Navigation({ view, persistent, onSelect }: { view: WorkspaceView; persistent: boolean; onSelect: (view: "command" | "drives") => void }) {
  const items = [
    { view: "command" as const, label: "Command center", icon: Sparkles, href: "/app" },
    { view: "drives" as const, label: "Drives", icon: BriefcaseBusiness, href: "/app/drives" },
  ];
  return <nav aria-label="Primary" className="mt-9 space-y-1">{items.map((item) => {
    const active = view === item.view || (view === "detail" && item.view === "drives");
    const className = `flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium transition ${active ? "bg-white text-[#294435] shadow-[0_1px_3px_rgba(32,37,31,0.06)]" : "text-[#6e776d] hover:bg-white/70"}`;
    const content = <><item.icon size={17} /><span>{item.label}</span>{active ? <span className="ml-auto size-1.5 rounded-full bg-[#d8a451]" /> : null}</>;
    return persistent ? <Link aria-current={active ? "page" : undefined} className={className} href={item.href} key={item.view}>{content}</Link> : <button aria-current={active ? "page" : undefined} className={className} key={item.view} onClick={() => onSelect(item.view)} type="button">{content}</button>;
  })}</nav>;
}

function localDrive(id: string, payload: JobDriveProgressPayload, existing?: JobDrive): JobDrive {
  const now = new Date().toISOString();
  return {
    id,
    ...payload,
    assessment: payload.assessment ? { ...payload.assessment, updatedAt: now } : null,
    interview: payload.interview ? { ...payload.interview, updatedAt: now } : null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export function JobDriveCommandCenter({
  mode = "demo",
  initialView = "command",
  initialProposals = [],
  initialJobDrives = [],
  selectedJobDriveId,
  initialActivity = [],
  viewer = { displayName: null, email: null },
  loadError = null,
}: JobDriveCommandCenterProps) {
  const persistent = mode === "persistent";
  const router = useRouter();
  const [demoView, setDemoView] = useState<WorkspaceView>(initialView);
  const view = persistent ? initialView : demoView;
  const [message, setMessage] = useState("");
  const [assistantReply, setAssistantReply] = useState<AssistantResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingProposals, setPendingProposals] = useState(initialProposals);
  const [drives, setDrives] = useState(initialJobDrives);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [demoSelectedId, setDemoSelectedId] = useState(selectedJobDriveId);
  const [activity, setActivity] = useState(initialActivity);
  const selectedId = persistent ? selectedJobDriveId : demoSelectedId;
  const selectedDrive = drives.find((drive) => drive.id === selectedId) ?? null;
  const greetingName = useMemo(() => viewer.displayName?.split(/\s+/)[0] || null, [viewer.displayName]);

  function clearNotices() { setError(null); setSuccess(null); }
  function openCreate() { clearNotices(); setEditor({ mode: "create", id: crypto.randomUUID(), initial: emptyDrive }); }
  function openEdit(drive: JobDrive, stage = drive.stage) {
    clearNotices();
    setEditor({ mode: "edit", driveId: drive.id, existingStage: drive.stage, initial: { ...drivePayload(drive), stage, stageOccurredAt: stage === drive.stage ? drive.stageOccurredAt : null } });
  }
  function openExisting(jobDriveId: string) {
    setEditor(null);
    if (persistent) {
      router.push(`/app/drives/${jobDriveId}`);
      return;
    }
    setDemoSelectedId(jobDriveId);
    setDemoView("detail");
  }

  function addActivity(before: JobDrive | undefined, after: JobDrive, source: "manual" | "assistant") {
    if (selectedId !== after.id) return;
    setActivity((current) => [{
      id: crypto.randomUUID(), eventType: before ? "job_drive.updated" : "job_drive.created", source,
      previousStage: before?.stage ?? null, newStage: after.stage,
      changedFields: Object.keys(drivePayload(after)).filter((key) => !before || JSON.stringify(drivePayload(before)[key as keyof JobDriveProgressPayload]) !== JSON.stringify(drivePayload(after)[key as keyof JobDriveProgressPayload])),
      occurredAt: after.stageOccurredAt, createdAt: new Date().toISOString(),
    }, ...current]);
  }

  function upsertDrive(saved: JobDrive, source: "manual" | "assistant") {
    const before = drives.find((drive) => drive.id === saved.id);
    setDrives((current) => [saved, ...current.filter((drive) => drive.id !== saved.id)]);
    addActivity(before, saved, source);
  }

  async function requestProposal(value: string) {
    const trimmed = value.trim();
    if (!trimmed || isLoading) return;
    setMessage(trimmed); setIsLoading(true); clearNotices(); setAssistantReply(null);
    try {
      const response = await fetch("/api/assistant/proposals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: trimmed, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", locale: navigator.language || "en-IN", clientRequestId: crypto.randomUUID() }) });
      if (!response.ok) throw new Error(await responseError(response, "dolu bolu could not interpret that message."));
      const parsed = assistantResponseSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error("The assistant returned an invalid response.");
      if (parsed.data.decision.kind === "proposals") {
        const proposals = parsed.data.decision.proposals;
        const ids = new Set(proposals.map((proposal) => proposal.id));
        setPendingProposals((current) => [...proposals, ...current.filter((proposal) => !ids.has(proposal.id))]);
        setMessage("");
      } else setAssistantReply(parsed.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
    } finally { setIsLoading(false); }
  }

  async function confirmProposal(proposal: ActionProposal, drive: JobDriveProgressPayload, options: { allowPossibleDuplicate: boolean; isCorrection: boolean }): Promise<ConfirmJobDriveResponse> {
    let result: ConfirmJobDriveResponse;
    if (persistent) {
      const response = await fetch(`/api/assistant/proposals/${encodeURIComponent(proposal.id)}/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: proposal.version, allowPossibleDuplicate: options.allowPossibleDuplicate, drive }) });
      const body = await response.json();
      const parsed = confirmJobDriveResponseSchema.safeParse(body);
      if (!parsed.success) throw new Error(response.ok ? "The server returned an invalid confirmation." : ((body as { error?: string }).error ?? "The update could not be confirmed."));
      result = parsed.data;
    } else {
      const existing = proposal.payload.jobDriveId ? drives.find((item) => item.id === proposal.payload.jobDriveId) : undefined;
      result = { outcome: "executed", proposalId: proposal.id, jobDrive: localDrive(existing?.id ?? crypto.randomUUID(), drive, existing) };
    }
    if (result.outcome === "possible_duplicate") return result;
    setPendingProposals((current) => current.filter((item) => item.id !== proposal.id));
    upsertDrive(result.jobDrive, "assistant");
    setSuccess(result.outcome === "already_executed" ? "That update was already confirmed." : "Job Drive updated from your confirmed proposal.");
    if (persistent) router.refresh();
    return result;
  }

  async function discardProposal(proposal: ActionProposal) {
    if (persistent) {
      const response = await fetch(`/api/assistant/proposals/${encodeURIComponent(proposal.id)}/reject`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: proposal.version }) });
      if (!response.ok) throw new Error(await responseError(response, "The proposal could not be discarded."));
    }
    setPendingProposals((current) => current.filter((item) => item.id !== proposal.id));
    setSuccess("Proposal discarded.");
  }

  async function saveManual(drive: JobDriveProgressPayload, options: { allowPossibleDuplicate: boolean; isCorrection: boolean }): Promise<SaveJobDriveResponse> {
    if (!editor) throw new Error("The editor is no longer open.");
    let result: SaveJobDriveResponse;
    if (persistent) {
      const isCreate = editor.mode === "create";
      const current = !isCreate ? drives.find((item) => item.id === editor.driveId) : null;
      if (!isCreate && !current) throw new Error("Refresh to load the latest Job Drive.");
      const response = await fetch(isCreate ? "/api/job-drives" : `/api/job-drives/${encodeURIComponent(editor.driveId)}`, {
        method: isCreate ? "POST" : "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isCreate ? { jobDriveId: editor.id, allowPossibleDuplicate: options.allowPossibleDuplicate, drive } : { expectedUpdatedAt: current!.updatedAt, isCorrection: options.isCorrection, drive }),
      });
      const body = await response.json();
      const parsed = saveJobDriveResponseSchema.safeParse(body);
      if (!parsed.success) throw new Error(response.ok ? "The server returned an invalid Job Drive." : ((body as { error?: string; recovery?: string }).error ?? "The Job Drive could not be saved."));
      result = parsed.data;
    } else {
      const id = editor.mode === "create" ? editor.id : editor.driveId;
      const existing = drives.find((item) => item.id === id);
      result = { outcome: existing ? "updated" : "created", jobDrive: localDrive(id, drive, existing) };
    }
    if (result.outcome === "possible_duplicate") return result;
    upsertDrive(result.jobDrive, "manual");
    setEditor(null); setSuccess(result.outcome === "updated" ? "Job Drive updated." : "Job Drive added.");
    if (persistent) router.refresh();
    return result;
  }

  const editorElement = editor ? <JobDriveEditor existingStage={editor.mode === "edit" ? editor.existingStage : undefined} initial={editor.initial} key={editor.mode === "create" ? editor.id : `${editor.driveId}:${editor.initial.stage}`} mode={editor.mode} onCancel={() => setEditor(null)} onSave={saveManual} onUseExisting={openExisting} /> : null;

  return (
    <div className="min-h-screen bg-transparent lg:grid lg:grid-cols-[246px_minmax(0,1fr)]">
      <aside className="hidden border-r border-[#e5e8e1] bg-[#f5f7f2]/90 px-4 py-5 backdrop-blur lg:flex lg:min-h-screen lg:flex-col">
        <div className="flex items-center gap-3 px-2 py-1"><span className="relative grid size-9 place-items-center rounded-[13px] bg-[#294435] text-white"><Sparkles size={17} /><span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-[#f5f7f2] bg-[#e0ae5e]" /></span><div><p className="font-[family-name:var(--font-manrope)] text-lg font-bold tracking-[-0.04em] text-[#253028]">dolu bolu</p><p className="-mt-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-[#8a9188]">Career assistant</p></div></div>
        <Navigation onSelect={setDemoView} persistent={persistent} view={view} />
        <div className="mt-auto rounded-2xl border border-[#dfe5dc] bg-white/80 p-4"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-[#4f5d51]">{persistent ? "Connected workspace" : "Local preview"}</span><span className="rounded-full bg-[#eef3eb] px-2 py-0.5 text-[10px] font-bold text-[#55705b]">v0.4</span></div><p className="mt-2 text-xs leading-5 text-[#828981]">{persistent ? "Private Job Drives and immutable activity survive reloads." : "Preview data resets when you reload."}</p></div>
      </aside>

      <div className="min-w-0">
        <header className="flex min-h-16 items-center justify-between border-b border-[#e7eae4] bg-[#fbfcf8]/80 px-5 py-3 backdrop-blur sm:px-8 lg:h-[72px] lg:px-10">
          <div className="flex items-center gap-2.5 lg:hidden"><span className="grid size-8 place-items-center rounded-xl bg-[#294435] text-white"><Sparkles size={15} /></span><span className="font-[family-name:var(--font-manrope)] font-bold">dolu bolu</span></div>
          <div className="hidden items-center gap-2 text-xs font-medium text-[#7d857b] lg:flex"><CircleDot className="text-[#66806c]" size={13} />Workspace<ChevronRight size={13} /><span className="text-[#49534a]">{view === "command" ? "Command center" : view === "detail" ? selectedDrive?.companyName ?? "Drive" : "Drives"}</span></div>
          <div className="flex items-center gap-2.5"><div className="flex rounded-xl border border-[#dfe5dc] bg-white p-1 lg:hidden">{persistent ? <><Link aria-label="Command center" className={`grid size-8 place-items-center rounded-lg ${view === "command" ? "bg-[#e8efe6] text-[#294435]" : "text-[#7d867b]"}`} href="/app"><Sparkles size={15} /></Link><Link aria-label="Drives" className={`grid size-8 place-items-center rounded-lg ${view !== "command" ? "bg-[#e8efe6] text-[#294435]" : "text-[#7d867b]"}`} href="/app/drives"><BriefcaseBusiness size={15} /></Link></> : <><button aria-label="Command center" className={`grid size-8 place-items-center rounded-lg ${view === "command" ? "bg-[#e8efe6]" : ""}`} onClick={() => setDemoView("command")} type="button"><Sparkles size={15} /></button><button aria-label="Drives" className={`grid size-8 place-items-center rounded-lg ${view !== "command" ? "bg-[#e8efe6]" : ""}`} onClick={() => setDemoView("drives")} type="button"><BriefcaseBusiness size={15} /></button></>}</div><span className="grid size-9 place-items-center rounded-full bg-[#dce7dc] text-xs font-bold text-[#365441]">{initials(viewer.displayName, viewer.email)}</span>{persistent ? <form action="/auth/signout" method="post"><button aria-label="Sign out" className="grid size-9 place-items-center rounded-xl border border-[#e1e5de] bg-white text-[#687168]" type="submit"><LogOut size={15} /></button></form> : null}</div>
        </header>

        <main className="mx-auto w-full max-w-[1180px] px-5 py-8 sm:px-8 lg:px-10 lg:py-12">
          {view === "detail" && selectedDrive ? (
            <><div className="mb-5">{persistent ? <Link className="inline-flex items-center gap-2 text-sm font-semibold text-[#536354]" href="/app/drives"><ArrowLeft size={15} /> All Drives</Link> : <button className="inline-flex items-center gap-2 text-sm font-semibold text-[#536354]" onClick={() => setDemoView("drives")} type="button"><ArrowLeft size={15} /> All Drives</button>}</div>{editorElement ? <div className="mb-5">{editorElement}</div> : null}<JobDriveDetail activity={activity} drive={selectedDrive} onEditStage={(stage) => openEdit(selectedDrive, stage)} /></>
          ) : view === "drives" ? (
            <><section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#718071]">Your hiring pipeline</p><h1 className="mt-2 font-[family-name:var(--font-manrope)] text-[clamp(2rem,4vw,3.2rem)] font-semibold leading-[1.08] tracking-[-0.055em] text-[#202820]">Job Drives</h1><p className="mt-3 max-w-xl text-sm leading-6 text-[#747c72]">One company-and-role process from plan to outcome, with the nearest important date visible.</p></div><button className="inline-flex items-center gap-2 self-start rounded-xl bg-[#294435] px-4 py-2.5 text-sm font-semibold text-white" onClick={openCreate} type="button"><Plus size={15} /> Add Job Drive</button></section>{loadError ? <p className="mt-7 rounded-2xl border border-[#ead5cf] bg-[#fff8f6] p-4 text-sm text-[#83564c]">{loadError}</p> : null}{success ? <p className="mt-7 rounded-2xl border border-[#d5e4d3] bg-[#f4faf2] p-4 text-sm text-[#45604a]">{success}</p> : null}{editorElement ? <div className="mt-8">{editorElement}</div> : null}<div className={editorElement ? "mt-5" : "mt-8"}><JobDriveList drives={drives} onCreate={openCreate} onOpen={(drive) => { setDemoSelectedId(drive.id); setDemoView("detail"); }} persistent={persistent} /></div></>
          ) : (
            <><section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#718071]">{greetingName ? `Welcome, ${greetingName}` : "Your career workspace"}</p><h1 className="mt-2 max-w-2xl font-[family-name:var(--font-manrope)] text-[clamp(2rem,4vw,3.2rem)] font-semibold leading-[1.08] tracking-[-0.055em] text-[#202820]">Keep every hiring process moving.</h1><p className="mt-3 max-w-xl text-sm leading-6 text-[#747c72]">Tell dolu bolu what changed—from application to OA, interview, offer, or outcome. You review every field before it is saved.</p></div><div className="flex items-center gap-2 self-start rounded-full border border-[#dde4da] bg-white/80 px-3 py-1.5 text-xs font-medium text-[#58705d]"><LockKeyhole size={13} /> Private by design</div></section>
              {loadError ? <p className="mt-7 rounded-2xl border border-[#ead5cf] bg-[#fff8f6] p-4 text-sm text-[#83564c]">{loadError}</p> : null}
              <div className="mt-9 grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]"><section className="min-w-0"><div className="overflow-hidden rounded-[28px] border border-[#dfe5dc] bg-white shadow-[0_22px_70px_rgba(55,74,58,0.09)]"><div className="border-b border-[#edf0eb] px-5 py-5 sm:px-7"><div className="flex items-start gap-4"><span className="relative grid size-11 shrink-0 place-items-center rounded-2xl bg-[#294435] text-white"><MessageCircleMore size={20} /><span className="animate-breathe absolute -right-1 -top-1 size-3 rounded-full border-2 border-white bg-[#e2ad57]" /></span><div><h2 className="font-[family-name:var(--font-manrope)] text-base font-semibold text-[#263027]">What changed?</h2><p className="mt-1 text-sm text-[#81887f]">Describe one Job Drive update in natural language.</p></div></div></div><form className="px-5 pb-5 pt-4 sm:px-7" onSubmit={(event: FormEvent) => { event.preventDefault(); void requestProposal(message); }}><label className="sr-only" htmlFor="assistant-message">Describe a Job Drive update</label><textarea className="min-h-28 w-full resize-none bg-transparent text-[16px] leading-7 text-[#2a312a] outline-none placeholder:text-[#a0a79e]" id="assistant-message" maxLength={2000} onChange={(event) => setMessage(event.target.value)} placeholder="Try “OA at Linear for Frontend Engineer tomorrow.”" value={message} /><div className="mt-3 flex flex-col gap-3 border-t border-[#edf0eb] pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="flex items-center gap-1.5 text-[11px] text-[#8a9188]"><Sparkles size={12} /> dolu bolu proposes. You decide.</p><button className="inline-flex h-11 items-center justify-center gap-2 rounded-[14px] bg-[#294435] px-5 text-sm font-semibold text-white disabled:opacity-45" disabled={!message.trim() || isLoading || Boolean(loadError)} type="submit">{isLoading ? "Interpreting…" : "Prepare update"}<ArrowUp size={16} /></button></div></form></div>
                <div className="mt-4 flex flex-wrap gap-2">{suggestions.map((suggestion) => <button className="rounded-full border border-[#dfe4dc] bg-white/75 px-3.5 py-2 text-xs font-medium text-[#5c675d]" disabled={isLoading || Boolean(loadError)} key={suggestion.label} onClick={() => void requestProposal(suggestion.message)} type="button">{suggestion.label}</button>)}<button className="inline-flex items-center gap-1.5 rounded-full border border-[#d4dfd1] bg-[#f4f8f1] px-3.5 py-2 text-xs font-semibold text-[#49604e]" onClick={openCreate} type="button"><Plus size={13} /> Add manually</button></div>
                {editorElement ? <div className="mt-6">{editorElement}</div> : null}
                <div aria-live="polite" className="mt-6 space-y-4">{isLoading ? <div className="rounded-[22px] border border-[#e1e6df] bg-white/70 p-6 text-sm font-medium text-[#5d6b60]">Turning your message into a reviewable update…</div> : null}{success ? <div className="rounded-[20px] border border-[#d5e4d3] bg-[#f4faf2] p-4 text-sm text-[#45604a]">{success} {persistent ? <Link className="font-semibold underline" href="/app/drives">View Drives</Link> : <button className="font-semibold underline" onClick={() => setDemoView("drives")} type="button">View Drives</button>}</div> : null}{error ? <div className="rounded-[22px] border border-[#edd7d2] bg-[#fff9f7] p-5 text-sm text-[#7b4e45]"><strong>I could not prepare that safely.</strong><p className="mt-1">{error}</p></div> : null}{assistantReply?.decision.kind === "needs_clarification" ? <div className="rounded-[22px] border border-[#eadfca] bg-[#fffbf3] p-5"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9a7944]">One detail first</p><p className="mt-2 text-sm text-[#5f523e]">{assistantReply.decision.question}</p></div> : null}{assistantReply?.decision.kind === "unsupported" ? <div className="rounded-[22px] border border-[#e4ddd4] bg-[#fcfaf7] p-5 text-sm text-[#675b4e]">{assistantReply.decision.message}</div> : null}{pendingProposals.map((proposal) => <JobDriveEditor assumptions={proposal.assumptions} description="Check the inferred stage and any dates. Nothing is written until you confirm." evidence={proposal.evidence} existingStage={drives.find((drive) => drive.id === proposal.payload.jobDriveId)?.stage} initial={proposalPayload(proposal)} key={`${proposal.id}:${proposal.version}`} mode="review" onCancel={() => setPendingProposals((current) => current.filter((item) => item.id !== proposal.id))} onDiscard={() => discardProposal(proposal)} onSave={(drive, options) => confirmProposal(proposal, drive, options)} onUseExisting={openExisting} title={proposal.summary} />)}</div></section>
                <aside className="space-y-5"><section className="rounded-[22px] border border-[#e0e5de] bg-white/85 p-5"><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#849083]">Workspace snapshot</p><div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-xl bg-[#f5f7f3] px-3 py-4 text-center"><p className="text-xl font-semibold text-[#344338]">{drives.length}</p><p className="text-[10px] uppercase text-[#899187]">Drives</p></div><div className="rounded-xl bg-[#faf6ec] px-3 py-4 text-center"><p className="text-xl font-semibold text-[#62563e]">{pendingProposals.length}</p><p className="text-[10px] uppercase text-[#968a70]">To review</p></div></div></section><section className="rounded-[22px] bg-[#294435] p-5 text-white"><div className="flex items-center gap-2 text-[#cbdacc]"><LockKeyhole size={14} /><p className="text-[11px] font-bold uppercase tracking-[0.16em]">Trust contract</p></div><p className="mt-3 text-[15px] font-semibold leading-6">The model proposes. Deterministic code validates. You authorize the write.</p><p className="mt-2 text-xs leading-5 text-[#b8cabd]">Every confirmation is atomic, retry-safe, and recorded in the drive activity.</p></section></aside></div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
