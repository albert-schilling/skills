// The logic of the end-of-turn check, independent of any coding agent: runs the project's
// `validate` command from .agents/factory.json and returns whether it passed, with its output as
// plain text. A coding agent's wrapper (hooks/<agent>/stop-validate.mjs) decides what the agent
// sees.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { configPath } from "./test-files.mjs";

/** Runs `validate`; returns `{ ok, command, output }`. Throws when the config has no command. */
export function runValidate(root) {
  const config = JSON.parse(readFileSync(resolve(root, configPath), "utf8"));
  const command = config?.validate;
  if (typeof command !== "string" || command.trim() === "") {
    throw new Error("validate must be a command");
  }
  const result = spawnSync(command, {
    cwd: root,
    shell: true,
    encoding: "utf8",
    // Build tools with a terminal UI (Nx, Turborepo) expect a terminal, and a hook has none.
    env: { ...process.env, CI: process.env.CI ?? "1", NX_TUI: "false", FORCE_COLOR: "0" },
    maxBuffer: 64 * 1024 * 1024,
  });
  // Tools may still colour their output; the agent reads plain text.
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.replace(/\x1b\[[0-9;]*m/g, "");
  return { ok: result.status === 0, command, output };
}
