# Stops

A Stop is a `blocked` result, a check that failed twice, or a limit of the run (three review rounds, `validate` failing twice). The agents can't ask the person, so you do. Every answer is recorded where the next run will find it, so the same question isn't asked twice.

## 1. Ask

Ask the person each question, the agent's recommended answer first and marked as recommended; the person may write their own. Ask all the questions of one result together, and say which phase stopped and what it has finished.

## 2. Record

Decide for each answer where it belongs, then write it there:

| The answer is about                                                  | Record it in                                                                                                                                  |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| this issue only (a detail of its scope or behaviour)                 | the run log's Stops, and the issue body when it changes what the issue asks for                                                               |
| how code, tests or files are written here (naming, tests, structure) | the conventions topic file for that subject, linked from `config.conventions`; a new topic file, linked from it, when none fits               |
| the product or the domain (a term, a rule, an architecture decision) | `config.glossary` for a term; otherwise the decision record in `config.decisionRecords` that holds such decisions, or a new one if it is big |
| how the Factory itself works (a phase, an agent, a hook)             | an issue in the repository the Factory was installed from, as in the retro; the run log says how this run went on meanwhile                  |

Recording in a file is a `harness:` commit on the run's branch. When it is unclear where an answer belongs, ask the person as part of the same Stop. Add the Stop to the run log either way: phase, questions, answers, and where each was recorded (comment link, file, commit).

## 3. Resume

When the person agrees that a test is wrong, the implementer can't fix it: its hook denies test edits. Start `factory-test-writer` with the issue, the Alignment Document, the test, and the correction as the person decided it; check its commit as in the first pass. That commit is the new test baseline: from here, phase 7's check compares against it. Then resume the implementer, naming the commit.

Otherwise continue the same agent with the answers, so it keeps its context, naming where each was recorded. If the agent is gone (a new session), start the phase again with its original prompt plus the answers. Then run the checks as for any result.

If the person decides to end the run instead, set the run log's phase to `stopped`, with the reason, and leave the worktree.
