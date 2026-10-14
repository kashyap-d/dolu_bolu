import "server-only";

import { getAiProviderName } from "@/server/env";

import type { ActionProposalProvider } from "./action-proposal-provider";
import { JobDriveDemoProvider } from "./providers/job-drive-demo";
import { GeminiActionProposalProvider } from "./providers/gemini";

export function getActionProposalProvider(): ActionProposalProvider {
  const provider = getAiProviderName();

  if (provider === "demo") {
    return new JobDriveDemoProvider();
  }

  return new GeminiActionProposalProvider();
}
