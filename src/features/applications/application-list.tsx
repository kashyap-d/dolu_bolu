import { ArrowRight, BriefcaseBusiness, ExternalLink } from "lucide-react";
import Link from "next/link";

import type { ApplicationRecord } from "@/features/applications/contracts";

function formatStatus(status: ApplicationRecord["status"]) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatDate(value: string | null) {
  if (!value) return "Not applied yet";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function StatusBadge({ status }: { status: ApplicationRecord["status"] }) {
  const active = ["screening", "interviewing", "offer", "accepted"].includes(
    status,
  );

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
        active
          ? "bg-[#e6f0e6] text-[#416249]"
          : status === "rejected" || status === "withdrawn"
            ? "bg-[#f5ece9] text-[#855c53]"
            : "bg-[#f2f1e9] text-[#716b4d]"
      }`}
    >
      {formatStatus(status)}
    </span>
  );
}

export function ApplicationList({
  applications,
  persistent,
  onReturnToCommandCenter,
}: {
  applications: ApplicationRecord[];
  persistent: boolean;
  onReturnToCommandCenter?: () => void;
}) {
  if (applications.length === 0) {
    const content = (
      <>
        <span className="grid size-12 place-items-center rounded-2xl bg-[#eaf0e8] text-[#4e6b56]">
          <BriefcaseBusiness size={21} />
        </span>
        <h2 className="mt-4 font-[family-name:var(--font-manrope)] text-xl font-semibold tracking-[-0.03em] text-[#283128]">
          No applications yet
        </h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-[#788078]">
          Tell dolu bolu where you applied, review the extracted details, and the confirmed record will appear here.
        </p>
        <span className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#294435] px-4 py-2.5 text-sm font-semibold text-white">
          Record an application <ArrowRight size={15} />
        </span>
      </>
    );

    return persistent ? (
      <Link
        className="flex min-h-72 flex-col items-center justify-center rounded-[24px] border border-dashed border-[#d5ddd2] bg-white/70 px-6 text-center transition hover:border-[#b9c8b7] hover:bg-white"
        href="/app"
      >
        {content}
      </Link>
    ) : (
      <button
        className="flex min-h-72 w-full flex-col items-center justify-center rounded-[24px] border border-dashed border-[#d5ddd2] bg-white/70 px-6 text-center transition hover:border-[#b9c8b7] hover:bg-white"
        onClick={onReturnToCommandCenter}
        type="button"
      >
        {content}
      </button>
    );
  }

  return (
    <div className="overflow-hidden rounded-[22px] border border-[#dfe5dc] bg-white shadow-[0_16px_45px_rgba(55,74,58,0.06)]">
      <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)_130px_140px_36px] gap-4 border-b border-[#e9ede7] bg-[#f7f9f5] px-5 py-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[#7b857a] md:grid">
        <span>Company</span>
        <span>Role</span>
        <span>Status</span>
        <span>Applied</span>
        <span className="sr-only">Source</span>
      </div>

      <div className="divide-y divide-[#edf0eb]">
        {applications.map((application) => (
          <article
            className="grid gap-3 px-5 py-5 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)_130px_140px_36px] md:items-center md:gap-4 md:py-4"
            key={application.id}
          >
            <div className="min-w-0">
              <p className="truncate font-[family-name:var(--font-manrope)] text-sm font-semibold text-[#303a31]">
                {application.companyName}
              </p>
              <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.1em] text-[#929990] md:hidden">
                Company
              </p>
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm text-[#596258]">
                {application.roleTitle}
              </p>
              <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.1em] text-[#929990] md:hidden">
                Role
              </p>
            </div>
            <div>
              <StatusBadge status={application.status} />
            </div>
            <p className="text-xs text-[#727b71]">
              {formatDate(application.appliedAt)}
            </p>
            <div>
              {application.sourceUrl ? (
                <a
                  aria-label={`Open source for ${application.companyName}`}
                  className="grid size-9 place-items-center rounded-xl border border-[#e2e7df] text-[#657165] transition hover:border-[#bbc9b9] hover:text-[#294435]"
                  href={application.sourceUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  <ExternalLink size={15} />
                </a>
              ) : null}
            </div>
            {application.notes ? (
              <p className="text-xs leading-5 text-[#838a81] md:col-span-5">
                {application.notes}
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}
