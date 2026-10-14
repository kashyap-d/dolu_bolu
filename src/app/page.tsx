import { redirect } from "next/navigation";
import { connection } from "next/server";

import { PreviewWorkspace } from "@/features/workspace/preview-workspace";
import { isSupabaseConfigured } from "@/server/env";

export default async function Home() {
  // Decide per request: the build environment may not match the runtime one.
  await connection();
  if (isSupabaseConfigured()) redirect("/app");
  return <PreviewWorkspace />;
}
