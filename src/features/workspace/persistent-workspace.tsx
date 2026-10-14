"use client";

import { usePathname, useRouter } from "next/navigation";
import { useMemo, type ReactNode } from "react";

import { AppShell, type Viewer } from "./app-shell";
import { api } from "./api-client";
import { browserRequestContext, GatewayProvider, type WorkspaceGateway } from "./gateway";
import { NavigationProvider, routedHref, targetFromPath, type WorkspaceNavigation } from "./navigation";

/**
 * The signed-in workspace. Mutations go to the API, then the current route is
 * re-rendered from the database, so what the user sees after a save is what
 * was actually stored.
 */
export function PersistentWorkspace({ viewer, children }: { viewer: Viewer; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const navigation = useMemo<WorkspaceNavigation>(
    () => ({
      current: targetFromPath(pathname),
      href: routedHref,
      navigate: (target) => router.push(routedHref(target)),
    }),
    [pathname, router],
  );

  const gateway = useMemo<WorkspaceGateway>(() => {
    function refreshUnlessDuplicate<T extends { outcome: string }>(result: T) {
      if (result.outcome !== "possible_duplicate") router.refresh();
      return result;
    }
    return {
      mode: "persistent",
      async requestProposal(message) {
        const result = await api.requestProposal({ message, ...browserRequestContext() });
        if (result.decision.kind === "proposal") router.refresh();
        return result;
      },
      async confirmProposal(proposal, drive, { allowPossibleDuplicate }) {
        return refreshUnlessDuplicate(
          await api.confirmProposal(proposal, drive, allowPossibleDuplicate),
        );
      },
      async discardProposal(proposal) {
        await api.rejectProposal(proposal);
        router.refresh();
      },
      async createDrive(input) {
        return refreshUnlessDuplicate(await api.createDrive(input));
      },
      async updateDrive(input) {
        return refreshUnlessDuplicate(await api.updateDrive(input));
      },
    };
  }, [router]);

  return (
    <NavigationProvider value={navigation}>
      <GatewayProvider value={gateway}>
        <AppShell mode="persistent" viewer={viewer}>
          {children}
        </AppShell>
      </GatewayProvider>
    </NavigationProvider>
  );
}
