# 0013 — Data export and account deletion

**Status:** Planned

## Decision
The product claims to be private by design, so V1 lets users export all their data (JSON) and delete their account. Deletion cascades through `auth.users` foreign keys and is confirmed explicitly in the UI.

## Consequences
Every new user-owned table must cascade on user deletion and be included in the export.
