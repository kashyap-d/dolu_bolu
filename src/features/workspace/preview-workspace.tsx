"use client";

import { useMemo, useRef, useState } from "react";

import { CommandCenterView } from "@/features/assistant/components/command-center";
import type { ActionProposal } from "@/features/assistant/contracts";
import { DriveDetailView } from "@/features/job-drives/components/drive-detail-view";
import { DrivesView } from "@/features/job-drives/components/drives-view";
import type {
  ActivityEvent,
  JobDrive,
  JobDriveProgressPayload,
} from "@/features/job-drives/contracts";
import { matchingJobDrives } from "@/features/job-drives/matching";
import { mergeAssessmentDetails } from "@/features/job-drives/merge-details";
import { editableRounds, mergeProposedRound } from "@/features/job-drives/rounds";
import { changedFields, payloadFromDrive } from "@/features/job-drives/payload";
import { inferredStage } from "@/features/job-drives/stage-rules";

import { AppShell } from "./app-shell";
import { api } from "./api-client";
import { browserRequestContext, GatewayProvider, type WorkspaceGateway } from "./gateway";
import { NavigationProvider, type WorkspaceNavigation, type WorkspaceTarget } from "./navigation";

interface PreviewState {
  drives: JobDrive[];
  proposals: ActionProposal[];
  activity: Record<string, ActivityEvent[]>;
}

function storedDrive(id: string, payload: JobDriveProgressPayload, existing?: JobDrive): JobDrive {
  const now = new Date().toISOString();
  return {
    id,
    ...payload,
    assessment: payload.assessment ? { ...payload.assessment, updatedAt: now } : null,
    interviewRounds: payload.interviewRounds.map((round) => ({ ...round, updatedAt: now })),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

/** Applies a write the way the database would: upsert the drive and append activity. */
function applyWrite(
  state: PreviewState,
  id: string,
  payload: JobDriveProgressPayload,
  source: ActivityEvent["source"],
): { state: PreviewState; drive: JobDrive; created: boolean } {
  const existing = state.drives.find((drive) => drive.id === id);
  const drive = storedDrive(id, payload, existing);
  const event: ActivityEvent = {
    id: crypto.randomUUID(),
    eventType: existing ? "job_drive.updated" : "job_drive.created",
    source,
    previousStage: existing?.stage ?? null,
    newStage: drive.stage,
    changedFields: changedFields(existing ? payloadFromDrive(existing) : null, payload),
    occurredAt: drive.stageOccurredAt,
    createdAt: drive.updatedAt,
  };
  return {
    drive,
    created: !existing,
    state: {
      ...state,
      drives: [drive, ...state.drives.filter((item) => item.id !== id)],
      activity: { ...state.activity, [id]: [event, ...(state.activity[id] ?? [])] },
    },
  };
}

/**
 * The no-sign-in preview: the same views, backed by memory instead of the
 * database. The assistant still runs on the server (always the deterministic
 * provider), but nothing is stored.
 */
export function PreviewWorkspace() {
  const [target, setTarget] = useState<WorkspaceTarget>({ view: "command" });
  const [state, setState] = useState<PreviewState>({ drives: [], proposals: [], activity: {} });
  // Writes read the latest state even when two resolve before a re-render.
  const latest = useRef(state);

  const navigation = useMemo<WorkspaceNavigation>(
    () => ({ current: target, href: () => null, navigate: setTarget }),
    [target],
  );

  const gateway = useMemo<WorkspaceGateway>(() => {
    const commit = (next: PreviewState) => {
      latest.current = next;
      setState(next);
    };

    return {
      mode: "preview",
      async requestProposal(message) {
        const result = await api.requestProposal({ message, ...browserRequestContext() });
        if (result.decision.kind === "proposal") {
          commit({ ...latest.current, proposals: [result.decision.proposal, ...latest.current.proposals] });
        }
        return result;
      },
      async confirmProposal(proposal, drive) {
        // The server matched against no stored drives, so match here instead.
        const [existing, ...others] = matchingJobDrives(drive, latest.current.drives);
        const target = existing && others.length === 0 ? existing : undefined;
        const payload: JobDriveProgressPayload = target
          ? {
              ...drive,
              stage: inferredStage(target.stage, drive.stage),
              appliedAt: drive.appliedAt ?? target.appliedAt,
              assessment: mergeAssessmentDetails(drive.assessment, target.assessment),
              // Fold each proposed round into the existing ones, as the server would.
              interviewRounds: drive.interviewRounds.reduce(
                (rounds, { id, ...round }) => mergeProposedRound(round, rounds),
                editableRounds(target.interviewRounds),
              ),
            }
          : drive;
        const write = applyWrite(latest.current, target?.id ?? crypto.randomUUID(), payload, "assistant");
        commit({
          ...write.state,
          proposals: write.state.proposals.filter((item) => item.id !== proposal.id),
        });
        return { outcome: "executed", proposalId: proposal.id, jobDrive: write.drive };
      },
      async discardProposal(proposal) {
        commit({ ...latest.current, proposals: latest.current.proposals.filter((item) => item.id !== proposal.id) });
      },
      async createDrive({ jobDriveId, drive }) {
        const write = applyWrite(latest.current, jobDriveId, drive, "manual");
        commit(write.state);
        return { outcome: write.created ? "created" : "already_created", jobDrive: write.drive };
      },
      async updateDrive({ driveId, drive }) {
        const write = applyWrite(latest.current, driveId, drive, "manual");
        commit(write.state);
        return { outcome: "updated", jobDrive: write.drive };
      },
    };
  }, []);

  const selectedDrive =
    target.view === "drive" ? state.drives.find((drive) => drive.id === target.driveId) : undefined;

  return (
    <NavigationProvider value={navigation}>
      <GatewayProvider value={gateway}>
        <AppShell mode="preview" viewer={{ displayName: null, email: null }}>
          {target.view === "command" ? (
            <CommandCenterView drives={state.drives} greetingName={null} proposals={state.proposals} />
          ) : selectedDrive ? (
            <DriveDetailView activity={state.activity[selectedDrive.id] ?? []} drive={selectedDrive} />
          ) : (
            <DrivesView drives={state.drives} />
          )}
        </AppShell>
      </GatewayProvider>
    </NavigationProvider>
  );
}
