import {
  createManualApplicationRequestSchema,
  createManualApplicationResponseSchema,
} from "@/features/applications/contracts";
import { getRequestAuth } from "@/server/auth/session";
import {
  ApplicationConflictError,
  ApplicationRepositoryError,
  createManualApplication,
} from "@/server/repositories/application-repository";

export async function POST(request: Request) {
  const auth = await getRequestAuth();
  if (!auth) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
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

  const parsed = createManualApplicationRequestSchema.safeParse(body);
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
    const result = await createManualApplication(
      auth.supabase,
      auth.principal.id,
      parsed.data,
    );

    return Response.json(createManualApplicationResponseSchema.parse(result));
  } catch (error) {
    if (error instanceof ApplicationConflictError) {
      return Response.json({ error: error.message }, { status: 409 });
    }

    if (error instanceof ApplicationRepositoryError) {
      return Response.json(
        { error: "The application could not be created. Please try again." },
        { status: 503 },
      );
    }

    throw error;
  }
}
