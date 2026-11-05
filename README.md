# Skills

Agent skills by Albert Schilling. So far, one set: **the Factory**, an agent workflow that turns an issue into a pull request through fixed phases, stops whenever it needs a person's decision, and records every answer so the same question isn't asked twice. It aims to produce trust and quality, not only features.

The Factory is **experimental**. It is in use in [Bardery](https://github.com/albert-schilling/bardery) and [Poligent](https://github.com/albert-schilling/poligent), and changes as their runs show what's missing. The decisions behind it are recorded in Bardery: [grilling session 3](https://github.com/albert-schilling/bardery/blob/main/docs/grilling/2026-11-04-factory-session.md) (its shape) and [session 4](https://github.com/albert-schilling/bardery/blob/main/docs/grilling/2026-11-05-factory-extraction.md) (this repository), with the [research](https://github.com/albert-schilling/bardery/blob/main/docs/research/2026-10-21-software-factory.md) they rest on.

## Install

In the repository you want to use it in:

```bash
npx skills add albert-schilling/skills --skill '*'
```

Then, in your coding agent, run `/factory-setup`. It reads the repository, asks you what it can't find out, and does the rest: the config, the starting conventions, the phase agents and hooks, and the labels. To start a run, label an issue `ready-for-agent` and run `/factory <issue>`.

After `npx skills update`, run `/factory-setup` again so the installed agents and hooks match the skills.

Requirements:

- A coding agent the Factory has an adapter for: today, Claude Code. With another one, `/factory-setup` says what's missing, can set up everything else, and files an issue here.
- Node 22 or newer, for the hooks and the installer.
- A GitHub repository, with the `gh` CLI for reading and writing issues and pull requests.

## How a run works

`/factory <issue>` runs in the main session and starts one phase agent after another. A person reviews the plan before any code exists, and merges at the end; the agents never merge.

1. **Intake**: the issue has the `ready-for-agent` label, every section of the issue template, and no open "Depends on".
2. **Worktree**: one branch and worktree per issue.
3. **Research**: facts about the code, from questions that don't reveal the issue.
4. **Alignment Document**: design, structure outline, test plan and Risk Tier, posted on the issue.
5. **Stop**: the person approves the Alignment Document.
6. **Tests**, before the code, at the agreed seams.
7. **Implementation**, which can't change the tests.
8. **Tests, second pass**, for what the code does beyond them.
9. **Review**: spec and standards reviewers, up to three rounds; a security reviewer for High Risk Tier.
10. **Verify**: `validate`, the one command that runs what CI runs.
11. **Pull request**, with evidence, Risk Tier and merge danger.
12. **Retro**: harness log entries, harness changes and friction, filed only with the person's agreement.

Any phase can stop with numbered questions instead of guessing. The orchestrator asks the person and records each answer where it belongs (the issue, a conventions file, the glossary or a decision record), then resumes.

## The pieces

| Skill                                                                | What it is                                                                                                                                       |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`factory`](skills/factory/SKILL.md)                                 | The orchestrator: `/factory <issue>`. Also holds [the Stops](skills/factory/stops.md), the agents, the hooks, the adapters and the config schema. |
| [`factory-result`](skills/factory-result/SKILL.md)                   | The result every phase agent ends with: `done` with its artifact, or `blocked` with questions and a recommended answer for each; plus friction. |
| [`factory-pull-request`](skills/factory-pull-request/SKILL.md)       | The body of the pull requests the Factory opens.                                                                                                 |
| [`factory-setup`](skills/factory-setup/SKILL.md)                     | `/factory-setup`: installs and updates the Factory in a repository, with [its installer](skills/factory-setup/scripts/install.mjs) and [starting files](skills/factory-setup/templates/). |

The phase agents, in [`skills/factory/agents/`](skills/factory/agents/), are written once in a neutral format (a model tier, an effort, read or write access, and the hooks they need). `factory-setup` renders them for the coding agent in use.

| Agent                        | Phase                                                      | Model tier, effort |
| ---------------------------- | ---------------------------------------------------------- | ------------------ |
| `factory-researcher`         | Research: facts with file references, no opinions          | fast, low          |
| `factory-planner`            | The Alignment Document, or a proposed split                | strong, high       |
| `factory-test-writer`        | Tests before implementation, and the second pass           | strong, high       |
| `factory-implementer`        | The code; a hook stops it from changing test files         | fast, medium       |
| `factory-reviewer-spec`      | Does it do what the issue says, and nothing more?          | strong, high       |
| `factory-reviewer-standards` | Conventions, design red flags, test quality, test cheating | strong, high       |
| `factory-reviewer-security`  | Access, input, secrets, personal data, model calls         | strong, high       |

The hooks, in [`skills/factory/hooks/`](skills/factory/hooks/), keep their logic apart from any coding agent; each adapter has a thin wrapper:

- **Test-file guard** (`test-files.mjs`): denies the implementer's edits and shell commands that would change a file matching `testFiles`, and tells it to stop and report the test instead.
- **End-of-turn check** (`validate.mjs`): runs `validate`; while it fails, the agent's turn can't end.

## Configuration

Each project has `.agents/factory.json`; [`factory.schema.json`](skills/factory/factory.schema.json) describes every key, and `factory-setup` writes the first version. In short:

| Key               | What it is                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| `codingAgent`     | The coding agent, which picks the adapter (`claude-code`).                                     |
| `conventions`     | The entry point to the conventions, usually `AGENTS.md`, linking one topic file per subject.   |
| `glossary`        | The file defining the domain's terms.                                                          |
| `decisionRecords` | Where decisions live (ADRs and other records).                                                 |
| `issueTemplate`   | The issue template intake checks issues against.                                               |
| `setup`           | What a fresh worktree needs before the checks run, or empty.                                   |
| `validate`        | The one command that runs what CI runs; the Stop hook runs it after every turn.                |
| `maxChangedLines` | The size of one pull request.                                                                  |
| `harnessLog`      | The file with the harness log's entries and Factory runs tables.                               |
| `labels`          | The names of the four labels: ready, needs info, friction, pre-existing.                       |
| `testFiles`       | Globs of every file whose change can make a failing test pass.                                 |
| `riskTiers`       | Path rules for the minimum Risk Tier; the first matching rule sets a path's tier.              |

The project owns everything `factory-setup` writes into it (the config, the conventions, the issue template, the harness log) and grows it from its runs. The Factory's own files stay as installed; a retro proposes changes to them as issues here. For Claude Code's gotchas (workspace trust for agent hooks, the `skills:` preload), see [its adapter](skills/factory/adapters/claude-code.md).

## Terms

- **Alignment Document**: the Factory's plan for one issue, reviewed by a person before any code is written. A comment on the issue.
- **Stop**: a point where the Factory pauses for a person: planned at the Alignment Document, or raised by any phase that meets an open question.
- **Risk Tier**: high, medium or low, set by the change's paths and raised by the planner. It decides whether a person reads the code.
- **Friction**: a papercut an agent hit but didn't fix because it was outside its issue, filed as an issue.

## Working on the Factory

The tests check the pieces, not a project, so they run only here: `node --test`, also in CI. Nothing to install.

They check that the hooks behave, that the installer renders agents and hooks and keeps a project's files, and that the pieces name no project, call no skill from outside this repository, name a coding agent's tools only in its adapter, and refer only to config keys and files that exist.

## License

[AGPL-3.0-only](LICENSE).
