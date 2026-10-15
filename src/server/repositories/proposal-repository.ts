import "server-only";

import { z } from "zod";

import {
  actionProposalSchema,
  type ActionProposal,
  type ActionProposalDraft,
  type PersistedJobDriveProgressPayload,
} from "@/features/assistant/contracts";
import {
  confirmJobDriveResponseSchema,
  type JobDriveProgressPayload,
} from "@/features/job-drives/contracts";
import { invalidStoredData, RepositoryError } from "@/server/repositories/errors";
import type { AppSupabaseClient } from "@/server/supabase/server";

const proposalColumns = "id, kind, version, status, summary, payload, evidence, assumptions";

const proposalStatusSchema = z.enum(["pending", "executing", "executed", "rejected", "failed", "expired"]);

/** RPC results are untyped JSON, so their outcomes are validated here. */
const confirmationRpcSchema = z.union([
  confirmJobDriveResponseSchema,
  z.object({ outcome: z.enum(["auth_required", "not_found", "conflict", "invalid_payload"]) }),
]);

const rejectionRpcSchema = z.object({
  outcome: z.enum(["rejected", "already_rejected", "auth_required", "not_found", "conflict"]),
});

/** The JSON columns (payload, evidence, assumptions) are checked against the shared contract. */
function toProposal(row: {
  id: string;
  version: number;
  summary: string;
  payload: unknown;
  evidence: unknown;
  assumptions: unknown;
}): ActionProposal {
  const parsed = actionProposalSchema.safeParse({
    id: row.id,
    version: row.version,
    kind: "record_job_drive_progress",
    summary: row.summary,
    payload: row.payload,
    evidence: row.evidence,
    assumptions: row.assumptions,
  });
  if (!parsed.success) throw invalidStoredData("proposal data", parsed.error);
  return parsed.data;
}

export async function findProposalByClientRequest(
  supabase: AppSupabaseClient,
  userId: string,
  clientRequestId: string,
) {
  const { data: batch, error: batchError } = await supabase
    .from("proposal_batches")
    .select("id, source_message, provider, model")
    .eq("user_id", userId)
    .eq("client_request_id", clientRequestId)
    .maybeSingle();
  if (batchError) throw new RepositoryError("Could not read the proposal batch.");
  if (!batch) return null;

  const { data, error } = await supabase
    .from("action_proposals")
    .select(proposalColumns)
    .eq("user_id", userId)
    .eq("batch_id", batch.id)
    .eq("kind", "record_job_drive_progress")
    .limit(1)
    .maybeSingle();
  if (error || !data) throw new RepositoryError("Could not read the persisted proposal.");

  const status = proposalStatusSchema.safeParse(data.status);
  if (!status.success) throw new RepositoryError("Stored proposal status is invalid.");
  return { batch, proposal: toProposal(data), status: status.data };
}

export async function persistProposal(
  supabase: AppSupabaseClient,
  input: {
    clientRequestId: string;
    sourceMessage: string;
    provider: string;
    model: string;
    proposal: ActionProposalDraft;
    payload: PersistedJobDriveProgressPayload;
  },
) {
  const { data, error } = await supabase.rpc("persist_job_drive_proposal", {
    p_client_request_id: input.clientRequestId,
    p_source_message: input.sourceMessage,
    p_provider: input.provider,
    p_model: input.model,
    // One proposal per message (docs/decisions/0008); the column remains for idempotency keys.
    p_action_ref: "draft:1",
    p_summary: input.proposal.summary,
    p_payload: input.payload,
    p_evidence: input.proposal.evidence,
    p_assumptions: input.proposal.assumptions,
  });
  if (error) throw new RepositoryError("Could not persist the proposal.");
  const [row] = data;
  if (!row || data.length !== 1) throw new RepositoryError("Proposal persistence returned invalid data.");

  return toProposal({
    id: row.proposal_id,
    version: row.proposal_version,
    summary: row.proposal_summary,
    payload: row.proposal_payload,
    evidence: row.proposal_evidence,
    assumptions: row.proposal_assumptions,
  });
}

export async function listPendingProposals(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<ActionProposal[]> {
  const { data, error } = await supabase
    .from("action_proposals")
    .select(proposalColumns)
    .eq("user_id", userId)
    .eq("kind", "record_job_drive_progress")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) throw new RepositoryError("Could not load pending proposals.");
  return data.map(toProposal);
}

export async function confirmProposal(
  supabase: AppSupabaseClient,
  input: {
    proposalId: string;
    version: number;
    drive: JobDriveProgressPayload;
    allowPossibleDuplicate: boolean;
  },
) {
  const { data, error } = await supabase.rpc("confirm_job_drive_progress", {
    p_action_id: input.proposalId,
    p_expected_version: input.version,
    p_payload: input.drive,
    p_allow_possible_duplicate: input.allowPossibleDuplicate,
  });
  if (error) throw new RepositoryError("Could not confirm the proposal.");
  const parsed = confirmationRpcSchema.safeParse(data);
  if (!parsed.success) throw new RepositoryError("Confirmation returned an unexpected result.");
  return parsed.data;
}

export async function rejectProposal(
  supabase: AppSupabaseClient,
  input: { proposalId: string; version: number },
) {
  const { data, error } = await supabase.rpc("reject_job_drive_proposal", {
    p_action_id: input.proposalId,
    p_expected_version: input.version,
  });
  if (error) throw new RepositoryError("Could not reject the proposal.");
  const parsed = rejectionRpcSchema.safeParse(data);
  if (!parsed.success) throw new RepositoryError("Rejection returned an unexpected result.");
  return parsed.data;
}
