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
