---
name: factory
description: Run one issue through the Factory, from intake to a pull request and a retro, stopping whenever it needs a person.
disable-model-invocation: true
argument-hint: "<issue number>"
---

# The Factory

You run issue `$ARGUMENTS` through the Factory's phases in the main session. The phase agents (`factory-*`) do the work; you start them one after another, check what each reports, keep the state in the issue and the pull request, and put every question to the person. You never merge, and you never answer a question for the person.

## Configuration

Read `.agents/factory.json` first. Everything about this repository comes from it; this skill writes its keys as `config.<key>`. Read `config.conventions` and the topic files it links to that touch a phase before you act on that phase. If the file is missing, the Factory isn't set up here: tell the person to run the `factory-setup` skill, and stop.

## Your coding agent

This skill names actions, not tools. Read `adapters/<config.codingAgent>/README.md` (in this skill's folder, for example [`adapters/claude-code/README.md`](adapters/claude-code/README.md)) before anything else: it says which of your tools does each action, and where the phase agents and hooks live.

- **Start an agent**: run a `factory-*` phase agent with a prompt, wait for it, and get its final message.
- **Continue an agent**: send a follow-up to an agent you started, so it keeps its context.
- **Ask the person**: put questions to the person and wait for the answers.
- **Enter a worktree** and **leave the worktree**, keeping it on disk. The adapter names the folder worktrees go in.

## State

The issue holds the run's state, so a run can stop and later resume in another session. Keep three comments on it, each found by the hidden marker on its first line and edited in place, never posted twice:

- `<!-- factory:run -->` **Run log**: the branch, the worktree, the phase reached, the Risk Tier, each Stop (phase, questions, answers, where each answer was recorded), the friction from every result, and, until the pull request exists, each review round's findings with their answers and the evidence gathered so far.
- `<!-- factory:research -->` **Research summary**: the questions and the researcher's answers.
- `<!-- factory:alignment-document -->` **Alignment Document**, with a status line: `Status: awaiting review`, then `Status: approved <date>`, and the approved Risk Tier, noting when the person set it.

Write every result to the run log before you move on or stop, so nothing lives only in the session. Once the pull request exists, review findings, their answers and the evidence go in it. Write no planning files.

**Resume**: if the run log exists, continue from the phase it names. The comments are the source of truth: the person may have edited them, so read them again rather than relying on what you remember.

## Checks

A phase is finished only when every artifact its result names exists. After each result, before the next phase:

- **Issue comment**: read it back from GitHub; it carries its marker and the artifact's content.
- **File**: it exists in the worktree, and the commit the result names contains it.
- **Commit**: it is on the run's branch (`git merge-base --is-ancestor <sha> HEAD`), its subject starts with `structural:`, `behavioural:` or `harness:`, and `git status` is clean.

When a check fails, send the phase back to its agent naming the failed check. When it fails a second time, it is a Stop.

## Starting a phase

Start the phase's agent. Its prompt holds what the agent's definition says it receives, and nothing more. Its last message is a `factory-result`:

- `## Result: done`: run the checks, record it in the run log, move on.
- `## Result: blocked`: record it in the run log; it is a Stop. Follow [`stops.md`](stops.md), then resume the same phase.

Update the run log's phase after each phase.

## Risk Tier

Work it out from the change as it stands: apply `config.riskTiers` to every path changed from the base (`git merge-base HEAD origin/<default branch>`); the first matching rule sets a path's tier, and the highest tier of any path is the minimum. The Risk Tier is the approved one, or this minimum if that is higher, with one exception: a tier the person set at the review keeps its value for the paths the Alignment Document planned. When the change reaches a path whose tier is higher than that, it is a Stop: ask the person which tier holds. Record the tier in the run log each time it changes.

## Phases

### 1. Intake

Read the issue: title, body, labels, state. Refuse to run, saying why, when:

- it is closed.
- it lacks the `config.labels.ready` label, or a section of `config.issueTemplate` (each `## ` heading) is missing or still holds only the template's placeholder. Add the `config.labels.needsInfo` label and comment what's missing, section by section.
- an issue it names after "Depends on" is still open. Tell the person which ones; change nothing on the issue.

When it passes, remove `config.labels.needsInfo` if present.

### 2. Worktree

Branch `factory/<issue>-<slug>`, the slug three or four words of the issue title in kebab case. Create the worktree in the adapter's worktree folder, from the default branch on origin: `git worktree add <worktree folder>/factory-<issue>-<slug> -b <branch> origin/<default branch>` (on resume, reuse it, or recreate it from the pushed branch), enter it, and run `config.setup` there. Every later phase runs in it. Post the run log.

### 3. Research

From the issue, write numbered questions about the code as it is today: what exists, where, how it is used, what patterns nearby code follows. Ask for facts only. Start `factory-researcher` with the questions alone: no issue, title, goal, acceptance criteria or plan. Post the Research summary.

### 4. Alignment Document

Start `factory-planner` with the issue and the Research summary. Post its artifact as the Alignment Document, `Status: awaiting review`.

A `blocked` result proposing a split ends the run once the person answers: on approval, file the split issues from `config.issueTemplate`, without `config.labels.ready` (only a person applies it), and link them from the issue.

### 5. The planned Stop: review of the Alignment Document

Stop here, before any test or code is written. Link the comment and ask the person to approve it, request changes, or change the Risk Tier. They may also edit the comment on GitHub. Changes requested: send them to the planner and edit the comment in place; ask again. Once approved, read the comment again and use its text from here on; set its status to approved. The person may end the session here; `/factory <issue>` resumes after approval.

### 6. Tests, first pass

Start `factory-test-writer` with the issue, the Alignment Document and "first pass". Check, in addition, that its commit changes only files matching `config.testFiles`.

### 7. Implementation

Start `factory-implementer` with the issue, the Alignment Document and the test commit. Check, in addition, that no file matching `config.testFiles` changed since the test baseline: the test commit, or a correction a Stop approved ([`stops.md`](stops.md)). Keep the baseline in the run log.

### 8. Tests, second pass

Start `factory-test-writer` with the issue, the Alignment Document, "second pass" and the last implementation commit.

### 9. Review

Work out the Risk Tier first; it decides the security review below. A round runs `factory-reviewer-spec`, then `factory-reviewer-standards`, one after the other because both commit to the worktree. Each gets the issue, the Alignment Document, the base and, from round two, every earlier finding with its answer.

- Every finding is fixed (a commit) or answered with a reason; keep the list for the pull request.
- **Findings in untouched code**: search the open issues for a duplicate; file the rest from `config.issueTemplate`, labelled `config.labels.preExisting`, and link them in the pull request.
- A round with no fix commits ends the review. After three rounds, stop and ask the person whether to run another round, accept the open findings, or take over.

Then work out the Risk Tier again, since fixes may have added paths. For High, start `factory-reviewer-security` with the issue, the Alignment Document and the base. Its fixes are commits like the other reviewers'; list its findings in the pull request with their answers, and file those in untouched code as above.

### 10. Verify

Run `config.validate` in the worktree. On failure, send the output to `factory-implementer` once; when it fails again, it is a Stop.

### 11. Pull request

Size: count the changed lines from the base; above `config.maxChangedLines`, say so in the pull request and why it wasn't split.

Risk Tier: work it out once more. If it rose to High after the security review was skipped, run it now, as in Review; when it commits fixes, run Verify again, so the pull request and its evidence describe the final commits.

Push the branch and open the pull request against the default branch, titled like the issue. Write its body with the `factory-pull-request` skill. Leave merging to a person: don't merge, approve or enable auto-merge.

### 12. Retro

Review the run: the run log, every result, the Stops, the review findings. Propose to the person, as three numbered lists:

1. **Harness log entries** for `config.harnessLog`'s entries table: what an agent got wrong or needed to be told, and the harness change that prevents it.
2. **Harness changes**: conventions, gotchas and checks for patterns the run used that aren't described yet, or that cost a Stop or a review finding. Prefer a check over a written rule. Say for each whether it belongs to this repository (its config, conventions or checks) or to the Factory itself (this skill, the agents, the hooks).
3. **Friction**: the friction from every result, deduplicated, each as a would-be issue.

Act only on what the person accepts:

- Small harness changes to this repository and the accepted log entries: `harness:` commits in this pull request.
- Bigger harness changes to this repository: issues from `config.issueTemplate`.
- Changes to the Factory itself: never edit its installed files, which the next update replaces. Open an issue in the repository the Factory was installed from (`skills-lock.json` names it), with what went wrong and the change you propose.
- Friction: search the issues for each first (open and closed); file the rest labelled `config.labels.friction`.

Fill in the run's row in the Factory runs table of `config.harnessLog`, following the column definitions above it; ask the person for their review minutes. Commit it as `harness:`.

When the retro changed more than the harness log, the reviewed change is no longer what goes out: run one more Review round on those commits, work out the Risk Tier again (with the security review if it is now High), and run `config.validate`. Push, and update the pull request's Risk Tier, Review and Evidence to the final commits. Update the run log to `retro done`, leave the worktree, and end with the pull request's link and what the person does next.
