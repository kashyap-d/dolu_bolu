import "server-only";

import { z } from "zod";

import { normalizeActivityMetadata } from "@/features/job-drives/activity";
import {
  activityEventSchema,
  jobDriveSchema,
  saveJobDriveResponseSchema,
  type ActivityEvent,
  type JobDrive,
  type JobDriveProgressPayload,
} from "@/features/job-drives/contracts";
import { RepositoryError } from "@/server/repositories/errors";
import type { Database } from "@/server/supabase/database.types";
import type { AppSupabaseClient } from "@/server/supabase/server";

type Tables = Database["public"]["Tables"];
type DriveRow = Pick<
  Tables["job_drives"]["Row"],
  | "id" | "company_name" | "role_title" | "stage" | "stage_occurred_at" | "applied_at"
  | "apply_by" | "location" | "source_url" | "notes" | "created_at" | "updated_at"
>;
type AssessmentRow = Pick<
  Tables["job_drive_assessments"]["Row"],
  | "job_drive_id" | "status" | "available_from" | "due_at" | "duration_minutes"
  | "assessment_url" | "notes" | "updated_at"
>;
type InterviewRow = Pick<
  Tables["interviews"]["Row"],
  | "job_drive_id" | "starts_at" | "timezone" | "mode" | "location" | "meeting_url"
  | "round_summary" | "notes" | "updated_at"
>;

const driveColumns =
  "id, company_name, role_title, stage, stage_occurred_at, applied_at, apply_by, location, source_url, notes, created_at, updated_at";
const assessmentColumns =
  "job_drive_id, status, available_from, due_at, duration_minutes, assessment_url, notes, updated_at";
const interviewColumns =
  "job_drive_id, starts_at, timezone, mode, location, meeting_url, round_summary, notes, updated_at";

/** Results of the save_job_drive RPC, which returns untyped JSON. */
const saveJobDriveRpcSchema = z.union([
  saveJobDriveResponseSchema,
  z.object({
    outcome: z.enum(["auth_required", "not_found", "conflict", "correction_required", "invalid_payload"]),
  }),
]);

/**
 * Column types come from the generated database types; values that the
 * database stores as plain text (stages, statuses, dates) are still checked
 * against the domain contract on the way out.
 */
function toJobDrive(row: DriveRow, assessment: AssessmentRow | null, interview: InterviewRow | null) {
  const parsed = jobDriveSchema.safeParse({
    id: row.id,
    companyName: row.company_name,
    roleTitle: row.role_title,
    stage: row.stage,
    stageOccurredAt: row.stage_occurred_at,
    appliedAt: row.applied_at,
    applyBy: row.apply_by,
    location: row.location,
    sourceUrl: row.source_url,
    notes: row.notes,
    assessment: assessment && {
      status: assessment.status,
      availableFrom: assessment.available_from,
      dueAt: assessment.due_at,
      durationMinutes: assessment.duration_minutes,
      assessmentUrl: assessment.assessment_url,
      notes: assessment.notes,
      updatedAt: assessment.updated_at,
    },
    interview: interview && {
      nextScheduledAt: interview.starts_at,
      timeZone: interview.timezone,
      mode: interview.mode,
      location: interview.location,
      meetingUrl: interview.meeting_url,
      roundSummary: interview.round_summary,
      notes: interview.notes,
      updatedAt: interview.updated_at,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
  if (!parsed.success) throw new RepositoryError("Stored Job Drive data is invalid.");
  return parsed.data;
}

async function loadDetails(supabase: AppSupabaseClient, userId: string, jobDriveIds: string[]) {
  const [assessments, interviews] = await Promise.all([
    supabase
      .from("job_drive_assessments")
      .select(assessmentColumns)
      .eq("user_id", userId)
      .in("job_drive_id", jobDriveIds),
    supabase
      .from("interviews")
      .select(interviewColumns)
      .eq("user_id", userId)
      .in("job_drive_id", jobDriveIds)
      .order("updated_at", { ascending: false }),
  ]);
  if (assessments.error || interviews.error) {
    throw new RepositoryError("Could not load Job Drive details.");
  }

  const assessmentByDrive = new Map(assessments.data.map((row) => [row.job_drive_id, row]));
  // v1 shows one consolidated interview phase: the most recently updated row.
  const interviewByDrive = new Map<string, InterviewRow>();
  for (const row of interviews.data) {
    if (row.job_drive_id && !interviewByDrive.has(row.job_drive_id)) {
      interviewByDrive.set(row.job_drive_id, row);
    }
  }
  return { assessmentByDrive, interviewByDrive };
}

export async function listJobDrives(supabase: AppSupabaseClient, userId: string): Promise<JobDrive[]> {
  const { data, error } = await supabase
    .from("job_drives")
    .select(driveColumns)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw new RepositoryError("Could not load Job Drives.");
  if (data.length === 0) return [];

  const details = await loadDetails(supabase, userId, data.map((row) => row.id));
  return data.map((row) =>
    toJobDrive(row, details.assessmentByDrive.get(row.id) ?? null, details.interviewByDrive.get(row.id) ?? null),
  );
}

export async function findJobDrive(
  supabase: AppSupabaseClient,
  userId: string,
  jobDriveId: string,
): Promise<JobDrive | null> {
  const { data, error } = await supabase
    .from("job_drives")
    .select(driveColumns)
    .eq("id", jobDriveId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new RepositoryError("Could not load the Job Drive.");
  if (!data) return null;

  const details = await loadDetails(supabase, userId, [jobDriveId]);
  return toJobDrive(
    data,
    details.assessmentByDrive.get(jobDriveId) ?? null,
    details.interviewByDrive.get(jobDriveId) ?? null,
  );
}

export async function listJobDriveActivity(
  supabase: AppSupabaseClient,
  userId: string,
  jobDriveId: string,
): Promise<ActivityEvent[]> {
  const { data, error } = await supabase
    .from("activity_events")
    .select("id, event_type, metadata, created_at")
    .eq("user_id", userId)
    .eq("entity_type", "job_drive")
    .eq("entity_id", jobDriveId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new RepositoryError("Could not load activity history.");

  return data.map((row) => {
    const metadata = normalizeActivityMetadata(row.metadata);
    const parsed = activityEventSchema.safeParse({
      id: row.id,
      eventType: row.event_type,
      source: metadata.source,
      previousStage: metadata.previousStage,
      newStage: metadata.newStage,
      changedFields: metadata.changedFields,
      occurredAt: metadata.occurredAt,
      createdAt: row.created_at,
    });
    if (!parsed.success) throw new RepositoryError("Stored activity history is invalid.");
    return parsed.data;
  });
}

export async function saveJobDrive(
  supabase: AppSupabaseClient,
  input: {
    jobDriveId: string;
    expectedUpdatedAt: string | null;
    drive: JobDriveProgressPayload;
    allowPossibleDuplicate: boolean;
    isCorrection: boolean;
  },
) {
  const { data, error } = await supabase.rpc("save_job_drive", {
    p_job_drive_id: input.jobDriveId,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_payload: input.drive,
    p_allow_possible_duplicate: input.allowPossibleDuplicate,
    p_is_correction: input.isCorrection,
  });
  if (error) throw new RepositoryError("Could not save the Job Drive.");

  const parsed = saveJobDriveRpcSchema.safeParse(data);
  if (!parsed.success) throw new RepositoryError("Saving returned an unexpected result.");
  return parsed.data;
}
