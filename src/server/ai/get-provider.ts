import "server-only";

import { getAiProviderName } from "@/server/env";

import type { ActionProposalProvider } from "./action-proposal-provider";
import { JobDriveDemoProvider } from "./providers/job-drive-demo";
import { GeminiActionProposalProvider } from "./providers/gemini";

/**
 * Hosted providers are only reachable for authenticated, quota-checked
 * requests. The unauthenticated local preview always uses the deterministic
 * provider so it can never become a public proxy to a paid model.
 */
export function getActionProposalProvider({
  allowHosted,
}: {
  allowHosted: boolean;
}): ActionProposalProvider {
  if (!allowHosted || getAiProviderName() === "demo") {
    return new JobDriveDemoProvider();
  }

  return new GeminiActionProposalProvider();
}
