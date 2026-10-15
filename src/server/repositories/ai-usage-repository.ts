import "server-only";

import { z } from "zod";

import { RepositoryError } from "@/server/repositories/errors";
import type { AppSupabaseClient } from "@/server/supabase/server";

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
  z.object({ outcome: z.enum(["demo_capacity_reached", "auth_required", "invalid_limit"]) }),
]);

export async function consumeAiRequest(
  supabase: AppSupabaseClient,
  limits: { perUser: number; perDemoUser: number; allDemoUsers: number },
) {
  const { data, error } = await supabase.rpc("consume_ai_request", {
    p_daily_limit: limits.perUser,
    p_demo_daily_limit: limits.perDemoUser,
    p_demo_global_limit: limits.allDemoUsers,
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
