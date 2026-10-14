import { JobDriveCommandCenter } from "@/features/assistant/components/job-drive-command-center";
import { isSupabaseConfigured } from "@/server/env";
import { redirect } from "next/navigation";

export default function Home() {
  if (isSupabaseConfigured()) redirect("/app");
  return <JobDriveCommandCenter />;
}
