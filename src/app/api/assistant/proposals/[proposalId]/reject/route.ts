import { z } from "zod";

import { getRequestAuth } from "@/server/auth/session";
import {
  ProposalRepositoryError,
  rejectApplicationProposal,
} from "@/server/repositories/proposal-repository";

const rejectionRequestSchema = z.object({
  version: z.number().int().positive(),
}).strict();

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

  const parsed = rejectionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid proposal version." }, { status: 400 });
  }

  const { proposalId } = await context.params;

  try {
    const result = await rejectApplicationProposal(auth.supabase, {
      proposalId,
      version: parsed.data.version,
    });

    switch (result.outcome) {
      case "rejected":
      case "already_rejected":
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
    }
  } catch (error) {
    if (error instanceof ProposalRepositoryError) {
      return Response.json(
        { error: "The proposal could not be discarded. Please try again." },
        { status: 503 },
      );
    }
    throw error;
  }
}
