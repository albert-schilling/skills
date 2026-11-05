# Pull requests

- Small pull requests: one issue each, about 300 changed lines at most, not counting lock files and generated files.
- Every change comes with tests.
- Commits are labelled `structural:` (tidying that changes no behaviour), `behavioural:` (the change itself) or `harness:` (conventions, checks and the harness log). A pull request may tidy only the code it is about to change, in a structural commit before the behavioural one; anything else it notices is filed as an issue.
- A pull request that changes what people see includes screenshots or output from the running thing.
- Before pushing a change to a CI workflow file, check that it parses and look at the CI run on that push: an invalid workflow starts no jobs.
- Add the harness log entries to [`docs/harness-log.md`](../harness-log.md) in the pull request that caused them, as a commit after it is opened, so the entry carries its number. Don't wait for the merge.
