import type { HTMLAttributes } from "react";

import { cx } from "@/lib/cx";

export function Card({
  raised = false,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & { raised?: boolean }) {
  return (
    <section
      className={cx(
        "rounded-3xl border border-line bg-surface",
        raised ? "shadow-raised" : "shadow-card",
        className,
      )}
      {...props}
    />
  );
}

/** Small uppercase label above headings and inside cards. */
export function Eyebrow({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cx("text-[11px] font-bold uppercase tracking-[0.16em] text-subtle", className)}
      {...props}
    />
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="mt-2 max-w-2xl font-display text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.08] tracking-[-0.05em] text-ink">
          {title}
        </h1>
        {description ? (
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="self-start sm:self-auto">{action}</div> : null}
    </header>
  );
}
