# 0018 — Interview rounds as a list

**Status:** Implemented (`20261016010000_interview_rounds.sql`)

## Context
v1 showed one "consolidated interview phase" with a free-text round summary. For the target user (0010) the rounds are the process: online test, technical rounds, a manager round, HR. Each has its own time, link, and outcome. The `interviews` table already allowed several rows per drive.

## Decision
- A drive owns up to 10 rounds. Each has `title`, `kind` (recruiter, technical, manager, hr, onsite, other), `status` (scheduled, completed, cancelled), time and time zone, mode, location, link, and notes.
- Payloads carry the drive's **complete** list of rounds. The write function upserts by round id and deletes rounds that are no longer listed, in the same transaction as the drive. A round id that belongs to another user or drive is rejected.
- The AI proposes **one** round, the one the message is about, with no id. `mergeProposedRound` folds it into the existing rounds: it updates a round with the same title, or the only scheduled round of the same kind, and otherwise adds one. Values the message did not state are kept. The review card shows the resulting list, so the user confirms the exact end state.
- Existing interviews became rounds titled "Interview"; their old round summary moved into the notes.

## Alternatives
- Letting the model edit the whole list: more freedom to delete or reorder rounds by mistake, and harder to review.
- Separate create/update/delete actions per round: more proposal kinds than v1 needs (0008).

## Consequences
The "next important date" and the agenda consider every scheduled round. Calendar sync, when it comes, can attach to a single round.
