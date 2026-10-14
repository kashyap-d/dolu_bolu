import type { z } from "zod";

import {
  assistantResponseSchema,
  rejectProposalResponseSchema,
  type ActionProposal,
  type AssistantRequestInput,
} from "@/features/assistant/contracts";
import {
  confirmJobDriveResponseSchema,
  saveJobDriveResponseSchema,
  type JobDriveProgressPayload,
} from "@/features/job-drives/contracts";

/** A request the server refused or could not complete; the message is safe to show. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

function errorMessage(body: unknown, fallback: string) {
  if (typeof body !== "object" || body === null) return fallback;
  const { error, recovery } = body as { error?: unknown; recovery?: unknown };
  return (
    [error, recovery].filter((part): part is string => typeof part === "string").join(" ") ||
    fallback
  );
}

/**
 * Posts JSON and validates the response with the shared schema. Expected
 * non-2xx outcomes that match the schema (such as a duplicate warning) are
 * returned; everything else becomes an ApiError with the server's message.
 */
async function send<TSchema extends z.ZodType>(
  url: string,
  method: "POST" | "PATCH",
  body: unknown,
  schema: TSchema,
  fallback: string,
): Promise<z.output<TSchema>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError("You appear to be offline. Check your connection and try again.", 0);
  }

  const json: unknown = await response.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (parsed.success) return parsed.data;
  throw new ApiError(
    response.ok ? "The server returned an unexpected response." : errorMessage(json, fallback),
    response.status,
  );
}

export const api = {
  requestProposal(input: AssistantRequestInput) {
    return send(
      "/api/assistant/proposals",
      "POST",
      input,
      assistantResponseSchema,
      "dolu bolu could not interpret that message.",
    );
  },

  confirmProposal(
    proposal: ActionProposal,
    drive: JobDriveProgressPayload,
    allowPossibleDuplicate: boolean,
  ) {
    return send(
      `/api/assistant/proposals/${encodeURIComponent(proposal.id)}/confirm`,
      "POST",
      { version: proposal.version, allowPossibleDuplicate, drive },
      confirmJobDriveResponseSchema,
      "The update could not be confirmed.",
    );
  },

  async rejectProposal(proposal: ActionProposal) {
    await send(
      `/api/assistant/proposals/${encodeURIComponent(proposal.id)}/reject`,
      "POST",
      { version: proposal.version },
      rejectProposalResponseSchema,
      "The proposal could not be discarded.",
    );
  },

  createDrive(input: {
    jobDriveId: string;
    drive: JobDriveProgressPayload;
    allowPossibleDuplicate: boolean;
  }) {
    return send(
      "/api/job-drives",
      "POST",
      input,
      saveJobDriveResponseSchema,
      "The Job Drive could not be saved.",
    );
  },

  updateDrive(input: {
    driveId: string;
    expectedUpdatedAt: string;
    isCorrection: boolean;
    drive: JobDriveProgressPayload;
  }) {
    const { driveId, ...body } = input;
    return send(
      `/api/job-drives/${encodeURIComponent(driveId)}`,
      "PATCH",
      body,
      saveJobDriveResponseSchema,
      "The Job Drive could not be saved.",
    );
  },
};
