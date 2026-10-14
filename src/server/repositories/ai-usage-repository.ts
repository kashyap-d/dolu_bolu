import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const consumeResultSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("allowed"),
    used: z.number().int().positive(),
    limit: z.number().int().positive(),
  }),
  z.object({
    outcome: z.literal("limit_reached"),
    limit: z.number().int().positive(),
  }),
  z.object({ outcome: z.enum(["auth_required", "invalid_limit"]) }),
]);

export class AiUsageRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiUsageRepositoryError";
  }
}

export async function consumeAiRequest(
  supabase: SupabaseClient,
  dailyLimit: number,
) {
  const { data, error } = await supabase.rpc("consume_ai_request", {
    p_daily_limit: dailyLimit,
  });
  if (error) {
    throw new AiUsageRepositoryError("Could not reserve an AI request.");
  }
  const parsed = consumeResultSchema.safeParse(data);
  if (!parsed.success) {
    throw new AiUsageRepositoryError("AI usage returned invalid data.");
  }
  return parsed.data;
}
