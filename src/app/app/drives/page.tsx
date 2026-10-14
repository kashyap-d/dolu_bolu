import { JobDriveCommandCenter } from "@/features/assistant/components/job-drive-command-center";
import { requirePageAuth } from "@/server/auth/session";
import { listPendingJobDriveProposals } from "@/server/repositories/job-drive-proposal-repository";
import { listJobDrives } from "@/server/repositories/job-drive-repository";

export default async function JobDrivesPage() {
  const { principal, supabase } = await requirePageAuth();
  let proposals = [] as Awaited<ReturnType<typeof listPendingJobDriveProposals>>;
  let jobDrives = [] as Awaited<ReturnType<typeof listJobDrives>>;
  let loadError: string | null = null;

  try {
    [proposals, jobDrives] = await Promise.all([
      listPendingJobDriveProposals(supabase, principal.id),
      listJobDrives(supabase, principal.id),
    ]);
  } catch {
    loadError = "Your Job Drives could not be loaded. Apply the latest Supabase migration, then refresh.";
  }

  return <JobDriveCommandCenter initialJobDrives={jobDrives} initialProposals={proposals} initialView="drives" loadError={loadError} mode="persistent" viewer={principal} />;
}
