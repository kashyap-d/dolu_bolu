"use client";

import { cx } from "@/lib/cx";

import type { JobDrive, JobDriveStage } from "../contracts";
import {
  isTerminalStage,
  primaryJobDriveStages,
  stageLabel,
  terminalJobDriveStages,
} from "../stage-rules";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

export function StageBar({
  value,
  onSelect,
  disabled = false,
}: {
  value: JobDriveStage;
  onSelect?: (stage: JobDriveStage) => void;
  disabled?: boolean;
}) {
  const activeIndex = primaryJobDriveStages.indexOf(value);

  return (
    <div aria-label="Hiring stage" className="space-y-3" role="group">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {primaryJobDriveStages.map((stage, index) => {
          const current = stage === value;
          const complete = activeIndex >= 0 && index < activeIndex;
          return (
            <button
              aria-current={current ? "step" : undefined}
              className={cx(
                "min-h-14 rounded-xl border px-2 py-2 text-left transition",
                focusRing,
                current
                  ? "border-brand bg-brand text-white"
                  : complete
                    ? "border-success-line bg-success-soft text-success-ink"
                    : "border-line bg-surface text-subtle hover:border-line-strong",
              )}
              disabled={disabled}
              key={stage}
              onClick={() => onSelect?.(stage)}
              type="button"
            >
              <span className="block text-[10px] font-bold uppercase tracking-[0.12em] opacity-70">
                {index + 1}
              </span>
              <span className="mt-0.5 block text-xs font-semibold leading-4">{stageLabel(stage)}</span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        {terminalJobDriveStages.map((stage) => (
          <button
            aria-pressed={value === stage}
            className={cx(
              "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
              focusRing,
              value === stage
                ? "border-danger bg-danger text-white"
                : "border-danger-line bg-danger-soft text-danger-ink hover:border-danger",
            )}
            disabled={disabled}
            key={stage}
            onClick={() => onSelect?.(stage)}
            type="button"
          >
            {stageLabel(stage)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function StageBadge({ stage }: { stage: JobDrive["stage"] }) {
  const tone =
    stage === "accepted"
      ? "bg-success-soft text-success-ink"
      : isTerminalStage(stage)
        ? "bg-danger-soft text-danger-ink"
        : "bg-brand-soft text-brand-text";
  return (
    <span className={cx("inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold", tone)}>
      {stageLabel(stage)}
    </span>
  );
}
