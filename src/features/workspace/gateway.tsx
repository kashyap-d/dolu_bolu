"use client";

import { createContext, use } from "react";

import type {
  ActionProposal,
  AssistantResponse,
} from "@/features/assistant/contracts";
import type {
  ConfirmJobDriveResponse,
  JobDriveProgressPayload,
  SaveJobDriveResponse,
} from "@/features/job-drives/contracts";

/**
 * Every workspace mutation goes through this interface. The signed-in
 * workspace implements it over HTTP and re-renders from the database; the
 * local preview implements it in memory. Views depend only on this.
 */
export interface WorkspaceGateway {
  readonly mode: "persistent" | "preview";
  requestProposal(message: string): Promise<AssistantResponse>;
  confirmProposal(
    proposal: ActionProposal,
    drive: JobDriveProgressPayload,
    options: { allowPossibleDuplicate: boolean },
  ): Promise<ConfirmJobDriveResponse>;
  discardProposal(proposal: ActionProposal): Promise<void>;
  createDrive(input: {
    jobDriveId: string;
    drive: JobDriveProgressPayload;
    allowPossibleDuplicate: boolean;
  }): Promise<SaveJobDriveResponse>;
  updateDrive(input: {
    driveId: string;
    expectedUpdatedAt: string;
    isCorrection: boolean;
    drive: JobDriveProgressPayload;
  }): Promise<SaveJobDriveResponse>;
}

const GatewayContext = createContext<WorkspaceGateway | null>(null);

export const GatewayProvider = GatewayContext.Provider;

export function useGateway() {
  const gateway = use(GatewayContext);
  if (!gateway) throw new Error("The workspace gateway is not available here.");
  return gateway;
}

export function browserRequestContext() {
  return {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    locale: navigator.language || "en-IN",
    clientRequestId: crypto.randomUUID(),
  };
}
