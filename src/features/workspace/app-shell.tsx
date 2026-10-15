"use client";

import { BriefcaseBusiness, LogOut, Settings, Sparkles, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { buttonClasses } from "@/components/ui/button";
import { cx } from "@/lib/cx";

import { useWorkspaceNavigation, WorkspaceLink, type WorkspaceTarget } from "./navigation";

export interface Viewer {
  displayName: string | null;
  email: string | null;
}

interface NavItem {
  to: WorkspaceTarget;
  label: string;
  icon: LucideIcon;
  /** Only meaningful with a stored account, so hidden in the preview. */
  persistentOnly?: boolean;
}

const allNavItems: NavItem[] = [
  { to: { view: "command" }, label: "Command center", icon: Sparkles },
  { to: { view: "drives" }, label: "Drives", icon: BriefcaseBusiness },
  { to: { view: "settings" }, label: "Your data", icon: Settings, persistentOnly: true },
];

function initials({ displayName, email }: Viewer) {
  const source = displayName?.trim() || email?.split("@")[0] || "You";
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function isActive(current: WorkspaceTarget, item: WorkspaceTarget) {
  if (item.view === "drives") return current.view === "drives" || current.view === "drive";
  return current.view === item.view;
}

function BrandMark({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <span
      className={cx(
        "relative grid place-items-center bg-brand text-white",
        size === "md" ? "size-9 rounded-[13px]" : "size-8 rounded-xl",
      )}
    >
      <Sparkles size={size === "md" ? 17 : 15} />
      {size === "md" ? (
        <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-sidebar bg-accent" />
      ) : null}
    </span>
  );
}

export function AppShell({
  mode,
  viewer,
  children,
}: {
  mode: "persistent" | "preview";
  viewer: Viewer;
  children: ReactNode;
}) {
  const { current } = useWorkspaceNavigation();
  const navItems = allNavItems.filter((item) => mode === "persistent" || !item.persistentOnly);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="hidden border-r border-line bg-sidebar/90 px-4 py-5 backdrop-blur lg:flex lg:min-h-screen lg:flex-col">
        <div className="flex items-center gap-3 px-2 py-1">
          <BrandMark />
          <div>
            <p className="font-display text-lg font-bold tracking-[-0.04em] text-ink">dolu bolu</p>
            <p className="-mt-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-subtle">
              Career assistant
            </p>
          </div>
        </div>
        <nav aria-label="Primary" className="mt-9 space-y-1">
          {navItems.map((item) => {
            const active = isActive(current, item.to);
            return (
              <WorkspaceLink
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium transition",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                  active ? "bg-surface text-brand shadow-card" : "text-muted hover:bg-surface/70",
                )}
                key={item.label}
                to={item.to}
              >
                <item.icon size={17} />
                <span>{item.label}</span>
                {active ? <span className="ml-auto size-1.5 rounded-full bg-accent" /> : null}
              </WorkspaceLink>
            );
          })}
        </nav>
        <div className="mt-auto rounded-2xl border border-line bg-surface/80 p-4">
          <p className="text-xs font-semibold text-ink-soft">
            {mode === "persistent" ? "Private workspace" : "Local preview"}
          </p>
          <p className="mt-1.5 text-xs leading-5 text-subtle">
            {mode === "persistent"
              ? "Only you can see your drives. Every saved change is recorded in its history."
              : "Nothing is saved. Data resets when you reload."}
          </p>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="flex min-h-16 items-center justify-between border-b border-line bg-canvas/80 px-5 py-3 backdrop-blur sm:px-8 lg:justify-end lg:px-10">
          <div className="flex items-center gap-2.5 lg:hidden">
            <BrandMark size="sm" />
            <span className="font-display font-bold">dolu bolu</span>
          </div>
          <div className="flex items-center gap-2.5">
            <nav aria-label="Primary" className="flex rounded-xl border border-line bg-surface p-1 lg:hidden">
              {navItems.map((item) => {
                const active = isActive(current, item.to);
                return (
                  <WorkspaceLink
                    aria-current={active ? "page" : undefined}
                    aria-label={item.label}
                    className={cx(
                      "grid size-8 place-items-center rounded-lg",
                      active ? "bg-brand-soft text-brand" : "text-subtle",
                    )}
                    key={item.label}
                    to={item.to}
                  >
                    <item.icon size={15} />
                  </WorkspaceLink>
                );
              })}
            </nav>
            <span
              aria-hidden="true"
              className="grid size-9 place-items-center rounded-full bg-brand-soft text-xs font-bold text-brand-text"
            >
              {initials(viewer)}
            </span>
            {mode === "persistent" ? (
              <form action="/auth/signout" method="post">
                <button
                  aria-label="Sign out"
                  className={buttonClasses({ variant: "secondary", size: "icon" })}
                  type="submit"
                >
                  <LogOut size={15} />
                </button>
              </form>
            ) : null}
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1180px] px-5 py-8 sm:px-8 lg:px-10 lg:py-12">
          {children}
        </main>
      </div>
    </div>
  );
}
