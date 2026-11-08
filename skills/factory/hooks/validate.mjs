// The logic of the end-of-turn check, independent of any coding agent: runs the project's
// `validate` command from .agents/factory.json and returns whether it passed, with its output as
// plain text. A coding agent's wrapper (hooks/<agent>/stop-validate.mjs) decides what the agent
// sees.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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

/**
 * What makes two failures the same, for telling whether an agent's try changed anything: the
 * output's lines without durations and percentages, in any order, since tools that run tasks in
 * parallel print them in a different order each time.
 */
export function failureFingerprint(output) {
  const lines = output
    .split("\n")
    .map((line) => line.replace(/\d+(?:\.\d+)?\s?(?:ms|s|m|h|%)(?![a-z])/gi, "#").trim())
    .filter(Boolean);
  return createHash("sha256")
    .update([...new Set(lines)].sort().join("\n"))
    .digest("hex");
}
