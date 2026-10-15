import { assistantRequestSchema } from "@/features/assistant/contracts";
import { AiProviderError } from "@/server/ai/action-proposal-provider";
import { jsonError, previewableJsonRoute } from "@/server/http";
import {
  AiQuotaExceededError,
  ClientRequestConflictError,
  prepareProposal,
} from "@/server/services/proposal-service";

const KEEP_MESSAGE = "Your message is still in the composer.";

const providerFailures: Record<
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
    recovery: `${KEEP_MESSAGE} Try again shortly.`,
  },
  TIMEOUT: {
    status: 504,
    error: "The AI provider took too long to respond.",
    recovery: `${KEEP_MESSAGE} Please try again.`,
  },
  UNAVAILABLE: {
    status: 503,
    error: "The AI provider is temporarily unavailable.",
    recovery: `${KEEP_MESSAGE} Please try again.`,
  },
  REFUSED: {
    status: 422,
    error: "The assistant could not safely interpret that message.",
    recovery: "Try rephrasing it with the company, role, and stage.",
  },
  INVALID_OUTPUT: {
    status: 502,
    error: "The AI provider returned an invalid response.",
    recovery: "Your message was not saved. Please try again.",
  },
};

export const POST = previewableJsonRoute(
  {
    schema: assistantRequestSchema,
    invalidMessage: "Please check the message and timezone.",
    unavailableMessage: "The proposal service is temporarily unavailable.",
  },
  async ({ auth, body }) => {
    try {
      const result = await prepareProposal(
        body,
        auth ? { supabase: auth.supabase, userId: auth.principal.id } : null,
      );
      return Response.json(result);
    } catch (error) {
      if (error instanceof ClientRequestConflictError) {
        return jsonError(409, error.message);
      }
      if (error instanceof AiQuotaExceededError) {
        return error.scope === "demo"
          ? jsonError(429, "The demo has used today's shared assistant allowance.", {
              recovery: `${KEEP_MESSAGE} Add the update manually, or sign in with Google for your own allowance.`,
            })
          : jsonError(429, `You've used today's ${error.limit} assistant requests.`, {
              recovery: `${KEEP_MESSAGE} Add the update manually or try again tomorrow.`,
            });
      }
      if (error instanceof AiProviderError) {
        const { status, ...response } = providerFailures[error.code];
        return jsonError(status, response.error, { recovery: response.recovery });
      }
      throw error;
    }
  },
);
