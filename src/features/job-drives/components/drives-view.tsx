"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { useGateway } from "@/features/workspace/gateway";

import type { JobDrive } from "../contracts";
import { emptyJobDrivePayload } from "../payload";
import { JobDriveEditor } from "./job-drive-editor";
import { JobDriveList } from "./job-drive-list";

export function DrivesView({ drives }: { drives: JobDrive[] }) {
  const gateway = useGateway();
  const [createId, setCreateId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function openCreate() {
    setNotice(null);
    setCreateId(crypto.randomUUID());
  }

  return (
    <>
      <PageHeader
        action={
          <Button onClick={openCreate}>
            <Plus size={15} /> Add Job Drive
          </Button>
        }
        description="One company-and-role process from plan to outcome, with the nearest important date visible."
        eyebrow="Your hiring pipeline"
        title="Job Drives"
      />
      <div aria-live="polite">
        {notice ? <Notice className="mt-7" role="status" tone="success">{notice}</Notice> : null}
      </div>
      {createId ? (
        <div className="mt-8">
          <JobDriveEditor
            initial={emptyJobDrivePayload}
            key={createId}
            mode="create"
            onCancel={() => setCreateId(null)}
            onSave={async (drive, { allowPossibleDuplicate }) => {
              const result = await gateway.createDrive({ jobDriveId: createId, drive, allowPossibleDuplicate });
              if (result.outcome !== "possible_duplicate") {
                setCreateId(null);
                setNotice(`${result.jobDrive.companyName} added.`);
              }
              return result;
            }}
          />
        </div>
      ) : null}
      <div className={createId ? "mt-5" : "mt-8"}>
        <JobDriveList drives={drives} onCreate={openCreate} />
      </div>
    </>
  );
}
