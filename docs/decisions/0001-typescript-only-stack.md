# 0001 — TypeScript-only stack

**Status:** Accepted

## Context
The app layer is thin: authenticate, validate, call one model over HTTP, and hand transactional writes to Postgres. One Zod schema currently validates HTTP input, model output, the editor form, and confirmation responses.

## Decision
Build the product in TypeScript end to end (Next.js + Supabase). Do not add a Python backend.

A Python service is acceptable only for a specific ML capability TypeScript serves poorly (for example PDF/OCR extraction, embeddings, or a trained classifier). It must sit behind a narrow, schema-validated interface or job queue and must not own domain writes.

## Alternatives
- **Next.js + FastAPI:** doubles deploys, CI, and auth plumbing, and needs Pydantic↔TypeScript contract syncing, for no capability we use today.
- **Full Python (Django/FastAPI + separate SPA):** loses shared schemas and Supabase's TypeScript-first SSR auth.

## Consequences
One toolchain and one deploy; shared domain types. Revisit when paste-to-extract or semantic matching outgrows a single model call.
