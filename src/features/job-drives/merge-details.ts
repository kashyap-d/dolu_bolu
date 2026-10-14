import type {
  AssessmentDetails,
  InterviewSummary,
  JobDrive,
} from "@/features/job-drives/contracts";

type StoredAssessment = JobDrive["assessment"];
type StoredInterview = JobDrive["interview"];

export function mergeAssessmentDetails(
  proposed: AssessmentDetails | null,
  existing: StoredAssessment,
): AssessmentDetails | null {
  if (!proposed && !existing) return null;
  if (!proposed) {
    return {
      status: existing!.status,
      availableFrom: existing!.availableFrom,
      dueAt: existing!.dueAt,
      durationMinutes: existing!.durationMinutes,
      assessmentUrl: existing!.assessmentUrl,
      notes: existing!.notes,
    };
  }

  return {
    status: proposed.status,
    availableFrom: proposed.availableFrom ?? existing?.availableFrom ?? null,
    dueAt: proposed.dueAt ?? existing?.dueAt ?? null,
    durationMinutes:
      proposed.durationMinutes ?? existing?.durationMinutes ?? null,
    assessmentUrl:
      proposed.assessmentUrl ?? existing?.assessmentUrl ?? null,
    notes: proposed.notes ?? existing?.notes ?? null,
  };
}

export function mergeInterviewSummary(
  proposed: InterviewSummary | null,
  existing: StoredInterview,
): InterviewSummary | null {
  if (!proposed && !existing) return null;
  if (!proposed) {
    return {
      nextScheduledAt: existing!.nextScheduledAt,
      timeZone: existing!.timeZone,
      mode: existing!.mode,
      location: existing!.location,
      meetingUrl: existing!.meetingUrl,
      roundSummary: existing!.roundSummary,
      notes: existing!.notes,
    };
  }

  return {
    nextScheduledAt:
      proposed.nextScheduledAt ?? existing?.nextScheduledAt ?? null,
    timeZone: proposed.timeZone ?? existing?.timeZone ?? null,
    mode:
      proposed.mode === "unknown" && existing
        ? existing.mode
        : proposed.mode,
    location: proposed.location ?? existing?.location ?? null,
    meetingUrl: proposed.meetingUrl ?? existing?.meetingUrl ?? null,
    roundSummary:
      proposed.roundSummary ?? existing?.roundSummary ?? null,
    notes: proposed.notes ?? existing?.notes ?? null,
  };
}
