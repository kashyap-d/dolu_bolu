"use client";

import { ArrowRight, BriefcaseBusiness, Plus } from "lucide-react";
import Link from "next/link";

import type { JobDrive } from "@/features/job-drives/contracts";
import { importantDateForDrive, stageLabel } from "@/features/job-drives/stage-rules";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function StageBadge({ drive }: { drive: JobDrive }) {
  const terminal = drive.stage === "rejected" || drive.stage === "withdrawn";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${terminal ? "bg-[#f5ece9] text-[#855c53]" : drive.stage === "accepted" ? "bg-[#dfeee0] text-[#315b3d]" : "bg-[#edf2e9] text-[#4a654f]"}`}>
      {stageLabel(drive.stage)}
    </span>
  );
}

export function JobDriveList({
  drives,
  persistent,
  onCreate,
  onOpen,
}: {
  drives: JobDrive[];
  persistent: boolean;
  onCreate: () => void;
  onOpen?: (drive: JobDrive) => void;
}) {
  if (!drives.length) {
    return (
      <div className="flex min-h-72 flex-col items-center justify-center rounded-[24px] border border-dashed border-[#d5ddd2] bg-white/70 px-6 text-center">
        <span className="grid size-12 place-items-center rounded-2xl bg-[#eaf0e8] text-[#4e6b56]"><BriefcaseBusiness size={21} /></span>
        <h2 className="mt-4 font-[family-name:var(--font-manrope)] text-xl font-semibold tracking-[-0.03em] text-[#283128]">No Job Drives yet</h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-[#788078]">Create one directly or tell dolu bolu about a company, role, and hiring-stage update.</p>
        <button className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#294435] px-4 py-2.5 text-sm font-semibold text-white" onClick={onCreate} type="button"><Plus size={15} /> Add Job Drive</button>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[22px] border border-[#dfe5dc] bg-white shadow-[0_16px_45px_rgba(55,74,58,0.06)]">
      <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_145px_minmax(160px,1fr)_42px] gap-4 border-b border-[#e9ede7] bg-[#f7f9f5] px-5 py-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[#7b857a] md:grid">
        <span>Company</span><span>Role</span><span>Stage</span><span>Next important date</span><span />
      </div>
      <div className="divide-y divide-[#edf0eb]">
        {drives.map((drive) => {
          const important = importantDateForDrive(drive);
          const row = (
            <>
              <div className="min-w-0"><p className="truncate font-[family-name:var(--font-manrope)] text-sm font-semibold text-[#303a31]">{drive.companyName}</p>{drive.location ? <p className="mt-1 truncate text-xs text-[#8a9188]">{drive.location}</p> : null}</div>
              <p className="min-w-0 truncate text-sm text-[#596258]">{drive.roleTitle}</p>
              <div><StageBadge drive={drive} /></div>
              <p className="text-xs leading-5 text-[#727b71]">{important ? <><span className="font-semibold text-[#596558]">{important.label}</span><br />{formatDate(important.value)}</> : "No dated event"}</p>
              <ArrowRight className="text-[#8a9488]" size={16} />
            </>
          );
          return persistent ? (
            <Link className="grid gap-3 px-5 py-5 transition hover:bg-[#fbfcfa] md:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_145px_minmax(160px,1fr)_42px] md:items-center md:gap-4 md:py-4" href={`/app/drives/${drive.id}`} key={drive.id}>{row}</Link>
          ) : (
            <button className="grid w-full gap-3 px-5 py-5 text-left transition hover:bg-[#fbfcfa] md:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_145px_minmax(160px,1fr)_42px] md:items-center md:gap-4 md:py-4" key={drive.id} onClick={() => onOpen?.(drive)} type="button">{row}</button>
          );
        })}
      </div>
      <div className="flex items-center justify-between border-t border-[#e9ede7] bg-[#fafbf9] px-5 py-3">
        <p className="text-xs text-[#7a8379]">{drives.length} hiring process{drives.length === 1 ? "" : "es"}</p>
        <button className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#416149]" onClick={onCreate} type="button"><Plus size={14} /> Add another</button>
      </div>
    </div>
  );
}
