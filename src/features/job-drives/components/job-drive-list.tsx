"use client";

import { ArrowRight, BriefcaseBusiness, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { LocalDateTime } from "@/components/ui/local-date-time";
import { WorkspaceLink } from "@/features/workspace/navigation";

import type { JobDrive } from "../contracts";
import { importantDateForDrive } from "../stage-rules";
import { StageBadge } from "./stage-bar";

const columns =
  "md:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_145px_minmax(160px,1fr)_42px] md:items-center md:gap-4";

export function JobDriveList({ drives, onCreate }: { drives: JobDrive[]; onCreate: () => void }) {
  if (!drives.length) {
    return (
      <div className="flex min-h-72 flex-col items-center justify-center rounded-3xl border border-dashed border-line-strong bg-surface/70 px-6 text-center">
        <span className="grid size-12 place-items-center rounded-2xl bg-brand-soft text-brand-text">
          <BriefcaseBusiness size={21} />
        </span>
        <h2 className="mt-4 font-display text-xl font-semibold tracking-[-0.03em] text-ink">
          No Job Drives yet
        </h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-muted">
          Add one directly, or tell dolu bolu about a company, role, and where you are in the process.
        </p>
        <Button className="mt-5" onClick={onCreate}>
          <Plus size={15} /> Add Job Drive
        </Button>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
      <div
        className={`hidden gap-4 border-b border-line bg-surface-muted px-5 py-3 text-[11px] font-bold uppercase tracking-[0.12em] text-subtle md:grid ${columns}`}
      >
        <span>Company</span>
        <span>Role</span>
        <span>Stage</span>
        <span>Next important date</span>
        <span />
      </div>
      <ul className="divide-y divide-line">
        {drives.map((drive) => {
          const important = importantDateForDrive(drive);
          return (
            <li key={drive.id}>
              <WorkspaceLink
                className={`grid w-full gap-3 px-5 py-5 text-left transition hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-none md:py-4 ${columns}`}
                to={{ view: "drive", driveId: drive.id }}
              >
                <div className="min-w-0">
                  <p className="truncate font-display text-sm font-semibold text-ink">{drive.companyName}</p>
                  {drive.location ? <p className="mt-1 truncate text-xs text-subtle">{drive.location}</p> : null}
                </div>
                <p className="min-w-0 truncate text-sm text-muted">{drive.roleTitle}</p>
                <div>
                  <StageBadge stage={drive.stage} />
                </div>
                <p className="text-xs leading-5 text-muted">
                  {important ? (
                    <>
                      <span className="font-semibold text-ink-soft">{important.label}</span>
                      <br />
                      <LocalDateTime value={important.value} />
                    </>
                  ) : (
                    "No dated event"
                  )}
                </p>
                <ArrowRight aria-hidden="true" className="hidden text-subtle md:block" size={16} />
              </WorkspaceLink>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between border-t border-line bg-surface-muted px-5 py-3">
        <p className="text-xs text-subtle">
          {drives.length} hiring process{drives.length === 1 ? "" : "es"}
        </p>
        <Button onClick={onCreate} size="sm" variant="ghost">
          <Plus size={14} /> Add another
        </Button>
      </div>
    </div>
  );
}
