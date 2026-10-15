import { DrivesView } from "@/features/job-drives/components/drives-view";
import { requirePageAuth } from "@/server/auth/session";
import { listJobDrives } from "@/server/repositories/job-drive-repository";

export default async function DrivesPage() {
  const { principal, supabase } = await requirePageAuth();
  return <DrivesView drives={await listJobDrives(supabase, principal.id)} />;
}
