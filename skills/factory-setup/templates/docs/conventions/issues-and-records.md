# Issues and decision records

- Decision records (ADRs, issues and the like) name tools, not versions; the lockfile pins versions. State a minimum only when a decision depends on it.
- Issues follow [`.github/ISSUE_TEMPLATE/task.md`](../../.github/ISSUE_TEMPLATE/task.md): Goal, Context, Acceptance criteria, Out of scope and How to verify. Context cites the decisions an issue rests on; "Depends on" names issues that must be merged first.

## Labels

- `ready-for-agent`: a person has checked the issue is complete and the Factory may take it. Only a person applies it.
- `needs-info`: the issue is missing a section or an answer; the Factory stopped on it.
- `friction`: a papercut an agent hit but didn't fix, because it was outside the issue.
- `pre-existing`: a problem a reviewer found in code the pull request didn't change.
