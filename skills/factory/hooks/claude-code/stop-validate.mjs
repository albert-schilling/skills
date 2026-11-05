// Claude Code wrapper for the end-of-turn check (../validate.mjs), run as the project's Stop hook:
// a turn can't end while `validate` fails. Silent on success, so a clean turn ends without noise.
// On failure it prints the output to stderr and exits with 2, which Claude Code hands to the agent
// instead of ending the turn.
import { readFileSync } from "node:fs";
import { runValidate } from "../validate.mjs";
import { spawnSync } from "node:child_process";

// The repository the call works in: the git worktree holding the event's `cwd`, which in a Factory
// run is the issue's worktree, not the checkout the session started in. Falls back to the project.
function projectRoot(cwd) {
  const fallback = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  if (typeof cwd !== "string") return fallback;
  const git = spawnSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { encoding: "utf8" });
  return git.status === 0 ? git.stdout.trim() : fallback;
}

let input = {};
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  // No event on stdin (run by hand): check the project.
}
const root = projectRoot(input.cwd);

let result;
try {
  result = runValidate(root);
} catch (error) {
  process.stderr.write(`The Factory's Stop hook can't run validate: ${String(error)}\n`);
  process.exit(2);
}
if (!result.ok) {
  process.stderr.write(`\`${result.command}\` failed; fix it before ending the turn.\n\n${result.output}\n`);
  process.exit(2);
}
