# Claude Code

How the Factory's actions map to Claude Code's tools, and where `factory-setup` installed the pieces.

## Actions

| Action               | Tool                                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Start an agent       | `Agent`, with `subagent_type` set to the agent's name, in the foreground (not in the background). Its result is the agent's final message.       |
| Continue an agent    | `SendMessage` to the agent's ID from the `Agent` result.                                                                                         |
| Ask the person       | `AskUserQuestion`: up to four questions per call, the recommended option first with "(Recommended)" after its label. Several calls if needed.  |
| Enter a worktree     | `EnterWorktree` with the worktree's `path`. The worktree folder is `.claude/worktrees/`: the tool enters only worktrees there.                                                                                                      |
| Leave the worktree   | `ExitWorktree` with `keep`.                                                                                                                      |

## Where the pieces are

- The phase agents are `.claude/agents/factory-*.md`, copied by `factory-setup` from [`agents/`](agents/) next to this file. Those are rendered from the Factory's neutral agent files (`../../agents/`) in the repository the Factory comes from; edit neither copy in a project.
- The implementer's PreToolUse hook (in its agent file) and the project's Stop hook ([`settings.json`](settings.json), merged into `.claude/settings.json`) run the scripts in the Factory's `hooks/claude-code/` folder, at `.claude/skills/factory/`. Claude Code finds installed skills there whether `npx skills` copied them or linked them from `.agents/skills/`.

## What setup installs, and how it is marked

- `.claude/agents/factory-*.md`: each gets the line `# Installed by factory-setup from Factory version <version>` after its "Rendered from" frontmatter comment (the first line stays "Rendered from"; stale agents are found by it).
- `.claude/settings.json`: the Stop hook entry running `stop-validate.mjs`. JSON has no comments, so it isn't marked; `installed.files` lists the file, and the entry is found by its command.

## Install

From this folder, into the project:

- **Agents**: copy each file in `agents/` to `.claude/agents/`, replacing an earlier copy, and add the line `# Installed by factory-setup from Factory version <version>` right after the "Rendered from" comment line (replacing a previous such line). Delete any `.claude/agents/factory-*.md` whose first frontmatter line says it was rendered by the Factory but that `agents/` no longer has; leave other agent files alone.
- **Stop hook**: merge `settings.json` into `.claude/settings.json`, creating it if needed. Keep every other setting and hook. When a Stop hook entry already runs `stop-validate.mjs`, replace that one entry, leaving the other hooks in its group, rather than adding a second one. List `.claude/settings.json` in `installed.files`; the hook is found by its `stop-validate.mjs` command.
- **Skills path**: the agents and hooks name `.claude/skills/factory/` and `.claude/skills/factory-result/`. Check that both exist (they do when `npx skills` installed for Claude Code); when the skills are only in `.agents/skills/`, link `.claude/skills/<name>` to them. Use relative links only (for example `ln -s ../../.agents/skills/<name> .claude/skills/<name>`), so the hooks find their scripts in every clone, worktree, CI run and cloud session. Then check the links that are already there, `.claude/skills` itself (`test -L .claude/skills`, then `readlink`) and each entry in it (`find .claude/skills/ -maxdepth 1 -type l`, where the trailing slash makes `find` follow `.claude/skills` when it is a link, then `readlink` each one):
  - When a link is absolute and its target lies inside the repository, replace it with the relative link to the same target (`.claude/skills` to `../.agents/skills`, for example), and report each one you changed.
  - When the absolute target lies outside the repository (another person's machine, for example), don't guess: report the link and ask the person what it should point to.
  - After replacing a link, check that `.claude/skills/factory/hooks/claude-code/stop-validate.mjs` resolves (`test -f`), and tell the person when it doesn't.
- **Worktrees**: add `.claude/worktrees/` to `.gitignore` if it isn't there.

Tell the person at setup: the workspace trust gotcha and the `npx skills` absolute-links gotcha below (re-run `factory-setup` after installing or updating skills). The other gotchas matter at run time.

## Gotchas

- Claude Code skips an agent's frontmatter hooks until the folder's workspace trust dialog has been accepted, and logs that only to the debug log; a fresh cloud container hasn't accepted it. Check a hook with `--debug`, or by passing it through `--settings`.
- An agent's `skills:` preload reaches it only when it runs as a sub-agent; `claude --agent <name>` starts it without them, which is why each agent's instructions say where to read the result format.
- The Stop hook blocks a turn while `validate` fails, but when the stop after a block (`stop_hook_active`) fails the same way, it lets the turn end and shows the failure to the person in a `systemMessage`. It keeps the last failure per session in the system's temp folder. Without that, a failure the agent can't fix repeats the whole `validate` run until Claude Code overrides the hook after nine blocks.
- A git worktree inside the repository holds a second copy of every file. Tools that scan the whole tree (formatters, monorepo tools) see each file twice unless `.claude/worktrees/` is in `.gitignore`.
- `npx skills add` and `npx skills update` can replace `.claude/skills`, or a link in it, with an absolute symlink to a folder on the machine that ran them. It works there and nowhere else: in another clone, a worktree, CI or a cloud session the link points nowhere, and the hooks can't find their scripts. Re-run `factory-setup` after installing or updating skills; it replaces such links with relative ones.
