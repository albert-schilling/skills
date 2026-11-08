// Claude Code wrapper for the end-of-turn check (../validate.mjs), run as the project's Stop hook:
// a turn can't end while `validate` fails. Silent on success, so a clean turn ends without noise.
// On failure it prints the output to stderr and exits with 2, which Claude Code hands to the agent
// instead of ending the turn.
//
// One exception: when the agent's try ends with the same failure it was given, the turn ends and
// the person sees the failure. Some failures can't be fixed from the agent's machine (an image
// build without network access), and blocking again would only repeat the run until Claude Code
// gives up on the hook.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { failureFingerprint, runValidate } from "../validate.mjs";
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
// The last failure this hook blocked on, per session and project, outside the project's files.
const lastFailure = join(
  tmpdir(),
  "factory-stop-validate",
  createHash("sha256").update(`${input.session_id ?? ""}\0${root}`).digest("hex"),
);

if (result.ok) {
  rmSync(lastFailure, { force: true });
  process.exit(0);
}

const fingerprint = failureFingerprint(result.output);
let previous;
try {
  previous = readFileSync(lastFailure, "utf8");
} catch {
  // Nothing blocked in this session yet.
}
// `stop_hook_active` is true when this stop follows a block, so the agent has had its try.
if (input.stop_hook_active === true && previous === fingerprint) {
  rmSync(lastFailure, { force: true });
  const message = `\`${result.command}\` failed the same way twice, so the turn ends anyway. Check it yourself:\n\n${result.output}`;
  process.stdout.write(JSON.stringify({ systemMessage: message }));
  process.exit(0);
}

mkdirSync(join(lastFailure, ".."), { recursive: true });
writeFileSync(lastFailure, fingerprint);
process.stderr.write(`\`${result.command}\` failed; fix it before ending the turn.\n\n${result.output}\n`);
process.exit(2);
