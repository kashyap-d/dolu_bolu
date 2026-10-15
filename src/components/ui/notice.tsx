import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

type Tone = "neutral" | "success" | "attention" | "danger";

const tones: Record<Tone, string> = {
  neutral: "border-line bg-surface-muted text-ink-soft",
  success: "border-success-line bg-success-soft text-success-ink",
  attention: "border-accent-line bg-accent-soft text-accent-ink",
  danger: "border-danger-line bg-danger-soft text-danger-ink",
};

export function Notice({
  tone = "neutral",
  title,
  children,
  className,
  role,
}: {
  tone?: Tone;
  title?: string;
  children: ReactNode;
  className?: string;
  role?: "alert" | "status";
}) {
  return (
    <div className={cx("rounded-2xl border p-4 text-sm leading-6", tones[tone], className)} role={role}>
      {title ? <p className="font-semibold">{title}</p> : null}
      <div className={title ? "mt-0.5" : undefined}>{children}</div>
    </div>
  );
}
