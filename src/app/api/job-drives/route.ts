import {
  createJobDriveRequestSchema,
  saveJobDriveResponseSchema,
} from "@/features/job-drives/contracts";
import { getRequestAuth } from "@/server/auth/session";
import {
  JobDriveRepositoryError,
  saveJobDrive,
} from "@/server/repositories/job-drive-repository";

export async function POST(request: Request) {
  const auth = await getRequestAuth();
  if (!auth) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = createJobDriveRequestSchema.safeParse(body);
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
      jobDriveId: parsed.data.jobDriveId,
      expectedUpdatedAt: null,
      drive: parsed.data.drive,
      allowPossibleDuplicate: parsed.data.allowPossibleDuplicate,
      isCorrection: false,
    });

    if (result.outcome === "possible_duplicate") {
      return Response.json(result, { status: 409 });
    }
    if (result.outcome === "conflict") {
      return Response.json({ error: "This Job Drive ID is already in use." }, { status: 409 });
    }
    if (result.outcome === "invalid_payload") {
      return Response.json({ error: "The Job Drive could not be saved safely." }, { status: 422 });
    }
    if (result.outcome === "auth_required") {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }
    if (result.outcome === "not_found" || result.outcome === "correction_required") {
      return Response.json({ error: "The Job Drive could not be created." }, { status: 409 });
    }

    return Response.json(saveJobDriveResponseSchema.parse(result));
  } catch (error) {
    if (error instanceof JobDriveRepositoryError) {
      return Response.json(
        { error: "The Job Drive could not be created. Please try again." },
        { status: 503 },
      );
    }
    throw error;
  }
}
