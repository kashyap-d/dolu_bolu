import { CommandCenter } from "@/features/assistant/components/command-center";
import { requirePageAuth } from "@/server/auth/session";
import { listApplications } from "@/server/repositories/application-repository";
import { listPendingApplicationProposals } from "@/server/repositories/proposal-repository";

export default async function ApplicationsPage() {
  const { principal, supabase } = await requirePageAuth();
  let proposals = [] as Awaited<
    ReturnType<typeof listPendingApplicationProposals>
  >;
  let applications = [] as Awaited<ReturnType<typeof listApplications>>;
  let loadError: string | null = null;

  try {
    [proposals, applications] = await Promise.all([
      listPendingApplicationProposals(supabase, principal.id),
      listApplications(supabase, principal.id),
    ]);
  } catch {
    loadError =
      "Your applications could not be loaded. Make sure the Supabase migrations are applied, then refresh this page.";
  }

  return (
    <CommandCenter
      initialApplications={applications}
      initialProposals={proposals}
      initialView="applications"
      loadError={loadError}
      mode="persistent"
      viewer={principal}
    />
  );
}
