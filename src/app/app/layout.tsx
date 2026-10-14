import { PersistentWorkspace } from "@/features/workspace/persistent-workspace";
import { requirePageAuth } from "@/server/auth/session";

export default async function WorkspaceLayout({ children }: LayoutProps<"/app">) {
  const { principal } = await requirePageAuth();
  return (
    <PersistentWorkspace viewer={{ displayName: principal.displayName, email: principal.email }}>
      {children}
    </PersistentWorkspace>
  );
}
