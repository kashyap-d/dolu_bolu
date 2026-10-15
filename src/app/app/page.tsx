import { CommandCenterView } from "@/features/assistant/components/command-center";
import { requirePageAuth } from "@/server/auth/session";
import { listJobDrives } from "@/server/repositories/job-drive-repository";
import { listPendingProposals } from "@/server/repositories/proposal-repository";

export default async function CommandCenterPage() {
  const { principal, supabase } = await requirePageAuth();
  const [proposals, drives] = await Promise.all([
    listPendingProposals(supabase, principal.id),
    listJobDrives(supabase, principal.id),
  ]);

  return (
    <CommandCenterView
      drives={drives}
      greetingName={principal.displayName?.split(/\s+/)[0] ?? null}
      proposals={proposals}
    />
  );
}
