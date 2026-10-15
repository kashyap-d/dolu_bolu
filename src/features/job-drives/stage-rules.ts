import { endOfLocalDay } from "@/lib/dates";

import type { JobDriveStage } from "./contracts";

export const primaryJobDriveStages: readonly JobDriveStage[] = [
  "planned",
  "applied",
  "assessment",
  "interview",
  "offer",
  "accepted",
];

export const terminalJobDriveStages: readonly JobDriveStage[] = [
  "rejected",
  "withdrawn",
];

const stageRank = new Map(
  primaryJobDriveStages.map((stage, index) => [stage, index]),
);

export function stageLabel(stage: JobDriveStage) {
  const labels: Record<JobDriveStage, string> = {
    planned: "Planned",
    applied: "Applied",
    assessment: "Assessment / OA",
    interview: "Interview",
    offer: "Offer",
    accepted: "Accepted / Hired",
    rejected: "Rejected",
    withdrawn: "Withdrawn",
  };

  return labels[stage];
}

export function isTerminalStage(stage: JobDriveStage) {
  return stage === "accepted" || terminalJobDriveStages.includes(stage);
}

export function isBackwardStageChange(
  previous: JobDriveStage,
  next: JobDriveStage,
) {
  if (previous === next) return false;
  if (isTerminalStage(previous)) return true;
  if (isTerminalStage(next)) return false;

  return (stageRank.get(next) ?? 0) < (stageRank.get(previous) ?? 0);
}

export function inferredStage(
  current: JobDriveStage | null,
  proposed: JobDriveStage,
) {
  if (!current) return proposed;
  if (isTerminalStage(current)) return current;
  if (isTerminalStage(proposed)) return proposed;

  return (stageRank.get(proposed) ?? 0) > (stageRank.get(current) ?? 0)
    ? proposed
    : current;
}

export interface ImportantDate {
  label: string;
  value: string;
  /** True for calendar dates (YYYY-MM-DD), false for exact timestamps. */
  allDay: boolean;
  /** Milliseconds for ordering; an all-day value counts until the end of its day. */
  at: number;
}

export function importantDateForDrive(
  drive: {
    applyBy: string | null;
    assessment: { availableFrom: string | null; dueAt: string | null } | null;
    interview: { nextScheduledAt: string | null } | null;
  },
  now = Date.now(),
): ImportantDate | null {
  const candidates: ImportantDate[] = [];
  if (drive.applyBy) {
    candidates.push({ label: "Apply by", value: drive.applyBy, allDay: true, at: endOfLocalDay(drive.applyBy) });
  }
  const assessmentDate = drive.assessment?.dueAt
    ? { label: "OA deadline", value: drive.assessment.dueAt }
    : drive.assessment?.availableFrom
      ? { label: "OA opens", value: drive.assessment.availableFrom }
      : null;
  if (assessmentDate) {
    candidates.push({ ...assessmentDate, allDay: false, at: new Date(assessmentDate.value).getTime() });
  }
  if (drive.interview?.nextScheduledAt) {
    const value = drive.interview.nextScheduledAt;
    candidates.push({ label: "Interview", value, allDay: false, at: new Date(value).getTime() });
  }
  if (candidates.length === 0) return null;

  const upcoming = candidates.filter((item) => item.at >= now).sort((left, right) => left.at - right.at);
  return upcoming[0] ?? candidates.sort((left, right) => right.at - left.at)[0]!;
}
