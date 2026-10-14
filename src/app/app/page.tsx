import { JobDriveCommandCenter } from "@/features/assistant/components/job-drive-command-center";
import { requirePageAuth } from "@/server/auth/session";
import { listPendingJobDriveProposals } from "@/server/repositories/job-drive-proposal-repository";
import { listJobDrives } from "@/server/repositories/job-drive-repository";

export default async function WorkspacePage() {
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
    loadError =
      "Your workspace could not be loaded. Make sure the Supabase migrations are applied, then refresh this page.";
  }

  return (
    <JobDriveCommandCenter
      initialJobDrives={jobDrives}
      initialProposals={proposals}
      loadError={loadError}
      mode="persistent"
      viewer={principal}
    />
  );
}
