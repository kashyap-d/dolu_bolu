import { rejectProposalRequestSchema } from "@/features/assistant/contracts";
import { authenticatedJsonRoute, jsonError, parseId, unauthenticated } from "@/server/http";
import { rejectProposal } from "@/server/repositories/proposal-repository";

export const POST = authenticatedJsonRoute(
  {
    schema: rejectProposalRequestSchema,
    invalidMessage: "Invalid proposal version.",
    unavailableMessage: "The proposal could not be discarded.",
  },
  async ({ auth, body }, context: { params: Promise<{ proposalId: string }> }) => {
    const proposalId = parseId((await context.params).proposalId);
    if (!proposalId) return jsonError(404, "Proposal not found.");

    const result = await rejectProposal(auth.supabase, {
      proposalId,
      version: body.version,
    });

    switch (result.outcome) {
      case "rejected":
      case "already_rejected":
        return Response.json({ outcome: result.outcome });
      case "auth_required":
        return unauthenticated();
      case "not_found":
        return jsonError(404, "Proposal not found.");
      case "conflict":
        return jsonError(409, "This proposal has changed or is no longer pending.", {
          recovery: "Refresh to load the latest proposal.",
        });
    }
  },
);
