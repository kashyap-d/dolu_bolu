import { z } from "zod";

const httpUrl = z.url().max(2_048).refine(
  (value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  },
  { message: "Use an HTTP or HTTPS URL." },
);

export const applicationStatusSchema = z.enum([
  "saved",
  "applied",
  "screening",
  "interviewing",
  "offer",
  "accepted",
  "rejected",
  "withdrawn",
]);

export const applicationRecordSchema = z.object({
  id: z.uuid(),
  companyName: z.string().min(1).max(120),
  roleTitle: z.string().min(1).max(160),
  status: applicationStatusSchema,
  appliedAt: z.iso.datetime({ offset: true }).nullable(),
  sourceUrl: httpUrl.nullable(),
  notes: z.string().max(2_000).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
}).strict();

const editableApplicationShape = {
  companyName: z.string().trim().min(1, "Company is required.").max(120),
  roleTitle: z.string().trim().min(1, "Role is required.").max(160),
  appliedAt: z.iso.datetime({ offset: true }).nullable(),
  sourceUrl: httpUrl.nullable(),
  notes: z.string().trim().max(2_000).nullable(),
};

function validateApplicationDate(
  payload: { status: z.infer<typeof applicationStatusSchema>; appliedAt: string | null },
  context: z.RefinementCtx,
) {
  if (payload.status !== "saved" && !payload.appliedAt) {
    context.addIssue({
      code: "custom",
      path: ["appliedAt"],
      message: "This status needs an application date and time.",
    });
  }

  if (payload.status === "saved" && payload.appliedAt) {
    context.addIssue({
      code: "custom",
      path: ["appliedAt"],
      message: "Saved applications cannot have an applied date.",
    });
  }
}

export const applicationConfirmationPayloadSchema = z
  .object({
    ...editableApplicationShape,
    status: z.enum(["saved", "applied"]),
  })
  .strict()
  .superRefine(validateApplicationDate);

export const applicationUpdatePayloadSchema = z
  .object({
    ...editableApplicationShape,
    status: applicationStatusSchema,
  })
  .strict()
  .superRefine(validateApplicationDate);

export const confirmApplicationRequestSchema = z.object({
  version: z.number().int().positive(),
  application: applicationConfirmationPayloadSchema,
}).strict();

export const confirmApplicationResponseSchema = z.object({
  outcome: z.enum(["executed", "already_executed"]),
  proposalId: z.uuid(),
  application: applicationRecordSchema,
}).strict();

export const createManualApplicationRequestSchema = z
  .object({
    applicationId: z.uuid(),
    application: applicationConfirmationPayloadSchema,
  })
  .strict();

export const createManualApplicationResponseSchema = z
  .object({
    outcome: z.enum(["created", "already_created"]),
    application: applicationRecordSchema,
  })
  .strict();

export const updateApplicationRequestSchema = z
  .object({
    expectedUpdatedAt: z.iso.datetime({ offset: true }),
    application: applicationUpdatePayloadSchema,
  })
  .strict();

export const updateApplicationResponseSchema = z
  .object({
    outcome: z.literal("updated"),
    application: applicationRecordSchema,
  })
  .strict();

export type ApplicationRecord = z.infer<typeof applicationRecordSchema>;
export type ApplicationConfirmationPayload = z.infer<
  typeof applicationConfirmationPayloadSchema
>;
export type ApplicationUpdatePayload = z.infer<
  typeof applicationUpdatePayloadSchema
>;
export type ApplicationEditorPayload = ApplicationUpdatePayload;
export type ConfirmApplicationResponse = z.infer<
  typeof confirmApplicationResponseSchema
>;
export type CreateManualApplicationResponse = z.infer<
  typeof createManualApplicationResponseSchema
>;
export type UpdateApplicationResponse = z.infer<
  typeof updateApplicationResponseSchema
>;
