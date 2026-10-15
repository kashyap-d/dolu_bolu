# 0019 — An agenda home screen

**Status:** Implemented

## Context
The command center showed a composer, a drive count, and the next four dates. The question a job seeker opens the app with is "what needs me next?", and the AGENTS.md brief asks for a calm command center, not vanity metrics.

## Decision
`buildAgenda` (pure, unit-tested) derives three groups from the user's drives. Closed drives never appear.
- **Loose ends:** a round whose time has passed but is still "scheduled", an OA deadline that passed while the OA is still invited or scheduled, an apply-by date that passed while the drive is still planned.
- **Next two weeks:** apply-by dates, OA windows and deadlines, and scheduled rounds, grouped by day in the viewer's time zone ("Today", "Tomorrow", then dates).
- **Gone quiet:** active drives past planning with no change in 21 days and nothing upcoming. This is a computed flag, not a stage: the user decides whether to follow up or close the drive.

The agenda depends on the viewer's clock and zone, so it renders only in the browser; the server sends a placeholder.

## Alternatives
- A "ghosted" stage: it would force a guess into stored data and need its own corrections.
- Notifications or email digests: useful later, but they are outbound messages and need separate consent.

## Consequences
The drive count and "to review" tiles are gone; pending proposals already appear right under the composer. Thresholds (14-day horizon, 21 days quiet) are constants in `agenda.ts`.
