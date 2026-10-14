# 0015 — Workspace gateway and navigation

**Status:** Implemented

## Context
One 330-line client component rendered the shell and all three views, with a `persistent ? … : …` branch at every link and write, so that the no-sign-in preview could share the UI. Every route also re-fetched every drive and proposal.

## Decision
- `src/app/app/layout.tsx` owns authentication and the shell. Each page loads only what it renders.
- Views write through a `WorkspaceGateway` interface (`useGateway()`) and navigate through `WorkspaceLink`.
- The signed-in gateway calls the typed API client and then `router.refresh()`. **The re-rendered server data is the source of truth**: there is no client-side copy of drives to drift from the database. Views keep only small amounts of transient state (a just-created proposal shows immediately; a resolved one hides immediately).
- The preview gateway keeps state in memory and uses state-based navigation. It applies the same matching and non-regression rules client-side, because the server has no stored drives to match against in preview.

## Alternatives
- Removing the preview: simpler, but it loses a no-account way to try the product.
- A client store (Zustand or similar) as the source of truth: duplicates the database and needs cache invalidation for little benefit at this scale.

## Consequences
Views have no mode branches. After a write there is one server round-trip before lists update. Activity shown in the signed-in app is always the database's, never synthesised.
