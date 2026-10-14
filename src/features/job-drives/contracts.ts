import { z } from "zod";

const httpUrl = z.url().max(2_048).refine(
  (value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  },
  { message: "Use an HTTP or HTTPS URL." },
);

const nullableText = (max: number) =>
  z.string().trim().min(1).max(max).nullable();
const nullableDateTime = z.iso.datetime({ offset: true }).nullable();
const nullableTimeZone = nullableText(80).superRefine((value, context) => {
  if (!value) return;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
  } catch {
    context.addIssue({ code: "custom", message: "Use a valid IANA timezone." });
  }
});

export const jobDriveStageSchema = z.enum([
  "planned",
  "applied",
  "assessment",
  "interview",
  "offer",
  "accepted",
  "rejected",
  "withdrawn",
]);

export const assessmentStatusSchema = z.enum([
  "invited",
  "scheduled",
  "completed",
  "passed",
  "failed",
  "cancelled",
]);

export const assessmentDetailsSchema = z
  .object({
    status: assessmentStatusSchema,
    availableFrom: nullableDateTime,
    dueAt: nullableDateTime,
    durationMinutes: z.number().int().min(1).max(1_440).nullable(),
    assessmentUrl: httpUrl.nullable(),
    notes: nullableText(2_000),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.availableFrom &&
      value.dueAt &&
      new Date(value.dueAt).getTime() < new Date(value.availableFrom).getTime()
    ) {
      context.addIssue({
        code: "custom",
        path: ["dueAt"],
        message: "The assessment deadline must be after its availability time.",
      });
    }
  });

export const interviewModeSchema = z.enum([
  "virtual",
  "phone",
  "onsite",
  "unknown",
]);

export const interviewSummarySchema = z
  .object({
    nextScheduledAt: nullableDateTime,
    timeZone: nullableTimeZone,
    mode: interviewModeSchema,
    location: nullableText(240),
    meetingUrl: httpUrl.nullable(),
    roundSummary: nullableText(1_000),
    notes: nullableText(2_000),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.nextScheduledAt && !value.timeZone) {
      context.addIssue({
        code: "custom",
        path: ["timeZone"],
        message: "A scheduled interview needs a timezone.",
      });
    }
  });

export const jobDriveProgressPayloadSchema = z
  .object({
    companyName: z.string().trim().min(1, "Company is required.").max(120),
    roleTitle: z.string().trim().min(1, "Role is required.").max(160),
    stage: jobDriveStageSchema,
    stageOccurredAt: nullableDateTime,
    appliedAt: nullableDateTime,
    applyBy: nullableDateTime,
    location: nullableText(240),
    sourceUrl: httpUrl.nullable(),
    notes: nullableText(2_000),
    assessment: assessmentDetailsSchema.nullable(),
    interview: interviewSummarySchema.nullable(),
  })
  .strict();

export const assessmentRecordSchema = assessmentDetailsSchema.extend({
  updatedAt: z.iso.datetime({ offset: true }),
});

export const interviewSummaryRecordSchema = interviewSummarySchema.extend({
  updatedAt: z.iso.datetime({ offset: true }),
});

export const jobDriveSchema = jobDriveProgressPayloadSchema.extend({
  id: z.uuid(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  assessment: assessmentRecordSchema.nullable(),
  interview: interviewSummaryRecordSchema.nullable(),
});

export const activityEventSchema = z
  .object({
    id: z.uuid(),
    eventType: z.string().min(1).max(120),
    source: z.enum(["manual", "assistant", "migration"]),
    previousStage: jobDriveStageSchema.nullable(),
    // Activity created before the Job Drive migration did not record stages.
    // Keep those immutable rows readable instead of manufacturing history.
    newStage: jobDriveStageSchema.nullable(),
    changedFields: z.array(z.string().min(1).max(80)).max(32),
    occurredAt: nullableDateTime,
    createdAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const createJobDriveRequestSchema = z
  .object({
    jobDriveId: z.uuid(),
    allowPossibleDuplicate: z.boolean().default(false),
    drive: jobDriveProgressPayloadSchema,
  })
  .strict();

export const updateJobDriveRequestSchema = z
  .object({
    expectedUpdatedAt: z.iso.datetime({ offset: true }),
    isCorrection: z.boolean().default(false),
    drive: jobDriveProgressPayloadSchema,
  })
  .strict();

export const duplicateCandidateSchema = jobDriveSchema.pick({
  id: true,
  companyName: true,
  roleTitle: true,
  stage: true,
  location: true,
  sourceUrl: true,
  updatedAt: true,
});

export const saveJobDriveResponseSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.enum(["created", "already_created", "updated"]),
    jobDrive: jobDriveSchema,
  }),
  z.object({
    outcome: z.literal("possible_duplicate"),
    candidates: z.array(duplicateCandidateSchema).min(1).max(5),
  }),
]);

export const confirmJobDriveRequestSchema = z
  .object({
    version: z.number().int().positive(),
    allowPossibleDuplicate: z.boolean().default(false),
    drive: jobDriveProgressPayloadSchema,
  })
  .strict();

export const confirmJobDriveResponseSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.enum(["executed", "already_executed"]),
    proposalId: z.uuid(),
    jobDrive: jobDriveSchema,
  }),
  z.object({
    outcome: z.literal("possible_duplicate"),
    candidates: z.array(duplicateCandidateSchema).min(1).max(5),
  }),
]);

export type JobDriveStage = z.infer<typeof jobDriveStageSchema>;
export type AssessmentDetails = z.infer<typeof assessmentDetailsSchema>;
export type InterviewSummary = z.infer<typeof interviewSummarySchema>;
export type JobDriveProgressPayload = z.infer<
  typeof jobDriveProgressPayloadSchema
>;
export type JobDrive = z.infer<typeof jobDriveSchema>;
export type ActivityEvent = z.infer<typeof activityEventSchema>;
export type SaveJobDriveResponse = z.infer<typeof saveJobDriveResponseSchema>;
export type ConfirmJobDriveResponse = z.infer<
  typeof confirmJobDriveResponseSchema
>;
