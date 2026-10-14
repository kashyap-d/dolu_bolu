import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { normalizeActivityMetadata } from "@/features/job-drives/activity";
import {
  activityEventSchema,
  assessmentRecordSchema,
  interviewSummaryRecordSchema,
  jobDriveSchema,
  saveJobDriveResponseSchema,
  type ActivityEvent,
  type JobDrive,
  type JobDriveProgressPayload,
} from "@/features/job-drives/contracts";

const driveRowSchema = z.object({
  id: z.uuid(),
  company_name: z.string(),
  role_title: z.string(),
  stage: z.string(),
  stage_occurred_at: z.string().nullable(),
  applied_at: z.string().nullable(),
  apply_by: z.string().nullable(),
  location: z.string().nullable(),
  source_url: z.string().nullable(),
  notes: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const assessmentRowSchema = z.object({
  job_drive_id: z.uuid(),
  status: z.string(),
  available_from: z.string().nullable(),
  due_at: z.string().nullable(),
  duration_minutes: z.number().int().nullable(),
  assessment_url: z.string().nullable(),
  notes: z.string().nullable(),
  updated_at: z.string(),
});

const interviewRowSchema = z.object({
  job_drive_id: z.uuid(),
  starts_at: z.string().nullable(),
  timezone: z.string().nullable(),
  mode: z.string(),
  location: z.string().nullable(),
  meeting_url: z.string().nullable(),
  round_summary: z.string().nullable(),
  notes: z.string().nullable(),
  updated_at: z.string(),
});

const activityRowSchema = z.object({
  id: z.uuid(),
  event_type: z.string(),
  metadata: z.unknown(),
  created_at: z.string(),
});

const saveJobDriveRpcSchema = z.union([
  saveJobDriveResponseSchema,
  z.object({
    outcome: z.enum([
      "auth_required",
      "not_found",
      "conflict",
      "correction_required",
      "invalid_payload",
    ]),
  }),
]);

const driveSelect =
  "id, company_name, role_title, stage, stage_occurred_at, applied_at, apply_by, location, source_url, notes, created_at, updated_at";

export class JobDriveRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobDriveRepositoryError";
  }
}

function toAssessment(row: z.infer<typeof assessmentRowSchema>) {
  return assessmentRecordSchema.parse({
    status: row.status,
    availableFrom: row.available_from,
    dueAt: row.due_at,
    durationMinutes: row.duration_minutes,
    assessmentUrl: row.assessment_url,
    notes: row.notes,
    updatedAt: row.updated_at,
  });
}

function toInterview(row: z.infer<typeof interviewRowSchema>) {
  return interviewSummaryRecordSchema.parse({
    nextScheduledAt: row.starts_at,
    timeZone: row.timezone,
    mode: row.mode,
    location: row.location,
    meetingUrl: row.meeting_url,
    roundSummary: row.round_summary,
    notes: row.notes,
    updatedAt: row.updated_at,
  });
}

function toJobDrive(
  row: z.infer<typeof driveRowSchema>,
  assessment: z.infer<typeof assessmentRowSchema> | null,
  interview: z.infer<typeof interviewRowSchema> | null,
) {
  return jobDriveSchema.parse({
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
    assessment: assessment ? toAssessment(assessment) : null,
    interview: interview ? toInterview(interview) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

async function loadSupportingRecords(
  supabase: SupabaseClient,
  userId: string,
  jobDriveIds: string[],
) {
  const [assessmentResult, interviewResult] = await Promise.all([
    supabase
      .from("job_drive_assessments")
      .select(
        "job_drive_id, status, available_from, due_at, duration_minutes, assessment_url, notes, updated_at",
      )
      .eq("user_id", userId)
      .in("job_drive_id", jobDriveIds),
    supabase
      .from("interviews")
      .select(
        "job_drive_id, starts_at, timezone, mode, location, meeting_url, round_summary, notes, updated_at",
      )
      .eq("user_id", userId)
      .in("job_drive_id", jobDriveIds)
      .order("updated_at", { ascending: false }),
  ]);

  if (assessmentResult.error || interviewResult.error) {
    throw new JobDriveRepositoryError("Could not load Job Drive details.");
  }

  const assessments = z.array(assessmentRowSchema).safeParse(assessmentResult.data);
  const interviews = z.array(interviewRowSchema).safeParse(interviewResult.data);
  if (!assessments.success || !interviews.success) {
    throw new JobDriveRepositoryError("Stored Job Drive details are invalid.");
  }

  return { assessments: assessments.data, interviews: interviews.data };
}

export async function listJobDrives(
  supabase: SupabaseClient,
  userId: string,
): Promise<JobDrive[]> {
  const driveResult = await supabase
    .from("job_drives")
    .select(driveSelect)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (driveResult.error) {
    throw new JobDriveRepositoryError("Could not load Job Drives.");
  }

  const drives = z.array(driveRowSchema).safeParse(driveResult.data);
  if (!drives.success) {
    throw new JobDriveRepositoryError("Stored Job Drive data is invalid.");
  }
  if (drives.data.length === 0) return [];
  const supporting = await loadSupportingRecords(
    supabase,
    userId,
    drives.data.map((drive) => drive.id),
  );

  const assessments = new Map(
    supporting.assessments.map((row) => [row.job_drive_id, row]),
  );
  const interviews = new Map<string, z.infer<typeof interviewRowSchema>>();
  for (const row of supporting.interviews) {
    if (!interviews.has(row.job_drive_id)) interviews.set(row.job_drive_id, row);
  }

  return drives.data.map((row) =>
    toJobDrive(
      row,
      assessments.get(row.id) ?? null,
      interviews.get(row.id) ?? null,
    ),
  );
}

export async function findJobDrive(
  supabase: SupabaseClient,
  userId: string,
  jobDriveId: string,
): Promise<JobDrive | null> {
  const { data, error } = await supabase
    .from("job_drives")
    .select(driveSelect)
    .eq("id", jobDriveId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new JobDriveRepositoryError("Could not load the Job Drive.");
  if (!data) return null;
  const drive = driveRowSchema.safeParse(data);
  if (!drive.success) {
    throw new JobDriveRepositoryError("Stored Job Drive data is invalid.");
  }
  const supporting = await loadSupportingRecords(supabase, userId, [jobDriveId]);
  return toJobDrive(
    drive.data,
    supporting.assessments[0] ?? null,
    supporting.interviews[0] ?? null,
  );
}

export async function listJobDriveActivity(
  supabase: SupabaseClient,
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

  if (error) throw new JobDriveRepositoryError("Could not load activity history.");
  const rows = z.array(activityRowSchema).safeParse(data);
  if (!rows.success) {
    throw new JobDriveRepositoryError("Stored activity history is invalid.");
  }

  return rows.data.map((row) => {
    const metadata = normalizeActivityMetadata(row.metadata);
    return activityEventSchema.parse({
      id: row.id,
      eventType: row.event_type,
      source: metadata.source,
      previousStage: metadata.previousStage,
      newStage: metadata.newStage,
      changedFields: metadata.changedFields,
      occurredAt: metadata.occurredAt,
      createdAt: row.created_at,
    });
  });
}

export async function saveJobDrive(
  supabase: SupabaseClient,
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

  if (error) throw new JobDriveRepositoryError("Could not save the Job Drive.");
  return saveJobDriveRpcSchema.parse(data);
}

export async function listJobDriveContext(
  supabase: SupabaseClient,
  userId: string,
) {
  const { data, error } = await supabase
    .from("job_drives")
    .select("id, company_name, role_title, stage, location, source_url, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(20);

  if (error) throw new JobDriveRepositoryError("Could not load Job Drive context.");
  const parsed = z.array(z.object({
    id: z.uuid(),
    company_name: z.string(),
    role_title: z.string(),
    stage: z.string(),
    location: z.string().nullable(),
    source_url: z.string().nullable(),
    updated_at: z.string(),
  })).safeParse(data);

  if (!parsed.success) {
    throw new JobDriveRepositoryError("Job Drive context is invalid.");
  }

  return parsed.data.map((row) => ({
    ref: `job-drive:${row.id}`,
    id: row.id,
    companyName: row.company_name,
    roleTitle: row.role_title,
    stage: row.stage,
    location: row.location,
    sourceUrl: row.source_url,
    updatedAt: row.updated_at,
  }));
}
