import "server-only";

import { getAiProviderName } from "@/server/env";

import type { ActionProposalProvider } from "./action-proposal-provider";
import { DemoActionProposalProvider } from "./providers/demo";
import { GeminiActionProposalProvider } from "./providers/gemini";

export function getActionProposalProvider(): ActionProposalProvider {
  const provider = getAiProviderName();

  if (provider === "demo") {
    return new DemoActionProposalProvider();
  }

  return new GeminiActionProposalProvider();
}
