import * as z from "zod";

export const DELETE_ACCOUNT_PHRASE = "delete my account";

export const deleteAccountRequestSchema = z
  .object({ confirmation: z.literal(DELETE_ACCOUNT_PHRASE) })
  .strict();

export const deleteAccountResponseSchema = z.object({ outcome: z.literal("deleted") }).strict();
