import { confirmApplicationRequestSchema } from "@/features/applications/contracts";
import { getRequestAuth } from "@/server/auth/session";
import {
  confirmApplicationProposal,
  ProposalRepositoryError,
} from "@/server/repositories/proposal-repository";

export async function POST(
  request: Request,
  context: { params: Promise<{ proposalId: string }> },
) {
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

  const parsed = confirmApplicationRequestSchema.safeParse(body);
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

  const { proposalId } = await context.params;

  try {
    const result = await confirmApplicationProposal(auth.supabase, {
      proposalId,
      version: parsed.data.version,
      application: parsed.data.application,
    });

    switch (result.outcome) {
      case "executed":
      case "already_executed":
        return Response.json(result);
      case "auth_required":
        return Response.json({ error: "Authentication required." }, { status: 401 });
      case "not_found":
        return Response.json({ error: "Proposal not found." }, { status: 404 });
      case "conflict":
        return Response.json(
          { error: "This proposal has changed or is no longer pending." },
          { status: 409 },
        );
      case "invalid_payload":
        return Response.json(
          { error: "The application payload could not be confirmed safely." },
          { status: 422 },
        );
    }
  } catch (error) {
    if (error instanceof ProposalRepositoryError) {
      return Response.json(
        { error: "Confirmation is temporarily unavailable. Please try again." },
        { status: 503 },
      );
    }
    throw error;
  }
}
