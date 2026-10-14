import type { ActionProposal } from "@/features/assistant/contracts";

import type { JobDrive, JobDriveProgressPayload } from "./contracts";

export const emptyJobDrivePayload: JobDriveProgressPayload = {
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

/** The editable fields of a stored drive, without record metadata. */
export function payloadFromDrive(drive: JobDrive): JobDriveProgressPayload {
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
    assessment: drive.assessment
      ? {
          status: drive.assessment.status,
          availableFrom: drive.assessment.availableFrom,
          dueAt: drive.assessment.dueAt,
          durationMinutes: drive.assessment.durationMinutes,
          assessmentUrl: drive.assessment.assessmentUrl,
          notes: drive.assessment.notes,
        }
      : null,
    interview: drive.interview
      ? {
          nextScheduledAt: drive.interview.nextScheduledAt,
          timeZone: drive.interview.timeZone,
          mode: drive.interview.mode,
          location: drive.interview.location,
          meetingUrl: drive.interview.meetingUrl,
          roundSummary: drive.interview.roundSummary,
          notes: drive.interview.notes,
        }
      : null,
  };
}

/** The editable fields of a proposal, without its server-owned target metadata. */
export function payloadFromProposal(proposal: ActionProposal): JobDriveProgressPayload {
  const { payload } = proposal;
  return {
    companyName: payload.companyName,
    roleTitle: payload.roleTitle,
    stage: payload.stage,
    stageOccurredAt: payload.stageOccurredAt,
    appliedAt: payload.appliedAt,
    applyBy: payload.applyBy,
    location: payload.location,
    sourceUrl: payload.sourceUrl,
    notes: payload.notes,
    assessment: payload.assessment,
    interview: payload.interview,
  };
}

/** Top-level fields whose values differ; for a new drive, the fields it was given. */
export function changedFields(
  before: JobDriveProgressPayload | null,
  after: JobDriveProgressPayload,
) {
  return (Object.keys(after) as Array<keyof JobDriveProgressPayload>).filter((key) =>
    before ? JSON.stringify(before[key]) !== JSON.stringify(after[key]) : after[key] !== null,
  );
}
