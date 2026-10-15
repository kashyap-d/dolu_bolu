"use client";

import { CalendarClock, ExternalLink, MapPin, Pencil, Timer } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card, Eyebrow } from "@/components/ui/card";
import { LocalDate, LocalDateTime } from "@/components/ui/local-date-time";

import type { ActivityEvent, JobDrive, JobDriveStage } from "../contracts";
import { stageLabel } from "../stage-rules";
import { StageBar } from "./stage-bar";

function SummaryCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <h3 className="font-display text-sm font-semibold text-ink-soft">{title}</h3>
      <div className="mt-3 space-y-2 text-xs leading-5 text-muted">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p>
      <strong className="font-semibold text-ink-soft">{label}:</strong> {children}
    </p>
  );
}

function ExternalAnchor({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="inline-flex items-center gap-1.5 font-semibold text-brand-text underline-offset-2 hover:underline" href={href} rel="noreferrer" target="_blank">
      {children} <ExternalLink aria-hidden="true" size={13} />
    </a>
  );
}

const sourceLabels: Record<ActivityEvent["source"], string> = {
  assistant: "Confirmed AI proposal",
  manual: "Manual update",
  migration: "Migrated record",
};

function activityTitle(event: ActivityEvent) {
  if (!event.newStage) {
    return event.eventType === "application_created"
      ? "Application recorded before Job Drives"
      : event.eventType.replaceAll("_", " ");
  }
  return `${event.previousStage ? `${stageLabel(event.previousStage)} → ` : "Created at "}${stageLabel(event.newStage)}`;
}

export function JobDriveDetail({
  drive,
  activity,
  onEditStage,
}: {
  drive: JobDrive;
  activity: ActivityEvent[];
  onEditStage: (stage: JobDriveStage) => void;
}) {
  return (
    <div className="space-y-5">
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Eyebrow>Job Drive</Eyebrow>
            <h1 className="mt-1 font-display text-2xl font-semibold tracking-[-0.04em] text-ink">{drive.companyName}</h1>
            <p className="mt-1 text-sm text-muted">{drive.roleTitle}</p>
          </div>
          <Button onClick={() => onEditStage(drive.stage)} variant="secondary">
            <Pencil size={14} /> Edit details
          </Button>
        </div>
        <div className="mt-6">
          <StageBar onSelect={onEditStage} value={drive.stage} />
        </div>
        <p className="mt-3 text-xs text-subtle">
          Select a stage to record progress. Moving backwards or reopening a closed drive is saved as an audited correction.
        </p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <SummaryCard title="Drive details">
          <Row label="Stage reached"><LocalDateTime value={drive.stageOccurredAt} /></Row>
          <Row label="Applied"><LocalDate value={drive.appliedAt} /></Row>
          <Row label="Apply by"><LocalDate value={drive.applyBy} /></Row>
          {drive.location ? (
            <p className="flex gap-1.5"><MapPin aria-hidden="true" size={14} /> {drive.location}</p>
          ) : null}
          {drive.sourceUrl ? <ExternalAnchor href={drive.sourceUrl}>Open job posting</ExternalAnchor> : null}
        </SummaryCard>
        <SummaryCard title="Assessment / OA">
          {drive.assessment ? (
            <>
              <Row label="Status">{drive.assessment.status}</Row>
              <p className="flex gap-1.5">
                <CalendarClock aria-hidden="true" size={14} /> Opens <LocalDateTime value={drive.assessment.availableFrom} />
              </p>
              <Row label="Deadline"><LocalDateTime value={drive.assessment.dueAt} /></Row>
              {drive.assessment.durationMinutes ? (
                <p className="flex gap-1.5"><Timer aria-hidden="true" size={14} /> {drive.assessment.durationMinutes} minutes</p>
              ) : null}
              {drive.assessment.assessmentUrl ? (
                <ExternalAnchor href={drive.assessment.assessmentUrl}>Open assessment</ExternalAnchor>
              ) : null}
            </>
          ) : (
            <p>No assessment details recorded.</p>
          )}
        </SummaryCard>
        <SummaryCard title="Interview phase">
          {drive.interview ? (
            <>
              <Row label="Next interview"><LocalDateTime value={drive.interview.nextScheduledAt} /></Row>
              <Row label="Time zone">{drive.interview.timeZone ?? "Unknown"}</Row>
              <Row label="Mode">{drive.interview.mode}</Row>
              {drive.interview.roundSummary ? <Row label="Rounds">{drive.interview.roundSummary}</Row> : null}
              {drive.interview.meetingUrl ? (
                <ExternalAnchor href={drive.interview.meetingUrl}>Open meeting</ExternalAnchor>
              ) : null}
            </>
          ) : (
            <p>No interview details recorded.</p>
          )}
        </SummaryCard>
      </div>

      {drive.notes ? (
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-display text-sm font-semibold text-ink-soft">Notes</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted">{drive.notes}</p>
        </section>
      ) : null}

      <Card className="p-5">
        <h2 className="font-display text-base font-semibold text-ink-soft">Activity</h2>
        {activity.length ? (
          <ol className="mt-4 space-y-4">
            {activity.map((event) => (
              <li className="border-l-2 border-brand-ring pl-4" key={event.id}>
                <p className="text-sm font-semibold text-ink-soft">{activityTitle(event)}</p>
                <p className="mt-1 text-xs text-muted">
                  {sourceLabels[event.source]} · <LocalDateTime value={event.occurredAt ?? event.createdAt} />
                </p>
                <p className="mt-1 text-[11px] text-subtle">
                  Changed: {event.changedFields.join(", ") || "record metadata"}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-4 text-sm text-muted">No activity yet.</p>
        )}
      </Card>
    </div>
  );
}
