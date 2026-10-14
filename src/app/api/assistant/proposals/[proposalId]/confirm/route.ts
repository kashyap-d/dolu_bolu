import {
  confirmJobDriveRequestSchema,
  confirmJobDriveResponseSchema,
} from "@/features/job-drives/contracts";
import { getRequestAuth } from "@/server/auth/session";
import {
  confirmJobDriveProposal,
  JobDriveProposalRepositoryError,
} from "@/server/repositories/job-drive-proposal-repository";

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

  const parsed = confirmJobDriveRequestSchema.safeParse(body);
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

  const { proposalId } = await context.params;

  try {
    const result = await confirmJobDriveProposal(auth.supabase, {
      proposalId,
      version: parsed.data.version,
      drive: parsed.data.drive,
      allowPossibleDuplicate: parsed.data.allowPossibleDuplicate,
    });

    switch (result.outcome) {
      case "executed":
      case "already_executed":
        return Response.json(confirmJobDriveResponseSchema.parse(result));
      case "possible_duplicate":
        return Response.json(result, { status: 409 });
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
          { error: "The Job Drive payload could not be confirmed safely." },
          { status: 422 },
        );
    }
  } catch (error) {
    if (error instanceof JobDriveProposalRepositoryError) {
      return Response.json(
        { error: "Confirmation is temporarily unavailable. Please try again." },
        { status: 503 },
      );
    }
    throw error;
  }
}
