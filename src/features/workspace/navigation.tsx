"use client";

import Link from "next/link";
import { createContext, use, type ReactNode } from "react";

export type WorkspaceTarget =
  | { view: "command" }
  | { view: "drives" }
  | { view: "drive"; driveId: string };

export interface WorkspaceNavigation {
  current: WorkspaceTarget;
  /** A URL when the workspace is routed; null in the single-page preview. */
  href(target: WorkspaceTarget): string | null;
  navigate(target: WorkspaceTarget): void;
}

const NavigationContext = createContext<WorkspaceNavigation | null>(null);

export const NavigationProvider = NavigationContext.Provider;

export function useWorkspaceNavigation() {
  const navigation = use(NavigationContext);
  if (!navigation) throw new Error("Workspace navigation is not available here.");
  return navigation;
}

export function routedHref(target: WorkspaceTarget) {
  switch (target.view) {
    case "command":
      return "/app";
    case "drives":
      return "/app/drives";
    case "drive":
      return `/app/drives/${encodeURIComponent(target.driveId)}`;
  }
}

export function targetFromPath(pathname: string): WorkspaceTarget {
  const drive = pathname.match(/^\/app\/drives\/([^/]+)/);
  if (drive) return { view: "drive", driveId: decodeURIComponent(drive[1]) };
  if (pathname.startsWith("/app/drives")) return { view: "drives" };
  return { view: "command" };
}

/** Renders a real link when routed, or a button in the preview, so views never branch on mode. */
export function WorkspaceLink({
  to,
  className,
  children,
  "aria-label": ariaLabel,
  "aria-current": ariaCurrent,
}: {
  to: WorkspaceTarget;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
  "aria-current"?: "page";
}) {
  const navigation = useWorkspaceNavigation();
  const href = navigation.href(to);
  if (href) {
    return (
      <Link aria-current={ariaCurrent} aria-label={ariaLabel} className={className} href={href}>
        {children}
      </Link>
    );
  }
  return (
    <button
      aria-current={ariaCurrent}
      aria-label={ariaLabel}
      className={className}
      onClick={() => navigation.navigate(to)}
      type="button"
    >
      {children}
    </button>
  );
}
