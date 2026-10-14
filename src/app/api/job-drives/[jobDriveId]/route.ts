import {
  saveJobDriveResponseSchema,
  updateJobDriveRequestSchema,
} from "@/features/job-drives/contracts";
import { authenticatedJsonRoute, jsonError, parseId, unauthenticated } from "@/server/http";
import { saveJobDrive } from "@/server/repositories/job-drive-repository";

export const PATCH = authenticatedJsonRoute(
  {
    schema: updateJobDriveRequestSchema,
    invalidMessage: "Please correct the Job Drive fields.",
    unavailableMessage: "The Job Drive could not be updated.",
  },
  async ({ auth, body }, context: { params: Promise<{ jobDriveId: string }> }) => {
    const jobDriveId = parseId((await context.params).jobDriveId);
    if (!jobDriveId) return jsonError(404, "Job Drive not found.");

    const result = await saveJobDrive(auth.supabase, {
      jobDriveId,
      expectedUpdatedAt: body.expectedUpdatedAt,
      drive: body.drive,
      // Duplicate warnings only apply when creating a drive.
      allowPossibleDuplicate: true,
      isCorrection: body.isCorrection,
    });

    switch (result.outcome) {
      case "created":
      case "already_created":
      case "updated":
        return Response.json(saveJobDriveResponseSchema.parse(result));
      case "possible_duplicate":
        return Response.json(result, { status: 409 });
      case "auth_required":
        return unauthenticated();
      case "not_found":
        return jsonError(404, "Job Drive not found.");
      case "correction_required":
        return jsonError(
          409,
          "Moving backwards or reopening a closed drive must be confirmed as a correction.",
          { correctionRequired: true },
        );
      case "conflict":
        return jsonError(409, "This Job Drive changed in another session.", {
          recovery: "Refresh to load the latest values.",
        });
      case "invalid_payload":
        return jsonError(422, "The Job Drive could not be updated safely.");
    }
  },
);
