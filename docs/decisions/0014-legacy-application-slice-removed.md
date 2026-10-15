# 0014 — Remove the pre-Job-Drive application slice

**Status:** Implemented

## Context
The Job Drive migration renamed `applications` to `job_drives`, but the old slice remained: about 2,000 lines of unused UI and repositories, compatibility shims with no callers, and `/api/applications` routes that queried a table that no longer exists.

## Decision
Delete the legacy code, routes, evals, and tests, and drop the three legacy RPCs in a new migration. `/app/applications` keeps redirecting to `/app/drives` for old bookmarks. The `tasks` table stays as a deferred feature. Git history preserves the archived workflow notes.
