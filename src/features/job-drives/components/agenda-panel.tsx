"use client";

import { AlertCircle, CalendarDays, Hourglass } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Card, Eyebrow } from "@/components/ui/card";
import { WorkspaceLink } from "@/features/workspace/navigation";
import { useIsClient } from "@/lib/use-is-client";

import { buildAgenda, QUIET_AFTER_DAYS, type AgendaDay } from "../agenda";
import type { JobDrive } from "../contracts";
import { stageLabel } from "../stage-rules";

const dayFormatter = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
const timeFormatter = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });

function dayHeading(day: AgendaDay) {
  if (day.relative === "today") return "Today";
  if (day.relative === "tomorrow") return "Tomorrow";
  return dayFormatter.format(new Date(`${day.date}T00:00:00Z`));
}

function Group({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-subtle">
        {icon} {title}
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

const rowLink =
  "flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-brand";

/** The home screen's answer to "what needs me next?" (docs/decisions/0019). */
export function AgendaPanel({ drives }: { drives: JobDrive[] }) {
  const isClient = useIsClient();
  // Read once per visit; the page re-renders from the server after every change.
  const [now] = useState(() => Date.now());

  if (!isClient) {
    return (
      <Card aria-busy="true" className="p-6">
        <Eyebrow>What needs you</Eyebrow>
        <div className="mt-4 h-24 animate-pulse rounded-2xl bg-surface-muted" />
      </Card>
    );
  }

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const agenda = buildAgenda(drives, now, timeZone);
  const nothing = !agenda.attention.length && !agenda.upcoming.length && !agenda.quiet.length;

  return (
    <Card className="p-6">
      <Eyebrow>What needs you</Eyebrow>
      {nothing ? (
        <p className="mt-3 text-sm leading-6 text-muted">
          {drives.length
            ? "Nothing scheduled or overdue. Deadlines, interview rounds, and drives that go quiet will show up here."
            : "Add your first Job Drive to see deadlines and interviews here."}
        </p>
      ) : (
        <div className="mt-5 space-y-6">
          {agenda.attention.length ? (
            <Group icon={<AlertCircle aria-hidden="true" className="text-danger-ink" size={14} />} title="Loose ends">
              <ul className="space-y-1">
                {agenda.attention.map((item) => (
                  <li key={item.key}>
                    <WorkspaceLink className={rowLink} to={{ view: "drive", driveId: item.drive.id }}>
                      <span>
                        <span className="font-semibold text-ink-soft">{item.drive.companyName}</span>
                        <span className="block text-xs text-muted">{item.message}</span>
                      </span>
                    </WorkspaceLink>
                  </li>
                ))}
              </ul>
            </Group>
          ) : null}

          {agenda.upcoming.length ? (
            <Group icon={<CalendarDays aria-hidden="true" className="text-brand-text" size={14} />} title="Next two weeks">
              <ol className="space-y-4">
                {agenda.upcoming.map((day) => (
                  <li key={day.date}>
                    <p className="px-3 text-xs font-semibold text-ink-soft">{dayHeading(day)}</p>
                    <ul className="mt-1 space-y-1">
                      {day.events.map((event) => (
                        <li key={event.key}>
                          <WorkspaceLink className={rowLink} to={{ view: "drive", driveId: event.drive.id }}>
                            <span className="min-w-0">
                              <span className="font-semibold text-ink-soft">{event.label}</span>
                              <span className="text-muted"> · {event.drive.companyName}</span>
                              <span className="block truncate text-xs text-subtle">{event.drive.roleTitle}</span>
                            </span>
                            <span className="shrink-0 text-xs text-muted">
                              {event.allDay ? "All day" : timeFormatter.format(new Date(event.value))}
                            </span>
                          </WorkspaceLink>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            </Group>
          ) : null}

          {agenda.quiet.length ? (
            <Group icon={<Hourglass aria-hidden="true" className="text-accent-ink" size={14} />} title="Gone quiet">
              <p className="px-3 text-xs text-muted">
                No update in {QUIET_AFTER_DAYS}+ days and nothing scheduled. Follow up, or mark them closed.
              </p>
              <ul className="mt-1 space-y-1">
                {agenda.quiet.map(({ drive, days }) => (
                  <li key={drive.id}>
                    <WorkspaceLink className={rowLink} to={{ view: "drive", driveId: drive.id }}>
                      <span>
                        <span className="font-semibold text-ink-soft">{drive.companyName}</span>
                        <span className="text-muted"> · {stageLabel(drive.stage)}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted">{days} days</span>
                    </WorkspaceLink>
                  </li>
                ))}
              </ul>
            </Group>
          ) : null}
        </div>
      )}
    </Card>
  );
}

