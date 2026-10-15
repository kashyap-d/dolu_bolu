# 0009 — Day-precision facts are dates

**Status:** Implemented

## Context
"Applied yesterday" is currently stored as yesterday at the current time, a precision the user never stated. The demo provider also computes relative days in UTC, which is wrong near midnight in Asia/Kolkata.

## Decision
- `appliedAt` and `applyBy` become `date` columns and `YYYY-MM-DD` strings in contracts.
- Scheduled events (OA windows, interviews) stay `timestamptz` with an explicit time zone.
- Relative dates resolve in the user's time zone.

## Consequences
- The migration converts existing values to the calendar date in each owner's profile time zone, without touching `updated_at` (tested in `tests/db/date-migration.test.ts`).
- The editor uses date inputs. A calendar date has no zone, but its wording depends on the viewer's locale ("17 Sep" vs "Sep 17"), which the server does not know. `LocalDate` therefore renders the ISO date on the server and switches to the browser's locale after hydration. An earlier version formatted on the server and caused hydration errors for en-IN browsers. `tests/local-date-time.test.tsx` now guards this, and the end-to-end suite fails on any console error.
- "Next important date" orders all-day values by the end of their day, so an apply-by date stays upcoming until the day is over.
- The deterministic provider resolves "yesterday" and "tomorrow" in the user's zone. Gemini is instructed to return these fields as plain dates.
- `stageOccurredAt` remains a timestamp. Revisit if users mostly know only the day.
