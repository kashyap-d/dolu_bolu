import "server-only";

import { RepositoryError } from "@/server/repositories/errors";
import type { AppSupabaseClient } from "@/server/supabase/server";

/** Every table that holds a user's data, exported in full (docs/decisions/0013). */
const exportedTables = [
  "job_drives",
  "job_drive_assessments",
  "interviews",
  "tasks",
  "proposal_batches",
  "action_proposals",
  "activity_events",
  "ai_usage_daily",
] as const;

export async function exportAccountData(supabase: AppSupabaseClient, userId: string) {
  const [profile, ...tables] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    ...exportedTables.map((table) => supabase.from(table).select("*").eq("user_id", userId)),
  ]);
  if (profile.error || tables.some((result) => result.error)) {
    throw new RepositoryError("Could not read account data for export.");
  }

  return {
    format: "dolu-bolu-export/1",
    exportedAt: new Date().toISOString(),
    profile: profile.data,
    ...Object.fromEntries(exportedTables.map((table, index) => [table, tables[index]!.data])),
  };
}

export async function deleteAccount(supabase: AppSupabaseClient, confirmation: string) {
  const { data, error } = await supabase.rpc("delete_my_account", { p_confirmation: confirmation });
  if (error) throw new RepositoryError("Could not delete the account.");
  const outcome = (data as { outcome?: unknown } | null)?.outcome;
  if (outcome !== "deleted" && outcome !== "confirmation_required" && outcome !== "auth_required") {
    throw new RepositoryError("Account deletion returned an unexpected result.");
  }
  return outcome;
}
