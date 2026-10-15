import { z } from "zod";

import { interviewRoundFields, jobDriveProgressPayloadSchema } from "@/features/job-drives/contracts";

/** Long enough for a pasted email or invite (docs/decisions/0020). */
export const MAX_MESSAGE_LENGTH = 8_000;

export const evidenceSchema = z
  .object({
    fieldPath: z.string().min(1).max(80),
    quote: z
      .string()
      .min(1)
      .max(240)
      .describe("An exact, case-sensitive substring copied from the source message."),
  })
  .strict();

const proposalContentShape = {
  kind: z.literal("record_job_drive_progress"),
  summary: z.string().min(1).max(180).describe("A concise description of the change, under 180 characters."),
  evidence: z
    .array(evidenceSchema)
    .max(8)
    .describe("Quote the message for every company, role, stage, or date the proposal sets."),
  assumptions: z.array(z.string().min(1).max(180)).max(8),
};

/**
 * What a provider may propose. It can reference a drive only by an opaque
 * context ref. Identity fields come first on purpose: models with structured
 * output fill fields in schema order, and deciding *which* drive comes before
 * deciding what changed.
 */
export const providerJobDrivePayloadSchema = z
  .object({
    jobDriveRef: z
      .string()
      .regex(/^job-drive:[0-9a-f-]{36}$/)
      .nullable()
      .describe("The exact ref of a drive from the supplied context, or null for a new drive."),
    isCorrection: z.boolean(),
    companyName: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .nullable()
      .describe("As written in the message. Null only when jobDriveRef is set; otherwise ask instead."),
    roleTitle: z
      .string()
      .trim()
      .min(1)
      .max(160)
      .nullable()
      .describe("As written in the message. Null only when jobDriveRef is set; otherwise ask instead."),
    ...jobDriveProgressPayloadSchema.omit({ companyName: true, roleTitle: true, interviewRounds: true }).shape,
    interviewRound: z
      .object(interviewRoundFields)
      .strict()
      .nullable()
      .describe(
        "The one interview round this message is about, or null. Trusted code merges it into the drive's existing rounds.",
      ),
  })
  .strict();

/** What trusted code stores after resolving the target drive and merging details. */
export const persistedJobDriveProgressPayloadSchema =
  jobDriveProgressPayloadSchema
    .extend({
      jobDriveId: z.uuid().nullable(),
      expectedUpdatedAt: z.iso.datetime({ offset: true }).nullable(),
      isCorrection: z.boolean(),
    })
    .strict();

export const actionProposalDraftSchema = z
  .object({
    ...proposalContentShape,
    payload: providerJobDrivePayloadSchema,
  })
  .strict();

export const actionProposalSchema = z
  .object({
    id: z.uuid(),
    version: z.number().int().positive(),
    ...proposalContentShape,
    payload: persistedJobDriveProgressPayloadSchema,
  })
  .strict();

const clarificationDecisionSchema = z
  .object({
    kind: z.literal("needs_clarification"),
    question: z.string().min(1).max(240).describe("One direct question, under 240 characters."),
    missingFields: z.array(z.string().min(1).max(80)).min(1).max(8),
  })
  .strict();

const unsupportedDecisionSchema = z
  .object({
    kind: z.literal("unsupported"),
    message: z.string().min(1).max(240).describe("A concise explanation, under 240 characters."),
  })
  .strict();

/** One message produces at most one proposal (see docs/decisions/0008). */
export const providerDecisionSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("proposal"), proposal: actionProposalDraftSchema })
    .strict(),
  clarificationDecisionSchema,
  unsupportedDecisionSchema,
]);

const assistantDecisionSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("proposal"), proposal: actionProposalSchema })
    .strict(),
  clarificationDecisionSchema,
  unsupportedDecisionSchema,
]);

const providerMetadataSchema = z
  .object({
    provider: z.string().min(1).max(40),
    model: z.string().min(1).max(100),
    latencyMs: z.number().int().nonnegative(),
    isDemo: z.boolean(),
  })
  .strict();

const timeZoneSchema = z
  .string()
  .min(1)
  .max(80)
  .refine(
    (timeZone) => {
      try {
        Intl.DateTimeFormat(undefined, { timeZone });
        return true;
      } catch {
        return false;
      }
    },
    { message: "Must be a valid IANA time zone" },
  );

export const assistantRequestSchema = z
  .object({
    message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
    timeZone: timeZoneSchema,
    locale: z.string().min(2).max(35).default("en-IN"),
    clientRequestId: z.uuid(),
  })
  .strict();

export const providerResponseSchema = z
  .object({
    decision: providerDecisionSchema,
    metadata: providerMetadataSchema,
  })
  .strict();

export const assistantResponseSchema = z
  .object({
    decision: assistantDecisionSchema,
    metadata: providerMetadataSchema,
  })
  .strict();

export const rejectProposalRequestSchema = z
  .object({ version: z.number().int().positive() })
  .strict();

export const rejectProposalResponseSchema = z
  .object({ outcome: z.enum(["rejected", "already_rejected"]) })
  .strict();

export type ActionProposalDraft = z.infer<typeof actionProposalDraftSchema>;
export type ActionProposal = z.infer<typeof actionProposalSchema>;
export type ProviderDecision = z.infer<typeof providerDecisionSchema>;
export type AssistantRequest = z.infer<typeof assistantRequestSchema>;
export type AssistantRequestInput = z.input<typeof assistantRequestSchema>;
export type AssistantResponse = z.infer<typeof assistantResponseSchema>;
export type PersistedJobDriveProgressPayload = z.infer<
  typeof persistedJobDriveProgressPayloadSchema
>;
