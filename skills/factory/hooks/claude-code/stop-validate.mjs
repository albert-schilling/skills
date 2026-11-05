// Claude Code wrapper for the end-of-turn check (../validate.mjs), run as the project's Stop hook:
// a turn can't end while `validate` fails. Silent on success, so a clean turn ends without noise.
// On failure it prints the output to stderr and exits with 2, which Claude Code hands to the agent
// instead of ending the turn.
import { runValidate } from "../validate.mjs";

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

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
