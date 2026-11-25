// Claude Code wrapper for the implementer's test-file guard (../test-files.mjs), run as a
// PreToolUse hook from the implementer's agent definition. A denied call tells the agent to stop
// and report the test instead. When the config can't be read it blocks every call (exit 2), so a
// broken config never lets test edits through.
import { readFileSync } from "node:fs";
import { checkToolCall, configPath, readTestFiles } from "../test-files.mjs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

// The repository the call works in: the git worktree holding the event's `cwd`, which in a Factory
// run is the issue's worktree, not the checkout the session started in. Falls back to the project.
// It is built from `cwd` and `--show-cdup`, not `--show-toplevel`, so it keeps the spelling of the
// tool's paths: git resolves symlinks (on macOS /var is /private/var), and a root spelled another
// way would put every path outside it.
function projectRoot(cwd) {
  const fallback = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  if (typeof cwd !== "string") return fallback;
  const git = spawnSync("git", ["-C", cwd, "rev-parse", "--show-cdup"], { encoding: "utf8" });
  return git.status === 0 ? resolve(cwd, git.stdout.trim()) : fallback;
}

const input = JSON.parse(readFileSync(0, "utf8"));
const root = projectRoot(input.cwd);

let testFiles;
try {
  testFiles = readTestFiles(root);
} catch (error) {
  process.stderr.write(`Can't read the test file globs from ${configPath}: ${String(error)}\n`);
  process.exit(2);
}

const toolInput = input.tool_input ?? {};
const call =
  input.tool_name === "Bash"
    ? { kind: "shell", command: typeof toolInput.command === "string" ? toolInput.command : "" }
    : { kind: "edit", path: toolInput.file_path ?? toolInput.notebook_path };

const { deny } = checkToolCall(call, { root, cwd: input.cwd ?? root, testFiles });
if (deny !== undefined) {
  const hookSpecificOutput = {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: deny,
  };
  process.stdout.write(JSON.stringify({ hookSpecificOutput }));
}
