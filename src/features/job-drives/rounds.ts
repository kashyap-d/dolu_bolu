import type { InterviewRound, InterviewRoundKind, JobDrive } from "./contracts";
import { normalizeRoleTitle } from "./normalize";

/** A round as a provider proposes it: no identity yet. */
export type ProposedRound = Omit<InterviewRound, "id">;

export const roundKindLabels: Record<InterviewRoundKind, string> = {
  recruiter: "Recruiter screen",
  technical: "Technical",
  manager: "Hiring manager",
  hr: "HR",
  onsite: "Onsite",
  other: "Other",
};

/** Stored rounds without record metadata, as the editor and payloads use them. */
export function editableRounds(rounds: JobDrive["interviewRounds"]): InterviewRound[] {
  return rounds.map(({ updatedAt, ...round }) => round);
}

function sameTitle(left: string, right: string) {
  return normalizeRoleTitle(left) === normalizeRoleTitle(right);
}

/**
 * Merges the one round a message is about into a drive's existing rounds.
 * It updates a round with the same title, or the only scheduled round of the
 * same kind; otherwise it adds a new round. Stated values win; values the
 * message did not mention are kept.
 */
export function mergeProposedRound(
  proposed: ProposedRound | null,
  existing: readonly InterviewRound[],
  newId: () => string = () => crypto.randomUUID(),
): InterviewRound[] {
  if (!proposed) return [...existing];

  let match = existing.find((round) => sameTitle(round.title, proposed.title));
  if (!match && proposed.kind !== "other") {
    const sameKind = existing.filter((round) => round.kind === proposed.kind && round.status === "scheduled");
    if (sameKind.length === 1) match = sameKind[0];
  }

  if (!match) return [...existing, { id: newId(), ...proposed }];

  const scheduledAt = proposed.scheduledAt ?? match.scheduledAt;
  const merged: InterviewRound = {
    id: match.id,
    title: match.title,
    kind: proposed.kind === "other" ? match.kind : proposed.kind,
    status: proposed.status,
    scheduledAt,
    // A new time keeps its own zone; otherwise the stored zone stays with the stored time.
    timeZone: proposed.scheduledAt ? proposed.timeZone : (proposed.timeZone ?? match.timeZone),
    mode: proposed.mode === "unknown" ? match.mode : proposed.mode,
    location: proposed.location ?? match.location,
    meetingUrl: proposed.meetingUrl ?? match.meetingUrl,
    notes: proposed.notes ?? match.notes,
  };
  return existing.map((round) => (round.id === match.id ? merged : round));
}

/** The next scheduled round that has not happened yet, if any. */
export function nextScheduledRound(rounds: readonly InterviewRound[], now: number) {
  return rounds
    .filter((round) => round.status === "scheduled" && round.scheduledAt && new Date(round.scheduledAt).getTime() >= now)
    .sort((left, right) => new Date(left.scheduledAt!).getTime() - new Date(right.scheduledAt!).getTime())[0];
}
