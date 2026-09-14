import "server-only";

import type { ProposalDecision } from "@/features/assistant/contracts";

export interface ActionProposalInput {
  message: string;
  now: string;
  timeZone: string;
  locale: string;
  context: {
    applications: ReadonlyArray<{
      ref: string;
      companyName: string;
      roleTitle: string;
      status: string;
    }>;
  };
}

export interface ActionProposalResult {
  decision: ProposalDecision;
  metadata: {
    provider: string;
    model: string;
    latencyMs: number;
    isDemo: boolean;
  };
}

export interface ActionProposalProvider {
  readonly name: string;
  readonly model: string;
  readonly isDemo: boolean;

  propose(input: ActionProposalInput): Promise<ActionProposalResult>;
}

export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly code:
      | "AUTH"
      | "RATE_LIMITED"
      | "TIMEOUT"
      | "UNAVAILABLE"
      | "REFUSED"
      | "INVALID_OUTPUT",
    readonly retryable: boolean,
    readonly provider: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

