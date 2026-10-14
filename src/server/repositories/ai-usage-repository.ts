import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { RepositoryError } from "@/server/repositories/errors";

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

export async function consumeAiRequest(
  supabase: SupabaseClient,
  dailyLimit: number,
) {
  const { data, error } = await supabase.rpc("consume_ai_request", {
    p_daily_limit: dailyLimit,
  });
  if (error) {
    throw new RepositoryError("Could not reserve an AI request.");
  }
  const parsed = consumeResultSchema.safeParse(data);
  if (!parsed.success) {
    throw new RepositoryError("AI usage returned invalid data.");
  }
  return parsed.data;
}
