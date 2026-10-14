# 0009 — Day-precision facts are dates

**Status:** Planned

## Context
"Applied yesterday" is currently stored as yesterday at the current time, a precision the user never stated. The demo provider also computes relative days in UTC, which is wrong near midnight in Asia/Kolkata.

## Decision
- `appliedAt` and `applyBy` become `date` columns and `YYYY-MM-DD` strings in contracts.
- Scheduled events (OA windows, interviews) stay `timestamptz` with an explicit time zone.
- Relative dates resolve in the user's time zone.

## Consequences
A migration converts existing values in the user's profile time zone. The editor uses date inputs for these fields.
