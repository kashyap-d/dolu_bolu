/** Calendar-day helpers for date-only values (YYYY-MM-DD); see docs/decisions/0009. */

/** Today's calendar date in `timeZone`. */
export function calendarDate(instant: Date, timeZone: string) {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

export function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** The last moment of a calendar day in the runtime's local zone, for ordering against timestamps. */
export function endOfLocalDay(date: string) {
  return new Date(`${date}T23:59:59.999`).getTime();
}
