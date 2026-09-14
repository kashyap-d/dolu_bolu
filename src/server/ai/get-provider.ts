import "server-only";

import type { ActionProposalProvider } from "./action-proposal-provider";
import { DemoActionProposalProvider } from "./providers/demo";

export function getActionProposalProvider(): ActionProposalProvider {
  const provider = process.env.AI_PROVIDER ?? "demo";

  if (provider === "demo") {
    return new DemoActionProposalProvider();
  }

  throw new Error(
    `AI_PROVIDER=${provider} is not implemented yet. Use AI_PROVIDER=demo until a reviewed adapter is added.`,
  );
}

