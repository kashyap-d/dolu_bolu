import { z } from "zod";

const nullableText = (max: number) => z.string().trim().min(1).max(max).nullable();
const httpUrl = z.url().max(2_048).refine(
  (value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  },
  { message: "Only HTTP and HTTPS URLs are supported." },
);
const nullableHttpUrl = httpUrl.nullable();
const nullableIsoDateTime = z.iso.datetime({ offset: true }).nullable();

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

const persistedProposalShape = {
  id: z.uuid(),
  version: z.number().int().positive(),
};

export const applicationProposalPayloadSchema = z
  .object({
    companyName: nullableText(120),
    roleTitle: nullableText(160),
    status: z.enum(["saved", "applied"]),
    appliedAt: nullableIsoDateTime,
    sourceUrl: nullableHttpUrl,
    notes: nullableText(2_000),
  })
  .strict();

export const interviewProposalPayloadSchema = z
  .object({
    companyName: nullableText(120),
    roleTitle: nullableText(160),
    stage: z.enum(["recruiter", "technical", "manager", "onsite", "other"]),
    startsAt: nullableIsoDateTime,
    timeZone: z.string().min(1).max(80),
    mode: z.enum(["virtual", "phone", "onsite", "unknown"]),
    location: nullableText(240),
    meetingUrl: nullableHttpUrl,
    notes: nullableText(2_000),
  })
  .strict();

export const taskProposalPayloadSchema = z
  .object({
    title: nullableText(180),
    dueAt: nullableIsoDateTime,
    priority: z.enum(["low", "medium", "high"]),
    reminderRequested: z.boolean(),
    notes: nullableText(2_000),
  })
  .strict();

export const createApplicationProposalDraftSchema = z
  .object({
    ...proposalContentShape,
    kind: z.literal("create_application"),
    payload: applicationProposalPayloadSchema,
  })
  .strict();

export const createInterviewProposalDraftSchema = z
  .object({
    ...proposalContentShape,
    kind: z.literal("create_interview"),
    payload: interviewProposalPayloadSchema,
  })
  .strict();

export const createTaskProposalDraftSchema = z
  .object({
    ...proposalContentShape,
    kind: z.literal("create_task"),
    payload: taskProposalPayloadSchema,
  })
  .strict();

export const actionProposalDraftSchema = z.discriminatedUnion("kind", [
  createApplicationProposalDraftSchema,
  createInterviewProposalDraftSchema,
  createTaskProposalDraftSchema,
]);

export const createApplicationProposalSchema = z
  .object({
    ...persistedProposalShape,
    ...proposalContentShape,
    kind: z.literal("create_application"),
    payload: applicationProposalPayloadSchema,
  })
  .strict();

export const createInterviewProposalSchema = z
  .object({
    ...persistedProposalShape,
    ...proposalContentShape,
    kind: z.literal("create_interview"),
    payload: interviewProposalPayloadSchema,
  })
  .strict();

export const createTaskProposalSchema = z
  .object({
    ...persistedProposalShape,
    ...proposalContentShape,
    kind: z.literal("create_task"),
    payload: taskProposalPayloadSchema,
  })
  .strict();

export const actionProposalSchema = z.discriminatedUnion("kind", [
  createApplicationProposalSchema,
  createInterviewProposalSchema,
  createTaskProposalSchema,
]);

export const providerDecisionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("proposals"),
    proposals: z.array(actionProposalDraftSchema).min(1).max(5),
  }).strict(),
  z.object({
    kind: z.literal("needs_clarification"),
    question: z.string().min(1).max(240),
    missingFields: z.array(z.string().min(1).max(80)).min(1).max(8),
  }).strict(),
  z.object({
    kind: z.literal("unsupported"),
    message: z.string().min(1).max(240),
  }).strict(),
]);

const proposalDecisionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("proposals"),
    batchId: z.uuid(),
    proposals: z.array(actionProposalSchema).min(1).max(5),
  }).strict(),
  z.object({
    kind: z.literal("needs_clarification"),
    question: z.string().min(1).max(240),
    missingFields: z.array(z.string().min(1).max(80)).min(1).max(8),
  }).strict(),
  z.object({
    kind: z.literal("unsupported"),
    message: z.string().min(1).max(240),
  }).strict(),
]);

const providerMetadataSchema = z.object({
  provider: z.string().min(1).max(40),
  model: z.string().min(1).max(100),
  latencyMs: z.number().int().nonnegative(),
  isDemo: z.boolean(),
}).strict();

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

export const providerResponseSchema = z.object({
  decision: providerDecisionSchema,
  metadata: providerMetadataSchema,
}).strict();

export const assistantResponseSchema = z.object({
  decision: proposalDecisionSchema,
  metadata: providerMetadataSchema,
}).strict();

export type ActionProposalDraft = z.infer<typeof actionProposalDraftSchema>;
export type ActionProposal = z.infer<typeof actionProposalSchema>;
export type ProviderDecision = z.infer<typeof providerDecisionSchema>;
export type ProposalDecision = z.infer<typeof proposalDecisionSchema>;
export type AssistantRequest = z.infer<typeof assistantRequestSchema>;
export type ProviderResponse = z.infer<typeof providerResponseSchema>;
export type AssistantResponse = z.infer<typeof assistantResponseSchema>;
