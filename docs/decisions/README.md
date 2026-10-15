# Architecture decisions

Short records of significant choices: the context, what we chose, what we rejected, and what it costs. A decision changes by adding a new record that supersedes the old one, never by silently editing history.

| # | Decision | Status |
|---|---|---|
| [0001](0001-typescript-only-stack.md) | TypeScript-only stack; Python only for a specific ML worker | Accepted |
| [0002](0002-route-handlers-for-mutations.md) | Route handlers for mutations, called through a typed client | Implemented |
| [0003](0003-supabase-user-scoped-access.md) | Supabase Auth/Postgres with RLS and user-scoped sessions | Accepted |
| [0004](0004-thin-transactional-sql-functions.md) | Thin transactional SQL functions; integrity in table constraints | Implemented |
| [0005](0005-generated-database-types.md) | Generated database types; Zod only for JSON and trust boundaries | Implemented |
| [0006](0006-ai-provider-boundary.md) | One provider boundary, Gemini over `fetch`, schema derived from Zod | Implemented |
| [0007](0007-ai-cost-and-demo-safety.md) | Daily AI quota; the preview never reaches a hosted model | Implemented |
| [0008](0008-one-proposal-per-message.md) | Exactly one proposal per message | Implemented |
| [0009](0009-date-only-fields.md) | Day-precision facts are stored as dates | Implemented |
| [0010](0010-target-user-and-naming.md) | Early-career job seekers in India; keep "Job Drive" | Accepted |
| [0011](0011-ui-tokens-and-primitives.md) | Tailwind with enforced tokens and a few primitives | Implemented |
| [0012](0012-testing-ci-hosting.md) | Test layers, GitHub Actions CI, Vercel hosting | Implemented except hosting |
| [0013](0013-data-export-and-deletion.md) | Data export and account deletion ship in V1 | Implemented |
| [0014](0014-legacy-application-slice-removed.md) | Remove the pre-Job-Drive application slice | Implemented |
| [0015](0015-workspace-gateway.md) | Views depend on a gateway and navigation abstraction; the server re-render is the source of truth | Implemented |
| [0016](0016-database-tests-on-plain-postgres.md) | Database tests and type generation on plain Postgres with a Supabase shim | Implemented |
| [0017](0017-matching-and-model-context.md) | Normalised name matching, no fuzzy merging, relevance-based model context | Implemented |
| [0018](0018-interview-rounds.md) | Interview rounds as a list; the AI proposes one round, merged deterministically | Implemented |
| [0019](0019-agenda-home.md) | An agenda home: loose ends, next two weeks by day, drives gone quiet | Implemented |
