import { assistantRequestSchema } from "@/features/assistant/contracts";
import { AiProviderError } from "@/server/ai/action-proposal-provider";
import { getRequestAuth } from "@/server/auth/session";
import { isSupabaseConfigured } from "@/server/env";
import {
  ClientRequestConflictError,
  prepareActionProposals,
} from "@/server/services/proposal-service";

export async function POST(request: Request) {
  const persistenceEnabled = isSupabaseConfigured();
  const auth = persistenceEnabled ? await getRequestAuth() : null;

  if (persistenceEnabled && !auth) {
    return Response.json(
      { error: "Sign in to prepare a saved proposal." },
      { status: 401 },
    );
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
    const result = await prepareActionProposals(
      parsedRequest.data,
      auth
        ? { supabase: auth.supabase, userId: auth.principal.id }
        : null,
    );
    return Response.json(result);
  } catch (error) {
    if (error instanceof ClientRequestConflictError) {
      return Response.json({ error: error.message }, { status: 409 });
    }

    if (error instanceof AiProviderError) {
      const responses: Record<
        AiProviderError["code"],
        { status: number; error: string; recovery: string }
      > = {
        AUTH: {
          status: 503,
          error: "The AI provider is not configured correctly.",
          recovery: "The server owner needs to check the provider credentials.",
        },
        CONFIGURATION: {
          status: 503,
          error: "The selected AI model is not configured correctly.",
          recovery: "The server owner needs to check the model settings.",
        },
        RATE_LIMITED: {
          status: 429,
          error: "The AI provider is receiving too many requests.",
          recovery: "Your message is still in the composer. Try again shortly.",
        },
        TIMEOUT: {
          status: 504,
          error: "The AI provider took too long to respond.",
          recovery: "Your message is still in the composer. Please try again.",
        },
        UNAVAILABLE: {
          status: 503,
          error: "The AI provider is temporarily unavailable.",
          recovery: "Your message is still in the composer. Please try again.",
        },
        REFUSED: {
          status: 422,
          error: "The assistant could not safely interpret that message.",
          recovery: "Try rephrasing it with just the company, role, and date.",
        },
        INVALID_OUTPUT: {
          status: 502,
          error: "The AI provider returned an invalid response.",
          recovery: "Your message was not saved. Please try again.",
        },
      };
      const response = responses[error.code];

      return Response.json(
        { error: response.error, recovery: response.recovery },
        { status: response.status },
      );
    }

    return Response.json(
      {
        error: "The proposal service is temporarily unavailable.",
        recovery: "Your message is still in the composer. Please try again.",
      },
      { status: 503 },
    );
  }
}
