import { addDays, calendarDate, endOfLocalDay } from "@/lib/dates";

import type { JobDrive } from "./contracts";
import { isTerminalStage } from "./stage-rules";

export const AGENDA_HORIZON_DAYS = 14;
export const QUIET_AFTER_DAYS = 21;

const DAY_MS = 86_400_000;

type DriveRef = Pick<JobDrive, "id" | "companyName" | "roleTitle">;

export interface AgendaEvent {
  key: string;
  drive: DriveRef;
  label: string;
  value: string;
  allDay: boolean;
  at: number;
}

export interface AgendaDay {
  /** YYYY-MM-DD in the viewer's zone. */
  date: string;
  relative: "today" | "tomorrow" | null;
  events: AgendaEvent[];
}

export interface AttentionItem {
  key: string;
  drive: DriveRef;
  message: string;
}

export interface QuietDrive {
  drive: DriveRef & Pick<JobDrive, "stage">;
  days: number;
}

export interface Agenda {
  attention: AttentionItem[];
  upcoming: AgendaDay[];
  quiet: QuietDrive[];
}

function ref(drive: JobDrive): DriveRef {
  return { id: drive.id, companyName: drive.companyName, roleTitle: drive.roleTitle };
}

/** Every dated thing a drive has, whether past or future. */
function datedEvents(drive: JobDrive): AgendaEvent[] {
  const events: AgendaEvent[] = [];
  const add = (key: string, label: string, value: string | null, allDay = false) => {
    if (!value) return;
    events.push({
      key: `${drive.id}:${key}`,
      drive: ref(drive),
      label,
      value,
      allDay,
      at: allDay ? endOfLocalDay(value) : new Date(value).getTime(),
    });
  };

  if (drive.stage === "planned") add("apply-by", "Apply by", drive.applyBy, true);
  const assessment = drive.assessment;
  if (assessment && (assessment.status === "invited" || assessment.status === "scheduled")) {
    add("oa-opens", "OA opens", assessment.availableFrom);
    add("oa-due", "OA deadline", assessment.dueAt);
  }
  for (const round of drive.interviewRounds) {
    if (round.status === "scheduled") add(`round:${round.id}`, round.title, round.scheduledAt);
  }
  return events;
}

/**
 * What needs the user next, from their drives alone: overdue loose ends, the
 * coming two weeks grouped by day in `timeZone`, and active drives that have
 * gone quiet. Closed drives (offer accepted, rejected, withdrawn) never appear.
 */
export function buildAgenda(drives: readonly JobDrive[], now: number, timeZone: string): Agenda {
  const today = calendarDate(new Date(now), timeZone);
  const tomorrow = addDays(today, 1);
  const horizon = now + AGENDA_HORIZON_DAYS * DAY_MS;

  const attention: AttentionItem[] = [];
  const upcoming = new Map<string, AgendaEvent[]>();
  const quiet: QuietDrive[] = [];

  for (const drive of drives) {
    if (isTerminalStage(drive.stage)) continue;
    const events = datedEvents(drive);

    for (const event of events) {
      if (event.at < now) {
        attention.push({
          key: event.key,
          drive: event.drive,
          message: event.key.includes(":round:")
            ? `How did ${event.label} go? Mark it completed or reschedule it.`
            : event.label === "Apply by"
              ? "The apply-by date has passed. Did you apply?"
              : `The ${event.label.toLowerCase()} has passed. Update the OA status.`,
        });
      } else if (event.at <= horizon) {
        const day = event.allDay ? event.value : calendarDate(new Date(event.at), timeZone);
        upcoming.set(day, [...(upcoming.get(day) ?? []), event]);
      }
    }

    const days = Math.floor((now - new Date(drive.updatedAt).getTime()) / DAY_MS);
    const hasFutureEvent = events.some((event) => event.at >= now);
    if (drive.stage !== "planned" && days >= QUIET_AFTER_DAYS && !hasFutureEvent) {
      quiet.push({ drive: { ...ref(drive), stage: drive.stage }, days });
    }
  }

  return {
    attention,
    upcoming: [...upcoming.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, events]) => ({
        date,
        relative: date === today ? "today" : date === tomorrow ? "tomorrow" : null,
        events: events.sort((left, right) => left.at - right.at),
      })),
    quiet: quiet.sort((left, right) => right.days - left.days),
  };
}
