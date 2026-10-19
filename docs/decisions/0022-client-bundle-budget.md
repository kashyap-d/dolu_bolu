# 0022 — Client bundle budget

**Status:** Implemented

## Context
The largest browser chunk was 88.6 KB gzipped (386 KB raw), bigger than React DOM's, and it was mostly Zod. `import { z } from "zod"` imports one object that holds the whole library, so the bundler kept all of Zod's translated error messages (about 40 languages) even though the app never uses them. On a slow mobile connection that cost seconds, and it once stalled the end-to-end tests on a cold server.

## Decision
- Import Zod as a namespace, `import * as z from "zod"`, as Zod recommends for tree-shaking. A lint rule rejects `import { z }`.
- `npm run check:bundle`, run in CI after the build, fails when:
  - total client JavaScript exceeds 290 KB gzipped, or the largest chunk exceeds 75 KB;
  - a chunk contains Zod locale messages, the Gemini adapter, or names of server-only database functions.

## Alternatives
- `zod/mini`: smaller still (it drops the method-chaining API), but every shared schema would need rewriting, for a few more KB.
- Removing Zod from the browser: the editor's instant field errors and response checks use the same schemas as the server, which AGENTS.md asks for.

## Consequences
Client JavaScript went from 327 KB to 270 KB gzipped (−18%); Zod's chunk went from 88.6 KB to 30.7 KB. The budget has about 20 KB of headroom; raising it should be a deliberate change to this record, not a quiet edit.
