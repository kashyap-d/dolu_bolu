import { z } from "zod";

const storedActivityMetadataSchema = z
  .object({
    source: z.enum(["manual", "assistant", "migration"]).default("migration"),
    previousStage: z.string().nullable().default(null),
    newStage: z.string().nullable().default(null),
    changedFields: z.array(z.string()).default([]),
    occurredAt: z.string().nullable().default(null),
  })
  .passthrough();

export function normalizeActivityMetadata(metadata: unknown) {
  return storedActivityMetadataSchema.parse(metadata);
}
