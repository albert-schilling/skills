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

- The phase agents are `.claude/agents/factory-*.md`. `factory-setup` renders them from this skill's `agents/` folder; edit neither copy by hand.
- The implementer's PreToolUse hook and the project's Stop hook run the scripts in this skill's `hooks/claude-code/` folder.

## Gotchas

- Claude Code skips an agent's frontmatter hooks until the folder's workspace trust dialog has been accepted, and logs that only to the debug log; a fresh cloud container hasn't accepted it. Check a hook with `--debug`, or by passing it through `--settings`.
- An agent's `skills:` preload reaches it only when it runs as a sub-agent; `claude --agent <name>` starts it without them, which is why each agent's instructions say where to read the result format.
- A git worktree inside the repository holds a second copy of every file. Tools that scan the whole tree (formatters, monorepo tools) see each file twice unless `.claude/worktrees/` is in `.gitignore`.
