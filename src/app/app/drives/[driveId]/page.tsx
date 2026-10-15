import { notFound } from "next/navigation";

import { DriveDetailView } from "@/features/job-drives/components/drive-detail-view";
import { requirePageAuth } from "@/server/auth/session";
import { parseId } from "@/server/http";
import { findJobDrive, listJobDriveActivity } from "@/server/repositories/job-drive-repository";

export default async function DrivePage({ params }: PageProps<"/app/drives/[driveId]">) {
  const driveId = parseId((await params).driveId);
  if (!driveId) notFound();

  const { principal, supabase } = await requirePageAuth();
  const [drive, activity] = await Promise.all([
    findJobDrive(supabase, principal.id, driveId),
    listJobDriveActivity(supabase, principal.id, driveId),
  ]);
  if (!drive) notFound();

  return <DriveDetailView activity={activity} drive={drive} />;
}
