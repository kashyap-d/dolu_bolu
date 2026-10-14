import { z } from "zod";

import {
  saveJobDriveResponseSchema,
  updateJobDriveRequestSchema,
} from "@/features/job-drives/contracts";
import { getRequestAuth } from "@/server/auth/session";
import {
  JobDriveRepositoryError,
  saveJobDrive,
} from "@/server/repositories/job-drive-repository";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ jobDriveId: string }> },
) {
  const auth = await getRequestAuth();
  if (!auth) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const { jobDriveId: rawId } = await context.params;
  const jobDriveId = z.uuid().safeParse(rawId);
  if (!jobDriveId.success) {
    return Response.json({ error: "Job Drive not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = updateJobDriveRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error: "Please correct the Job Drive fields.",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  try {
    const result = await saveJobDrive(auth.supabase, {
      jobDriveId: jobDriveId.data,
      expectedUpdatedAt: parsed.data.expectedUpdatedAt,
      drive: parsed.data.drive,
      allowPossibleDuplicate: true,
      isCorrection: parsed.data.isCorrection,
    });

    if (result.outcome === "not_found") {
      return Response.json({ error: "Job Drive not found." }, { status: 404 });
    }
    if (result.outcome === "correction_required") {
      return Response.json(
        {
          error: "Moving backwards or reopening a closed drive must be confirmed as a correction.",
          correctionRequired: true,
        },
        { status: 409 },
      );
    }
    if (result.outcome === "conflict") {
      return Response.json(
        { error: "This Job Drive changed in another session.", recovery: "Refresh to load the latest values." },
        { status: 409 },
      );
    }
    if (result.outcome === "invalid_payload") {
      return Response.json({ error: "The Job Drive could not be updated safely." }, { status: 422 });
    }
    if (result.outcome === "auth_required") {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }
    if (result.outcome === "possible_duplicate") {
      return Response.json(result, { status: 409 });
    }

    return Response.json(saveJobDriveResponseSchema.parse(result));
  } catch (error) {
    if (error instanceof JobDriveRepositoryError) {
      return Response.json(
        { error: "The Job Drive could not be updated. Please try again." },
        { status: 503 },
      );
    }
    throw error;
  }
}
