"use client";

import { useIsClient } from "@/lib/use-is-client";

const formatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

/**
 * Formats a timestamp in the viewer's own time zone and locale. The server
 * knows neither, so it renders a placeholder and the browser fills it in,
 * avoiding both a hydration mismatch and a time shown in the wrong zone.
 */
export function LocalDateTime({
  value,
  fallback = "Unknown",
}: {
  value: string | null;
  fallback?: string;
}) {
  const isClient = useIsClient();
  if (!value) return <>{fallback}</>;
  return (
    <time dateTime={value}>
      {isClient ? formatter.format(new Date(value)) : "…"}
    </time>
  );
}

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" });

/**
 * A calendar date (YYYY-MM-DD). It has no time zone, but its *wording*
 * depends on the viewer's locale ("17 Sep 2026" vs "Sep 17, 2026"), which the
 * server does not know. The server and the hydrating client both render the
 * ISO date; the browser then switches to its own locale.
 */
export function LocalDate({ value, fallback = "Unknown" }: { value: string | null; fallback?: string }) {
  const isClient = useIsClient();
  if (!value) return <>{fallback}</>;
  return (
    <time dateTime={value}>
      {isClient ? dateFormatter.format(new Date(`${value}T00:00:00Z`)) : value}
    </time>
  );
}

/** Renders an ImportantDate-like value with the right precision. */
export function LocalWhen({ value, allDay }: { value: string; allDay: boolean }) {
  return allDay ? <LocalDate value={value} /> : <LocalDateTime value={value} />;
}
