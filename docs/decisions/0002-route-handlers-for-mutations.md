# 0002 — Route handlers for mutations

**Status:** Implemented (`src/server/http.ts`, `src/features/workspace/api-client.ts`)

## Context
Mutations need explicit outcomes: created, duplicate warning (409), version conflict (409), quota (429), provider failure (5xx). Server Actions remove fetch boilerplate but make those contracts implicit and harder to test, and other clients (a browser extension, mobile) may follow.

## Decision
Keep route handlers as the mutation API. Add:
- a server helper (`src/server/http.ts`) that does auth, JSON parsing, Zod validation, and error mapping once;
- a small typed browser client (`src/features/*/api-client.ts`) that parses responses with the shared schemas, so components never call `fetch` directly.

## Consequences
An explicit, testable HTTP contract. Handlers shrink to "parse → call service → map outcome".
