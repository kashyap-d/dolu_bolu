import { notFound } from "next/navigation";
import { z } from "zod";

import { JobDriveCommandCenter } from "@/features/assistant/components/job-drive-command-center";
import { requirePageAuth } from "@/server/auth/session";
import { listPendingJobDriveProposals } from "@/server/repositories/job-drive-proposal-repository";
import { findJobDrive, listJobDriveActivity, listJobDrives } from "@/server/repositories/job-drive-repository";

export default async function JobDrivePage({ params }: { params: Promise<{ driveId: string }> }) {
  const { driveId: rawId } = await params;
  const driveId = z.uuid().safeParse(rawId);
  if (!driveId.success) notFound();

  const { principal, supabase } = await requirePageAuth();
  const drive = await findJobDrive(supabase, principal.id, driveId.data);
  if (!drive) notFound();

  const [proposals, jobDrives, activity] = await Promise.all([
    listPendingJobDriveProposals(supabase, principal.id),
    listJobDrives(supabase, principal.id),
    listJobDriveActivity(supabase, principal.id, drive.id),
  ]);

  return <JobDriveCommandCenter initialActivity={activity} initialJobDrives={jobDrives} initialProposals={proposals} initialView="detail" mode="persistent" selectedJobDriveId={drive.id} viewer={principal} />;
}
