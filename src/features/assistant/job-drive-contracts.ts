import { z } from "zod";

import { jobDriveProgressPayloadSchema } from "@/features/job-drives/contracts";

export const evidenceSchema = z
  .object({
    fieldPath: z.string().min(1).max(80),
    quote: z.string().min(1).max(240),
  })
  .strict();

const proposalContentShape = {
  ref: z.string().regex(/^draft:[1-5]$/),
  summary: z.string().min(1).max(180),
  evidence: z.array(evidenceSchema).max(8),
  assumptions: z.array(z.string().min(1).max(180)).max(8),
};

export const providerJobDrivePayloadSchema = jobDriveProgressPayloadSchema
  .omit({ companyName: true, roleTitle: true })
  .extend({
    jobDriveRef: z.string().regex(/^job-drive:[0-9a-f-]{36}$/).nullable(),
    isCorrection: z.boolean(),
    companyName: z.string().trim().min(1).max(120).nullable(),
    roleTitle: z.string().trim().min(1).max(160).nullable(),
  })
  .strict();

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
    kind: z.literal("record_job_drive_progress"),
    payload: providerJobDrivePayloadSchema,
  })
  .strict();

export const actionProposalSchema = z
  .object({
    id: z.uuid(),
    version: z.number().int().positive(),
    ...proposalContentShape,
    kind: z.literal("record_job_drive_progress"),
    payload: persistedJobDriveProgressPayloadSchema,
  })
  .strict();

export const providerDecisionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("proposals"),
      proposals: z.array(actionProposalDraftSchema).min(1).max(5),
    })
    .strict(),
  z
    .object({
      kind: z.literal("needs_clarification"),
      question: z.string().min(1).max(240),
      missingFields: z.array(z.string().min(1).max(80)).min(1).max(8),
    })
    .strict(),
  z
    .object({
      kind: z.literal("unsupported"),
      message: z.string().min(1).max(240),
    })
    .strict(),
]);

const proposalDecisionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("proposals"),
      batchId: z.uuid(),
      proposals: z.array(actionProposalSchema).min(1).max(5),
    })
    .strict(),
  z
    .object({
      kind: z.literal("needs_clarification"),
      question: z.string().min(1).max(240),
      missingFields: z.array(z.string().min(1).max(80)).min(1).max(8),
    })
    .strict(),
  z
    .object({
      kind: z.literal("unsupported"),
      message: z.string().min(1).max(240),
    })
    .strict(),
]);

const providerMetadataSchema = z
  .object({
    provider: z.string().min(1).max(40),
    model: z.string().min(1).max(100),
    latencyMs: z.number().int().nonnegative(),
    isDemo: z.boolean(),
  })
  .strict();

export const assistantRequestSchema = z
  .object({
    message: z.string().trim().min(1).max(2_000),
    timeZone: z.string().min(1).max(80),
    locale: z.string().min(2).max(35).default("en-IN"),
    clientRequestId: z.uuid(),
  })
  .strict()
  .refine(
    ({ timeZone }) => {
      try {
        Intl.DateTimeFormat(undefined, { timeZone });
        return true;
      } catch {
        return false;
      }
    },
    { path: ["timeZone"], message: "Must be a valid IANA time zone" },
  );

export const providerResponseSchema = z
  .object({
    decision: providerDecisionSchema,
    metadata: providerMetadataSchema,
  })
  .strict();

export const assistantResponseSchema = z
  .object({
    decision: proposalDecisionSchema,
    metadata: providerMetadataSchema,
  })
  .strict();

export type ActionProposalDraft = z.infer<typeof actionProposalDraftSchema>;
export type ActionProposal = z.infer<typeof actionProposalSchema>;
export type ProviderDecision = z.infer<typeof providerDecisionSchema>;
export type AssistantRequest = z.infer<typeof assistantRequestSchema>;
export type AssistantResponse = z.infer<typeof assistantResponseSchema>;
