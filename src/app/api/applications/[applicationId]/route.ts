import { z } from "zod";

import {
  updateApplicationRequestSchema,
  updateApplicationResponseSchema,
} from "@/features/applications/contracts";
import { getRequestAuth } from "@/server/auth/session";
import {
  ApplicationConflictError,
  ApplicationNotFoundError,
  ApplicationRepositoryError,
  updateApplication,
} from "@/server/repositories/application-repository";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  const auth = await getRequestAuth();
  if (!auth) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const { applicationId: rawApplicationId } = await context.params;
  const applicationId = z.uuid().safeParse(rawApplicationId);
  if (!applicationId.success) {
    return Response.json({ error: "Application not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = updateApplicationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error: "Please correct the application fields.",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  try {
    const application = await updateApplication(
      auth.supabase,
      auth.principal.id,
      {
        applicationId: applicationId.data,
        ...parsed.data,
      },
    );

    return Response.json(
      updateApplicationResponseSchema.parse({
        outcome: "updated",
        application,
      }),
    );
  } catch (error) {
    if (error instanceof ApplicationNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof ApplicationConflictError) {
      return Response.json(
        { error: error.message, recovery: "Refresh to load the latest values." },
        { status: 409 },
      );
    }

    if (error instanceof ApplicationRepositoryError) {
      return Response.json(
        { error: "The application could not be updated. Please try again." },
        { status: 503 },
      );
    }

    throw error;
  }
}
