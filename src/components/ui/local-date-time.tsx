"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

const formatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

/**
 * Formats a timestamp in the viewer's own time zone. The server does not know
 * that zone, so it renders a placeholder and the browser fills it in —
 * avoiding both a hydration mismatch and a time shown in the wrong zone.
 */
export function LocalDateTime({
  value,
  fallback = "Unknown",
}: {
  value: string | null;
  fallback?: string;
}) {
  const isClient = useSyncExternalStore(subscribe, () => true, () => false);
  if (!value) return <>{fallback}</>;
  return (
    <time dateTime={value} suppressHydrationWarning>
      {isClient ? formatter.format(new Date(value)) : "…"}
    </time>
  );
}

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" });

/**
 * A calendar date (YYYY-MM-DD). It has no time zone, so it renders the same
 * on the server and in the browser.
 */
export function LocalDate({ value, fallback = "Unknown" }: { value: string | null; fallback?: string }) {
  if (!value) return <>{fallback}</>;
  return <time dateTime={value}>{dateFormatter.format(new Date(`${value}T00:00:00Z`))}</time>;
}

/** Renders an ImportantDate-like value with the right precision. */
export function LocalWhen({ value, allDay }: { value: string; allDay: boolean }) {
  return allDay ? <LocalDate value={value} /> : <LocalDateTime value={value} />;
}
