"use client";

import { CalendarClock, ExternalLink, MapPin, Pencil, Timer } from "lucide-react";

import type { ActivityEvent, JobDrive, JobDriveStage } from "@/features/job-drives/contracts";
import { stageLabel } from "@/features/job-drives/stage-rules";
import { StageBar } from "@/features/job-drives/stage-bar";

function formatDate(value: string | null) {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function SummaryCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-[#e1e6df] bg-white p-5"><h3 className="font-[family-name:var(--font-manrope)] text-sm font-semibold text-[#354037]">{title}</h3><div className="mt-3 space-y-2 text-xs leading-5 text-[#697269]">{children}</div></section>;
}

function activityTitle(event: ActivityEvent) {
  if (!event.newStage) {
    return event.eventType === "application_created"
      ? "Application recorded before Job Drives"
      : event.eventType.replaceAll("_", " ");
  }
  return `${event.previousStage ? `${stageLabel(event.previousStage)} → ` : "Created at "}${stageLabel(event.newStage)}`;
}

export function JobDriveDetail({ drive, activity, onEditStage }: { drive: JobDrive; activity: ActivityEvent[]; onEditStage: (stage: JobDriveStage) => void }) {
  return (
    <div className="space-y-5">
      <section className="rounded-[24px] border border-[#dfe5dc] bg-white p-5 shadow-[0_16px_45px_rgba(55,74,58,0.06)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7a8679]">Job Drive</p><h2 className="mt-1 font-[family-name:var(--font-manrope)] text-2xl font-semibold tracking-[-0.04em] text-[#283229]">{drive.companyName}</h2><p className="mt-1 text-sm text-[#697268]">{drive.roleTitle}</p></div>
          <button className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#dce3d9] px-4 text-sm font-semibold text-[#536354]" onClick={() => onEditStage(drive.stage)} type="button"><Pencil size={14} /> Edit details</button>
        </div>
        <div className="mt-6"><StageBar onSelect={onEditStage} value={drive.stage} /></div>
        <p className="mt-3 text-xs text-[#80877e]">Select a stage to record progress. Backward moves and reopening are stored as audited corrections.</p>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <SummaryCard title="Drive details">
          <p><strong>Current stage:</strong> {stageLabel(drive.stage)}</p>
          <p><strong>Stage occurred:</strong> {formatDate(drive.stageOccurredAt)}</p>
          <p><strong>Applied:</strong> {formatDate(drive.appliedAt)}</p>
          <p><strong>Apply by:</strong> {formatDate(drive.applyBy)}</p>
          {drive.location ? <p className="flex gap-1.5"><MapPin size={14} /> {drive.location}</p> : null}
          {drive.sourceUrl ? <a className="inline-flex items-center gap-1.5 font-semibold text-[#42624a]" href={drive.sourceUrl} rel="noreferrer" target="_blank">Open job source <ExternalLink size={13} /></a> : null}
        </SummaryCard>
        <SummaryCard title="Assessment / OA">
          {drive.assessment ? <><p><strong>Status:</strong> {drive.assessment.status}</p><p className="flex gap-1.5"><CalendarClock size={14} /> Opens {formatDate(drive.assessment.availableFrom)}</p><p><strong>Deadline:</strong> {formatDate(drive.assessment.dueAt)}</p>{drive.assessment.durationMinutes ? <p className="flex gap-1.5"><Timer size={14} /> {drive.assessment.durationMinutes} minutes</p> : null}{drive.assessment.assessmentUrl ? <a className="inline-flex items-center gap-1.5 font-semibold text-[#42624a]" href={drive.assessment.assessmentUrl} rel="noreferrer" target="_blank">Open assessment <ExternalLink size={13} /></a> : null}</> : <p>No assessment details recorded.</p>}
        </SummaryCard>
        <SummaryCard title="Interview phase">
          {drive.interview ? <><p><strong>Next schedule:</strong> {formatDate(drive.interview.nextScheduledAt)}</p><p><strong>Timezone:</strong> {drive.interview.timeZone ?? "Unknown"}</p><p><strong>Mode:</strong> {drive.interview.mode}</p>{drive.interview.roundSummary ? <p><strong>Rounds:</strong> {drive.interview.roundSummary}</p> : null}{drive.interview.meetingUrl ? <a className="inline-flex items-center gap-1.5 font-semibold text-[#42624a]" href={drive.interview.meetingUrl} rel="noreferrer" target="_blank">Open meeting <ExternalLink size={13} /></a> : null}</> : <p>No interview details recorded.</p>}
        </SummaryCard>
      </div>

      {drive.notes ? <section className="rounded-2xl border border-[#e1e6df] bg-white p-5"><h3 className="text-sm font-semibold text-[#354037]">Notes</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#697269]">{drive.notes}</p></section> : null}

      <section className="rounded-[22px] border border-[#e1e6df] bg-white p-5">
        <h3 className="font-[family-name:var(--font-manrope)] text-base font-semibold text-[#354037]">Activity timeline</h3>
        <div className="mt-4 space-y-4">
          {activity.length ? activity.map((event) => <article className="border-l-2 border-[#c9d8c7] pl-4" key={event.id}><p className="text-sm font-semibold text-[#465347]">{activityTitle(event)}</p><p className="mt-1 text-xs text-[#788078]">{event.source === "assistant" ? "Confirmed AI proposal" : event.source === "migration" ? "Migrated record" : "Manual update"} · {formatDate(event.occurredAt ?? event.createdAt)}</p><p className="mt-1 text-[11px] text-[#929990]">Changed: {event.changedFields.join(", ") || "record metadata"}</p></article>) : <p className="text-sm text-[#7d857b]">No activity events yet.</p>}
        </div>
      </section>
    </div>
  );
}
