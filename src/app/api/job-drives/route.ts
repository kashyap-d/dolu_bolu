import {
  createJobDriveRequestSchema,
  saveJobDriveResponseSchema,
} from "@/features/job-drives/contracts";
import { authenticatedJsonRoute, jsonError, unauthenticated } from "@/server/http";
import { saveJobDrive } from "@/server/repositories/job-drive-repository";

export const POST = authenticatedJsonRoute(
  {
    schema: createJobDriveRequestSchema,
    invalidMessage: "Please correct the Job Drive fields.",
    unavailableMessage: "The Job Drive could not be created.",
  },
  async ({ auth, body }) => {
    const result = await saveJobDrive(auth.supabase, {
      jobDriveId: body.jobDriveId,
      expectedUpdatedAt: null,
      drive: body.drive,
      allowPossibleDuplicate: body.allowPossibleDuplicate,
      isCorrection: false,
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
      case "invalid_payload":
        return jsonError(422, "The Job Drive could not be saved safely.");
      case "conflict":
      case "not_found":
      case "correction_required":
        return jsonError(409, "This Job Drive ID is already in use.", {
          recovery: "Close the form and add the drive again.",
        });
    }
  },
);
