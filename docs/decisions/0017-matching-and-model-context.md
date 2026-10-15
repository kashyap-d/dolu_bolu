# 0017 — Name matching and model context

**Status:** Implemented

## Context
Matching compared exact lower-cased strings, so "Globex Pvt. Ltd." and "globex" became two drives. The model received the 20 most recently updated drives, whether or not the message was about them.

## Decision
- **Normalisation.** Company names drop case, punctuation, a leading "the", and trailing legal suffixes (Pvt Ltd, Inc, LLC, …). Role titles expand sr/jr/swe/sde but keep levels ("SDE 1" ≠ "SDE 2"). Names with no ASCII letters keep their original form. SQL (`normalize_company_name`, `normalize_role_title`) and TypeScript (`src/features/job-drives/normalize.ts`) implement the same rules; a database test checks they agree.
- **No fuzzy matching.** Edit distance or embeddings would merge genuinely different companies. Close-but-different names are left for the user, who sees duplicate warnings and can open the existing drive.
- **Model context.** `selectModelContext` sends only drives at companies the message names (whole-word, after normalisation). If none are named, it sends up to 10 recent active drives so a vague update can still be matched or clarified. Closed drives are only sent when named.

## Consequences
Fewer accidental duplicates and less personal data sent per request. The candidate pool is still the 100 most recently updated drives; a server-side search by normalised company (indexed by `job_drives_user_company_key_idx`) is the next step if users exceed that.
