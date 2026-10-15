"use client";

import { ArrowLeft } from "lucide-react";
import { useState } from "react";

import { Notice } from "@/components/ui/notice";
import { useGateway } from "@/features/workspace/gateway";
import { WorkspaceLink } from "@/features/workspace/navigation";

import type { ActivityEvent, JobDrive, JobDriveStage } from "../contracts";
import { payloadFromDrive } from "../payload";
import { JobDriveDetail } from "./job-drive-detail";
import { JobDriveEditor } from "./job-drive-editor";

export function DriveDetailView({ drive, activity }: { drive: JobDrive; activity: ActivityEvent[] }) {
  const gateway = useGateway();
  const [editingStage, setEditingStage] = useState<JobDriveStage | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function openEditor(stage: JobDriveStage) {
    setNotice(null);
    setEditingStage(stage);
  }

  return (
    <>
      <WorkspaceLink
        className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-brand-text hover:underline"
        to={{ view: "drives" }}
      >
        <ArrowLeft aria-hidden="true" size={15} /> All Drives
      </WorkspaceLink>
      <div aria-live="polite">
        {notice ? <Notice className="mb-5" role="status" tone="success">{notice}</Notice> : null}
      </div>
      {editingStage ? (
        <div className="mb-5">
          <JobDriveEditor
            existingStage={drive.stage}
            initial={{
              ...payloadFromDrive(drive),
              stage: editingStage,
              stageOccurredAt: editingStage === drive.stage ? drive.stageOccurredAt : null,
            }}
            key={`${drive.id}:${drive.updatedAt}:${editingStage}`}
            mode="edit"
            onCancel={() => setEditingStage(null)}
            onSave={async (payload, { isCorrection }) => {
              const result = await gateway.updateDrive({
                driveId: drive.id,
                expectedUpdatedAt: drive.updatedAt,
                isCorrection,
                drive: payload,
              });
              if (result.outcome !== "possible_duplicate") {
                setEditingStage(null);
                setNotice(isCorrection ? "Correction saved and recorded in the activity history." : "Job Drive updated.");
              }
              return result;
            }}
          />
        </div>
      ) : null}
      <JobDriveDetail activity={activity} drive={drive} onEditStage={openEditor} />
    </>
  );
}
