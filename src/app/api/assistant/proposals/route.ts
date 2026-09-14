import {
  assistantRequestSchema,
  assistantResponseSchema,
} from "@/features/assistant/contracts";
import {
  validateProposalEvidence,
  validateProposalForConfirmation,
} from "@/features/assistant/validate-proposal";
import { getActionProposalProvider } from "@/server/ai/get-provider";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsedRequest = assistantRequestSchema.safeParse(body);

  if (!parsedRequest.success) {
    return Response.json(
      {
        error: "Please check the message and timezone.",
        issues: parsedRequest.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  try {
    const provider = getActionProposalProvider();
    const providerResult = await provider.propose({
      message: parsedRequest.data.message,
      now: new Date().toISOString(),
      timeZone: parsedRequest.data.timeZone,
      locale: parsedRequest.data.locale,
      context: { applications: [] },
    });
    const parsedResult = assistantResponseSchema.safeParse(providerResult);

    if (!parsedResult.success) {
      throw new Error("The configured provider returned an invalid response.");
    }

    const result = parsedResult.data;

    if (result.decision.kind === "proposals") {
      const issues = result.decision.proposals.flatMap((proposal) =>
        [
          ...validateProposalEvidence(parsedRequest.data.message, proposal),
          ...validateProposalForConfirmation(proposal),
        ],
      );

      if (issues.length > 0) {
        return Response.json({
          decision: {
            kind: "needs_clarification",
            question: issues.map((issue) => issue.message).join(" "),
            missingFields: [...new Set(issues.map((issue) => issue.fieldPath))],
          },
          metadata: result.metadata,
        });
      }
    }

    return Response.json(result);
  } catch {
    return Response.json(
      {
        error: "The proposal service is temporarily unavailable.",
        recovery:
          "You can still use the manual application, interview, or task form.",
      },
      { status: 503 },
    );
  }
}
