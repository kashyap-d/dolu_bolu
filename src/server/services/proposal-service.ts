import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  assistantResponseSchema,
  providerResponseSchema,
  type AssistantRequest,
  type AssistantResponse,
} from "@/features/assistant/contracts";
import {
  validateProposalEvidence,
  validateProposalForConfirmation,
} from "@/features/assistant/validate-proposal";
import { getActionProposalProvider } from "@/server/ai/get-provider";
import { listApplicationContext } from "@/server/repositories/application-repository";
import {
  findProposalByClientRequest,
  persistApplicationProposal,
} from "@/server/repositories/proposal-repository";

export class ClientRequestConflictError extends Error {
  constructor() {
    super("A request ID cannot be reused for a different message.");
    this.name = "ClientRequestConflictError";
  }
}

interface PersistenceContext {
  supabase: SupabaseClient;
  userId: string;
}

export async function prepareActionProposals(
  request: AssistantRequest,
  persistence: PersistenceContext | null,
): Promise<AssistantResponse> {
  if (persistence) {
    const existing = await findProposalByClientRequest(
      persistence.supabase,
      persistence.userId,
      request.clientRequestId,
    );

    if (existing) {
      if (existing.batch.source_message !== request.message) {
        throw new ClientRequestConflictError();
      }

      if (existing.status !== "pending") {
        return assistantResponseSchema.parse({
          decision: {
            kind: "unsupported",
            message:
              existing.status === "executed"
                ? "This request has already been confirmed and is in your Applications workspace."
                : "This request is no longer pending. Send a new message to prepare another application.",
          },
          metadata: {
            provider: existing.batch.provider,
            model: existing.batch.model,
            latencyMs: 0,
            isDemo: existing.batch.provider === "demo",
          },
        });
      }

      return assistantResponseSchema.parse({
        decision: {
          kind: "proposals",
          batchId: existing.batch.id,
          proposals: [existing.proposal],
        },
        metadata: {
          provider: existing.batch.provider,
          model: existing.batch.model,
          latencyMs: 0,
          isDemo: existing.batch.provider === "demo",
        },
      });
    }
  }

  const context = persistence
    ? await listApplicationContext(persistence.supabase, persistence.userId)
    : [];
  const provider = getActionProposalProvider();
  const rawProviderResult = await provider.propose({
    message: request.message,
    now: new Date().toISOString(),
    timeZone: request.timeZone,
    locale: request.locale,
    context: { applications: context },
  });
  const providerResult = providerResponseSchema.parse(rawProviderResult);

  if (providerResult.decision.kind !== "proposals") {
    return assistantResponseSchema.parse({
      decision: providerResult.decision,
      metadata: providerResult.metadata,
    });
  }

  const issues = providerResult.decision.proposals.flatMap((proposal) => [
    ...validateProposalEvidence(request.message, proposal),
    ...validateProposalForConfirmation(proposal),
  ]);

  if (issues.length > 0) {
    return assistantResponseSchema.parse({
      decision: {
        kind: "needs_clarification",
        question: issues.map((issue) => issue.message).join(" "),
        missingFields: [...new Set(issues.map((issue) => issue.fieldPath))],
      },
      metadata: providerResult.metadata,
    });
  }

  if (persistence) {
    const applicationProposals = providerResult.decision.proposals.filter(
      (proposal) => proposal.kind === "create_application",
    );

    if (
      applicationProposals.length !== 1 ||
      providerResult.decision.proposals.length !== 1
    ) {
      return assistantResponseSchema.parse({
        decision: {
          kind: "unsupported",
          message:
            "Durable application capture is available now. Interview and task workflows are coming next.",
        },
        metadata: providerResult.metadata,
      });
    }

    const persisted = await persistApplicationProposal(persistence.supabase, {
      clientRequestId: request.clientRequestId,
      sourceMessage: request.message,
      provider: providerResult.metadata.provider,
      model: providerResult.metadata.model,
      proposal: applicationProposals[0],
    });

    return assistantResponseSchema.parse({
      decision: {
        kind: "proposals",
        batchId: persisted.batchId,
        proposals: [persisted.proposal],
      },
      metadata: providerResult.metadata,
    });
  }

  return assistantResponseSchema.parse({
    decision: {
      kind: "proposals",
      batchId: crypto.randomUUID(),
      proposals: providerResult.decision.proposals.map((proposal) => ({
        ...proposal,
        id: crypto.randomUUID(),
        version: 1,
      })),
    },
    metadata: providerResult.metadata,
  });
}
