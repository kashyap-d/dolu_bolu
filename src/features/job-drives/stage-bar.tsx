"use client";

import {
  primaryJobDriveStages,
  stageLabel,
  terminalJobDriveStages,
} from "@/features/job-drives/stage-rules";
import type { JobDriveStage } from "@/features/job-drives/contracts";

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

  function select(stage: JobDriveStage) {
    if (!disabled) onSelect?.(stage);
  }

  return (
    <div aria-label="Job Drive stage" className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {primaryJobDriveStages.map((stage, index) => {
          const current = stage === value;
          const complete = activeIndex >= 0 && index < activeIndex;
          return (
            <button
              aria-current={current ? "step" : undefined}
              className={`group relative min-h-14 rounded-xl border px-2 py-2 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#294435] ${
                current
                  ? "border-[#294435] bg-[#294435] text-white"
                  : complete
                    ? "border-[#bfd0be] bg-[#e9f1e7] text-[#355440]"
                    : "border-[#dfe5dc] bg-white text-[#788078] hover:border-[#b9c8b7]"
              }`}
              disabled={disabled}
              key={stage}
              onClick={() => select(stage)}
              type="button"
            >
              <span className="block text-[10px] font-bold uppercase tracking-[0.12em] opacity-70">
                {index + 1}
              </span>
              <span className="mt-0.5 block text-xs font-semibold leading-4">
                {stageLabel(stage)}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        {terminalJobDriveStages.map((stage) => (
          <button
            aria-pressed={value === stage}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#294435] ${
              value === stage
                ? "border-[#95685e] bg-[#95685e] text-white"
                : "border-[#e2d8d4] bg-[#faf5f3] text-[#815e56] hover:border-[#c8aaa3]"
            }`}
            disabled={disabled}
            key={stage}
            onClick={() => select(stage)}
            type="button"
          >
            {stageLabel(stage)}
          </button>
        ))}
      </div>
    </div>
  );
}
