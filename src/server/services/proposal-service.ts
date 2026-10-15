import "server-only";

import {
  assistantResponseSchema,
  providerResponseSchema,
  type AssistantRequest,
  type AssistantResponse,
} from "@/features/assistant/contracts";
import { selectModelContext } from "@/features/assistant/model-context";
import { redactContactDetails } from "@/features/assistant/redact";
import { resolveProposal } from "@/features/assistant/resolve-proposal";
import { getActionProposalProvider } from "@/server/ai/get-provider";
import { getAiLimits } from "@/server/env";
import { consumeAiRequest } from "@/server/repositories/ai-usage-repository";
import { listJobDrives } from "@/server/repositories/job-drive-repository";
import {
  findProposalByClientRequest,
  persistProposal,
} from "@/server/repositories/proposal-repository";
import type { AppSupabaseClient } from "@/server/supabase/server";

export class AiQuotaExceededError extends Error {
  constructor(
    /** "user": this person's daily allowance; "demo": all demo users' shared allowance. */
    readonly scope: "user" | "demo",
    readonly limit: number | null,
  ) {
    super("The daily assistant limit has been reached.");
    this.name = "AiQuotaExceededError";
  }
}

export class ClientRequestConflictError extends Error {
  constructor() {
    super("A request ID cannot be reused for a different message.");
    this.name = "ClientRequestConflictError";
  }
}

interface PersistenceContext {
  supabase: AppSupabaseClient;
  userId: string;
}

async function replayedResponse(
  persistence: PersistenceContext,
  request: AssistantRequest,
): Promise<AssistantResponse | null> {
  const replay = await findProposalByClientRequest(
    persistence.supabase,
    persistence.userId,
    request.clientRequestId,
  );
  if (!replay) return null;
  if (replay.batch.source_message !== request.message) {
    throw new ClientRequestConflictError();
  }

  const metadata = {
    provider: replay.batch.provider,
    model: replay.batch.model,
    latencyMs: 0,
    isDemo: replay.batch.provider === "demo",
  };
  if (replay.status === "pending") {
    return { decision: { kind: "proposal", proposal: replay.proposal }, metadata };
  }
  return {
    decision: {
      kind: "unsupported",
      message:
        replay.status === "executed"
          ? "This update has already been confirmed and is in your Drives workspace."
          : "This update is no longer pending. Send a new message to prepare another change.",
    },
    metadata,
  };
}

/**
 * message → provider → shared schema → deterministic resolution → pending
 * proposal. Without persistence (the local preview) the same pipeline runs
 * against no stored drives and returns an unsaved proposal.
 */
export async function prepareProposal(
  original: AssistantRequest,
  persistence: PersistenceContext | null,
): Promise<AssistantResponse> {
  // Everything downstream (replay check, provider, evidence, storage) sees the
  // same text, with contact details already removed.
  const request = { ...original, message: redactContactDetails(original.message) };
  if (persistence) {
    const replay = await replayedResponse(persistence, request);
    if (replay) return assistantResponseSchema.parse(replay);
  }

  const drives = persistence
    ? await listJobDrives(persistence.supabase, persistence.userId)
    : [];
  const provider = getActionProposalProvider({ allowHosted: Boolean(persistence) });
  if (persistence && !provider.isDemo) {
    const usage = await consumeAiRequest(persistence.supabase, getAiLimits());
    if (usage.outcome === "limit_reached") throw new AiQuotaExceededError("user", usage.limit);
    if (usage.outcome === "demo_capacity_reached") throw new AiQuotaExceededError("demo", null);
    if (usage.outcome !== "allowed") {
      throw new Error("The AI request allowance could not be reserved.");
    }
  }

  const { decision, metadata } = providerResponseSchema.parse(
    await provider.propose({
      message: request.message,
      now: new Date().toISOString(),
      timeZone: request.timeZone,
      locale: request.locale,
      context: { jobDrives: selectModelContext(request.message, drives) },
    }),
  );
  if (decision.kind !== "proposal") {
    return assistantResponseSchema.parse({ decision, metadata });
  }

  const resolved = resolveProposal(request.message, decision.proposal, drives);
  if (!resolved.ok) {
    return assistantResponseSchema.parse({
      decision: {
        kind: "needs_clarification",
        question: resolved.issues.map((issue) => issue.message).join(" "),
        missingFields: [...new Set(resolved.issues.map((issue) => issue.fieldPath))],
      },
      metadata,
    });
  }

  const proposal = persistence
    ? await persistProposal(persistence.supabase, {
        clientRequestId: request.clientRequestId,
        sourceMessage: request.message,
        provider: metadata.provider,
        model: metadata.model,
        proposal: decision.proposal,
        payload: resolved.payload,
      })
    : {
        ...decision.proposal,
        id: crypto.randomUUID(),
        version: 1,
        payload: resolved.payload,
      };

  return assistantResponseSchema.parse({
    decision: { kind: "proposal", proposal },
    metadata,
  });
}
