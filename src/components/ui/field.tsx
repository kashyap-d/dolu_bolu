import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

import { cx } from "@/lib/cx";

function controlClasses(invalid: boolean, className?: string) {
  return cx(
    "mt-1.5 w-full rounded-xl border bg-surface px-3 text-sm text-ink outline-none transition",
    "placeholder:text-subtle focus:ring-2 focus:ring-brand-ring",
    invalid ? "border-danger" : "border-line-strong focus:border-brand-text",
    className,
  );
}

export function Field({
  label,
  optional = false,
  error,
  className,
  children,
}: {
  label: string;
  optional?: boolean;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cx("block text-xs font-semibold text-muted", className)}>
      {label}
      {optional ? <span className="font-normal text-subtle"> (optional)</span> : null}
      {children}
      {error ? <span className="mt-1 block text-[11px] text-danger-ink">{error}</span> : null}
    </label>
  );
}

export function TextInput({
  invalid = false,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input aria-invalid={invalid || undefined} className={controlClasses(invalid, cx("h-11", className))} {...props} />;
}

export function TextArea({
  invalid = false,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={controlClasses(invalid, cx("min-h-20 resize-y py-2.5 leading-5", className))}
      {...props}
    />
  );
}

export function Select({
  invalid = false,
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return <select aria-invalid={invalid || undefined} className={controlClasses(invalid, cx("h-11", className))} {...props} />;
}
