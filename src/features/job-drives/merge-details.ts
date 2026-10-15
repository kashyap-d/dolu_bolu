import type { AssessmentDetails, JobDrive } from "@/features/job-drives/contracts";

type StoredAssessment = JobDrive["assessment"];

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
