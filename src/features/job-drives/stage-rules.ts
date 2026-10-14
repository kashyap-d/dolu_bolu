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

export function importantDateForDrive(drive: {
  applyBy: string | null;
  assessment: { availableFrom: string | null; dueAt: string | null } | null;
  interview: { nextScheduledAt: string | null } | null;
}) {
  const datedItems = [
    drive.applyBy
      ? { label: "Apply by", value: drive.applyBy }
      : null,
    drive.assessment?.dueAt
      ? { label: "OA deadline", value: drive.assessment.dueAt }
      : drive.assessment?.availableFrom
        ? { label: "OA opens", value: drive.assessment.availableFrom }
        : null,
    drive.interview?.nextScheduledAt
      ? { label: "Interview", value: drive.interview.nextScheduledAt }
      : null,
  ].filter((item): item is { label: string; value: string } => Boolean(item));

  if (datedItems.length === 0) return null;
  const future = datedItems
    .filter((item) => new Date(item.value).getTime() >= Date.now())
    .sort(
      (left, right) =>
        new Date(left.value).getTime() - new Date(right.value).getTime(),
    );

  return future[0] ?? datedItems.sort(
    (left, right) =>
      new Date(right.value).getTime() - new Date(left.value).getTime(),
  )[0];
}
