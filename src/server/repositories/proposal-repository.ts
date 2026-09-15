import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  actionProposalSchema,
  type ActionProposal,
  type ActionProposalDraft,
} from "@/features/assistant/contracts";
import {
  applicationRecordSchema,
  type ApplicationConfirmationPayload,
  type ApplicationRecord,
} from "@/features/applications/contracts";

const persistedProposalRowSchema = z.object({
  batch_id: z.uuid(),
  proposal_id: z.uuid(),
  proposal_version: z.number().int().positive(),
  action_ref: z.string(),
  proposal_summary: z.string(),
  proposal_payload: z.unknown(),
  proposal_evidence: z.unknown(),
  proposal_assumptions: z.unknown(),
});

const storedProposalRowSchema = z.object({
  id: z.uuid(),
  batch_id: z.uuid(),
  action_ref: z.string(),
  kind: z.literal("create_application"),
  version: z.number().int().positive(),
  status: z.enum(["pending", "executing", "executed", "rejected", "failed", "expired"]),
  summary: z.string(),
  payload: z.unknown(),
  evidence: z.unknown(),
  assumptions: z.unknown(),
});

const storedBatchSchema = z.object({
  id: z.uuid(),
  source_message: z.string(),
  provider: z.string(),
  model: z.string(),
});

const confirmationRpcSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.enum(["executed", "already_executed"]),
    proposalId: z.uuid(),
    application: applicationRecordSchema,
  }),
  z.object({ outcome: z.enum(["auth_required", "not_found", "conflict", "invalid_payload"]) }),
]);

const rejectionRpcSchema = z.object({
  outcome: z.enum([
    "rejected",
    "already_rejected",
    "auth_required",
    "not_found",
    "conflict",
  ]),
});

export class ProposalRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProposalRepositoryError";
  }
}

function proposalFromPersistedRow(row: z.infer<typeof persistedProposalRowSchema>) {
  return actionProposalSchema.parse({
    id: row.proposal_id,
    version: row.proposal_version,
    ref: row.action_ref,
    kind: "create_application",
    summary: row.proposal_summary,
    payload: row.proposal_payload,
    evidence: row.proposal_evidence,
    assumptions: row.proposal_assumptions,
  });
}

function proposalFromStoredRow(row: z.infer<typeof storedProposalRowSchema>) {
  return actionProposalSchema.parse({
    id: row.id,
    version: row.version,
    ref: row.action_ref,
    kind: row.kind,
    summary: row.summary,
    payload: row.payload,
    evidence: row.evidence,
    assumptions: row.assumptions,
  });
}

export async function findProposalByClientRequest(
  supabase: SupabaseClient,
  userId: string,
  clientRequestId: string,
) {
  const { data: batchData, error: batchError } = await supabase
    .from("proposal_batches")
    .select("id, source_message, provider, model")
    .eq("user_id", userId)
    .eq("client_request_id", clientRequestId)
    .maybeSingle();

  if (batchError) throw new ProposalRepositoryError("Could not read proposal batch.");
  if (!batchData) return null;

  const batch = storedBatchSchema.parse(batchData);
  const { data: proposalData, error: proposalError } = await supabase
    .from("action_proposals")
    .select("id, batch_id, action_ref, kind, version, status, summary, payload, evidence, assumptions")
    .eq("user_id", userId)
    .eq("batch_id", batch.id)
    .eq("kind", "create_application")
    .limit(1)
    .maybeSingle();

  if (proposalError || !proposalData) {
    throw new ProposalRepositoryError("Could not read persisted proposal.");
  }

  const storedProposal = storedProposalRowSchema.parse(proposalData);
  return {
    batch,
    proposal: proposalFromStoredRow(storedProposal),
    status: storedProposal.status,
  };
}

export async function persistApplicationProposal(
  supabase: SupabaseClient,
  input: {
    clientRequestId: string;
    sourceMessage: string;
    provider: string;
    model: string;
    proposal: ActionProposalDraft & { kind: "create_application" };
  },
) {
  const { data, error } = await supabase.rpc("persist_application_proposal", {
    p_client_request_id: input.clientRequestId,
    p_source_message: input.sourceMessage,
    p_provider: input.provider,
    p_model: input.model,
    p_action_ref: input.proposal.ref,
    p_summary: input.proposal.summary,
    p_payload: input.proposal.payload,
    p_evidence: input.proposal.evidence,
    p_assumptions: input.proposal.assumptions,
  });

  if (error) throw new ProposalRepositoryError("Could not persist proposal.");

  const parsed = z.array(persistedProposalRowSchema).length(1).safeParse(data);
  if (!parsed.success) {
    throw new ProposalRepositoryError("Proposal persistence returned invalid data.");
  }

  return {
    batchId: parsed.data[0].batch_id,
    proposal: proposalFromPersistedRow(parsed.data[0]),
  };
}

export async function listPendingApplicationProposals(
  supabase: SupabaseClient,
  userId: string,
): Promise<ActionProposal[]> {
  const { data, error } = await supabase
    .from("action_proposals")
    .select("id, batch_id, action_ref, kind, version, status, summary, payload, evidence, assumptions")
    .eq("user_id", userId)
    .eq("kind", "create_application")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) throw new ProposalRepositoryError("Could not load pending proposals.");

  const parsed = z.array(storedProposalRowSchema).safeParse(data);
  if (!parsed.success) {
    throw new ProposalRepositoryError("Stored proposal data is invalid.");
  }

  return parsed.data.map(proposalFromStoredRow);
}

export async function confirmApplicationProposal(
  supabase: SupabaseClient,
  input: {
    proposalId: string;
    version: number;
    application: ApplicationConfirmationPayload;
  },
): Promise<
  | { outcome: "executed" | "already_executed"; proposalId: string; application: ApplicationRecord }
  | { outcome: "auth_required" | "not_found" | "conflict" | "invalid_payload" }
> {
  const { data, error } = await supabase.rpc("confirm_create_application", {
    p_action_id: input.proposalId,
    p_expected_version: input.version,
    p_payload: input.application,
  });

  if (error) throw new ProposalRepositoryError("Could not confirm proposal.");
  return confirmationRpcSchema.parse(data);
}

export async function rejectApplicationProposal(
  supabase: SupabaseClient,
  input: { proposalId: string; version: number },
) {
  const { data, error } = await supabase.rpc("reject_application_proposal", {
    p_action_id: input.proposalId,
    p_expected_version: input.version,
  });

  if (error) throw new ProposalRepositoryError("Could not reject proposal.");
  return rejectionRpcSchema.parse(data);
}
