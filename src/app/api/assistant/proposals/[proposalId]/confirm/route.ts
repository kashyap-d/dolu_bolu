import {
  confirmJobDriveRequestSchema,
  confirmJobDriveResponseSchema,
} from "@/features/job-drives/contracts";
import { authenticatedJsonRoute, jsonError, parseId, unauthenticated } from "@/server/http";
import { confirmProposal } from "@/server/repositories/proposal-repository";

export const POST = authenticatedJsonRoute(
  {
    schema: confirmJobDriveRequestSchema,
    invalidMessage: "Please correct the Job Drive fields.",
    unavailableMessage: "Confirmation is temporarily unavailable.",
  },
  async ({ auth, body }, context: { params: Promise<{ proposalId: string }> }) => {
    const proposalId = parseId((await context.params).proposalId);
    if (!proposalId) return jsonError(404, "Proposal not found.");

    const result = await confirmProposal(auth.supabase, {
      proposalId,
      version: body.version,
      drive: body.drive,
      allowPossibleDuplicate: body.allowPossibleDuplicate,
    });

    switch (result.outcome) {
      case "executed":
      case "already_executed":
        return Response.json(confirmJobDriveResponseSchema.parse(result));
      case "possible_duplicate":
        return Response.json(result, { status: 409 });
      case "auth_required":
        return unauthenticated();
      case "not_found":
        return jsonError(404, "Proposal not found.");
      case "conflict":
        return jsonError(409, "This proposal has changed or is no longer pending.", {
          recovery: "Refresh to load the latest proposal.",
        });
      case "invalid_payload":
        return jsonError(422, "The Job Drive payload could not be confirmed safely.");
    }
  },
);
