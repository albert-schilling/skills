---
name: factory-setup
description: Set up the Factory in this repository, or bring an existing setup up to date after the Factory's skills were updated. Writes .agents/factory.json and the starting conventions, installs the phase agents and hooks for the coding agent in use, and creates the labels.
disable-model-invocation: true
---

# Set up the Factory

You set up the Factory in the repository you're working in, so that `/factory <issue>` can run here. The person should have nothing to do by hand: find out what you can from the repository, ask about the rest, and do every step yourself. Run again later, this skill brings the installed agents and hooks up to date and changes nothing the project owns without asking.

This is a prompt-driven skill, not a script: explore, say what you found, confirm with the person, then write. Next to this skill, [`templates/`](templates/) holds the starting files, at the paths they get in a project. The Factory's own skill (`../factory/`) holds the config schema `factory.schema.json` and, for each coding agent, an adapter folder (`adapters/<agent>/`) with the files to install.

## 1. The coding agent

Find out which coding agent runs this session: you know which tools you have (Claude Code has `Agent`, `AskUserQuestion` and hooks in `.claude/settings.json`); when you can't tell, ask. The Factory has an adapter for: `claude-code`.

For any other coding agent, tell the person what the Factory needs that the adapter would provide: sub-agents with their own instructions and tools, a way to ask the person, a hook before each file edit or shell command (the implementer's test-file guard), and a hook at the end of each turn (`validate`). Offer to continue: the conventions, the config, the templates and the labels work without an adapter, and `/factory` can't run until one exists. If the person continues, set `codingAgent` to the closest supported value, and file an issue in the repository the Factory was installed from (see step 6) titled "Support <coding agent> in the Factory", saying which of those four it has and where its documentation describes them. Without `gh`, add a harness log entry saying the coding agent is unsupported and needs investigating.

## 2. Read the repository

Before asking anything, find out:

- **Stack**: languages, build tools, package managers, test frameworks (look at manifests and lockfiles: `package.json`, `pom.xml`, `build.gradle*`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `nx.json`, and the CI workflows).
- **The existing checks**: what CI runs, and whether one command runs all of it (a `validate` script, a `make check`). That command is `validate`.
- **Setup**: the command a fresh clone needs before the checks run (installing dependencies), or none.
- **Tests**: where the tests, test helpers, fixtures, snapshots and test runner configs live. Every file whose change can make a failing test pass belongs in `testFiles`: for example `**/*.test.ts`, `**/*.spec.ts`, `**/__snapshots__/**`, `**/vitest.config.ts` for TypeScript; `**/src/test/**` for Maven and Gradle; `**/test_*.py`, `**/conftest.py` for Python. When the project has no tests yet, use the globs its stack will use.
- **Docs**: the agent instructions (`AGENTS.md`, `CLAUDE.md` and whether one links to or is a link to the other), the glossary (`GLOSSARY.md`, `CONTEXT.md`, …), the decision records (`docs/adr/`, …), an existing issue template, existing conventions files.
- **Risk-tier paths**: the paths of each High category in `factory.schema.json` (`riskTiers`) that exist here, or that the project's decision records say will exist.
- **Existing labels**: `gh label list`, when `gh` works.

## 3. Ask the person

Ask, in one round, only what the repository didn't answer, each question with your recommended answer first. Typical ones:

- the `validate` command, when there is no single command yet (recommend `./scripts/validate.sh` from the templates, which passes until checks are added);
- paths of High Risk Tier categories you couldn't place, or would place differently from the schema's list;
- label names, when the project already uses other names for the same purposes (a `ready-for-agent` under another name, for example);
- whether to keep an existing file that differs from its template (an issue template with other sections, for example). The Factory needs its issue template's `## ` sections to be the ones issues fill in.

## 4. Scaffold and configure

For each file in [`templates/`](templates/) (including `templates/.agents/` and `templates/.github/`), copy it to the same path in the project when the project has no file there. Never overwrite one; note which you created and which you kept. Make `scripts/validate.sh` executable.

Then edit what you created, and nothing you kept unless the person agreed:

- `.agents/factory.json`: every key, from steps 2 and 3. Point `$schema` at `factory.schema.json` relative to the config (`skills/factory/factory.schema.json` when the skills are in `.agents/skills/`). Put the paths you found into the High rule of `riskTiers`, before the low and catch-all rules.
- `AGENTS.md`: when the project had one, add the template's _Conventions_ section to it instead, adjusted to the project's `validate` command, and link the project's glossary and decision records under _Where decisions live_ if it doesn't yet. When it had none, fill in the template's placeholders. When `CLAUDE.md` exists and isn't a link to `AGENTS.md`, make sure it links to it.
- The conventions files: adjust their commands and paths to the project; leave the rules as they are. Stack-specific conventions come later, when a run stops on them.
- `docs/harness-log.md`: when the project already had a harness log, add the _Factory runs_ section from the template if it lacks it.
- `scripts/validate.sh`: when `validate` is another command, delete it.

Then check `.agents/factory.json` against `factory.schema.json`, and fix each problem before you go on:

- every key in `required` is there, and no key the schema doesn't define;
- `codingAgent` is one the schema lists, and `validate` is a command;
- `testFiles` is a list of at least one glob, each a string, and together they match every test file that exists (`git ls-files`). A wrong value here makes the implementer's hook block every edit;
- each `riskTiers` rule has a tier and paths, and the last one matches every path (`**`).

## 5. Install for the coding agent

For `claude-code`, from `../factory/adapters/claude-code/`:

- **Agents**: copy each file in `agents/` to `.claude/agents/`, replacing an earlier copy. Delete any `.claude/agents/factory-*.md` whose first frontmatter line says it was rendered by the Factory but that `agents/` no longer has; leave other agent files alone.
- **Stop hook**: merge `settings.json` into `.claude/settings.json`, creating it if needed. Keep every other setting and hook. When a Stop hook entry already runs `stop-validate.mjs`, replace that one entry, leaving the other hooks in its group, rather than adding a second one.
- **Skills path**: the agents and hooks name `.claude/skills/factory/` and `.claude/skills/factory-result/`. Check that both exist (they do when `npx skills` installed for Claude Code); when the skills are only in `.agents/skills/`, link `.claude/skills/<name>` to them.
- **Worktrees**: add `.claude/worktrees/` to `.gitignore` if it isn't there.

The hooks need Node 22 or newer: check `node --version`, and tell the person when it is missing or older. Then check that the Stop hook passes: run `validate` once yourself. When it fails, the Stop hook will keep every turn going for one more try, so fix what fails or ask the person.

Read the adapter's _Gotchas_ (`../factory/adapters/<codingAgent>/README.md`) and tell the person the ones that affect them now: for Claude Code, that agent hooks need the folder's workspace trust to have been accepted.

## 6. Labels

Make sure the four labels of `config.labels` exist:

- With `gh` authenticated (`gh auth status`): create each missing one with `gh label create <name> --description "<the meaning from docs/conventions/issues-and-records.md>"`.
- Otherwise: give the person the `gh label create` commands for the missing labels in one block, and say they can also create them in the repository's settings under Labels.

The repository the Factory was installed from is in `skills-lock.json` (its `source`); use it for issues about the Factory itself.

## 7. Report

Commit the setup as one `harness:` commit when the person agrees, and list what you did: the files created, the files you changed and kept, the labels, the commands the person still has to run (only when you couldn't run them), and how to start: label an issue `config.labels.ready`, then `/factory <issue>`. Run this skill again after updating the Factory's skills (`npx skills update`), so the agents and hooks match them.
