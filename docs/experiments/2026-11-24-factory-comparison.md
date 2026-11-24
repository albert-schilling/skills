# Experiment: the Factory against simpler setups

Run on 2026-11-24 in [Flashcards](https://github.com/albert-schilling/flashcards), with the Factory at version `a7bb9f00`. The full plan and results are in Flashcards: [plan](https://github.com/albert-schilling/flashcards/blob/main/docs/experiments/factory-comparison.md), [results](https://github.com/albert-schilling/flashcards/blob/main/docs/experiments/factory-comparison-results.md), and the [script](https://github.com/albert-schilling/flashcards/blob/main/scripts/session-usage.mjs) that measured tokens, cost and time.

## Question

Does the Factory's result justify its time and tokens, compared with simpler ways of using the same agent?

## Method

One issue, [#58](https://github.com/albert-schilling/flashcards/issues/58) (a Card editor: UI and logic, following a prototype), implemented up to an open pull request by each setup:

| Setup | What it is                                                                                     | Pull request                                                             |
| ----- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1     | The Factory as installed: orchestrator, planner, test writer and reviewers on Opus; researcher and implementer on Sonnet | [#124](https://github.com/albert-schilling/flashcards/pull/124) (merged) |
| 2     | The Factory with every agent and the orchestrator on Sonnet                                    | [#123](https://github.com/albert-schilling/flashcards/pull/123)          |
| 3     | One Opus agent following the Factory's phases, without sub-agents                              | [#121](https://github.com/albert-schilling/flashcards/pull/121)          |
| 4     | One Opus agent, plain prompt ("Implement issue #N and open a pull request")                    | [#120](https://github.com/albert-schilling/flashcards/pull/120)          |
| 4b    | Setup 4 again, with the `Skill` and `Agent` tools denied                                       | [#125](https://github.com/albert-schilling/flashcards/pull/125)          |

Setup 4 didn't stay plain: the repository's instructions point to the Factory, so Opus started it on its own and ran every phase. It was kept as a second Factory sample, and 4b reran the plain setup with the Factory blocked.

- **Same start:** every setup began from the same commit, in its own worktree and fresh headless session (`claude -p`, `auto` permission mode), with its own copy of the issue, one after another.
- **No person:** every prompt ended with the same instruction to decide at each Stop with the recommended option, record why, and go on, and `AskUserQuestion` was denied. So the Factory ran without its Stops.
- **Measured:** wall clock, tokens by kind and model, cost at API prices, new tests and whether they fail without the code, CI.
- **Judged:** three fresh Opus sessions reviewed all five diffs blind, as A to E in different orders, with a seven-criteria rubric (correctness, design, readability, tests, conventions, prototype fidelity, scope). Must-fix findings were then checked in the code.

## Results

| Setup                    | Wall clock | Cost   | New tests | Mean score | Mean rank | Must-fix                                              |
| ------------------------ | ---------- | ------ | --------- | ---------- | --------- | ----------------------------------------------------- |
| 1, Factory on Opus       | 33 min     | $9.35  | 77        | 4.43       | 1.3       | none                                                  |
| 4b, plain Opus           | 12 min     | $4.09  | 43        | 4.10       | 2.7       | none                                                  |
| 4, Factory (self-chosen) | 34 min     | $9.47  | 81        | 4.14       | 3.0       | none                                                  |
| 3, phases, one agent     | 15 min     | $4.88  | 52        | 4.00       | 3.7       | The ID `"new"` doubles as "create" and breaks Create Card |
| 2, Factory on Sonnet     | 24 min     | $13.56 | 108       | 3.48       | 4.3       | Lesson and texts stored untrimmed, behind a test whose name says otherwise |

All five finished alone with CI passing. All five came out at 1,000 to 1,900 changed lines; the issue was too big for one pull request whatever the setup.

## What it suggests

- **The Factory on Opus wrote the best change**, ranked first by two of three reviewers with no must-fix, for about twice the cost and two to three times the time of one agent.
- **A plain Opus agent came close:** second, no must-fix, 44% of the cost and 36% of the time.
- **Sonnet everywhere is worse and dearer.** Setup 2 scored lowest, had a real bug, and cost the most, because it re-read about four times as much context (47 million cached tokens against 12 million).
- **The phases alone don't carry the value.** One agent following them (setup 3) cost as much as the plain agent, scored lower and had a bug. Whatever the Factory adds seems to come from separate agents with fresh contexts, such as the reviewers, not from the order of the steps.
- **Two Factory runs on Opus differed** (mean ranks 1.3 and 3.0). With one run per setup, the noise is about as large as the differences.

## Limits

- One issue and one run per setup. Treat the results as a lead, not a verdict.
- No Stops: the Factory ran without the person, one of its main safeguards.
- The reviewers read code only; they didn't run it or see screenshots. All were Opus.

## Next

- Keep the strong tier on Opus; don't put every agent on the fast tier.
- Compare setups 1 and 4b on two or three more issues, each small enough for one pull request, to see whether the Factory's lead holds.
