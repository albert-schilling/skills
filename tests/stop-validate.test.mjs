import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

const hook = resolve(import.meta.dirname, "../skills/factory/hooks/claude-code/stop-validate.mjs");

let project;
beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), "stop-validate-"));
  mkdirSync(join(project, ".agents"));
});
afterEach(() => {
  rmSync(project, { recursive: true, force: true });
});

function runHook(config) {
  if (config !== undefined) writeFileSync(join(project, ".agents/factory.json"), JSON.stringify(config));
  return spawnSync(process.execPath, [hook], {
    input: JSON.stringify({ hook_event_name: "Stop" }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: project },
    encoding: "utf8",
  });
}

describe("the Stop hook (Claude Code)", () => {
  it("ends the turn silently when validate passes", () => {
    const result = runHook({ validate: "echo all good" });

    assert.equal(result.status, 0);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "");
  });

  it("keeps the turn going with the failure as plain text when validate fails", () => {
    const result = runHook({ validate: "printf '\\033[31mlint: 2 errors\\033[0m' && exit 1" });

    assert.equal(result.status, 2);
    assert.match(result.stderr, /fix it before ending the turn/);
    assert.match(result.stderr, /lint: 2 errors/);
    assert.doesNotMatch(result.stderr, /\x1b\[/);
  });

  it("runs validate from the project directory", () => {
    writeFileSync(join(project, "marker"), "");

    assert.equal(runHook({ validate: "test -f marker" }).status, 0);
  });

  it("validates the worktree the session works in, not the checkout it started in", () => {
    const repo = join(project, "repo");
    const worktree = join(project, "worktree");
    const git = (...args) => spawnSync("git", args, { cwd: repo, encoding: "utf8" });
    mkdirSync(join(repo, ".agents"), { recursive: true });
    writeFileSync(join(repo, ".agents/factory.json"), JSON.stringify({ validate: "test ! -f broken" }));
    git("init", "-q");
    git("add", "-A");
    git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init");
    git("worktree", "add", "-q", worktree);
    writeFileSync(join(worktree, "broken"), "");

    const result = spawnSync(process.execPath, [hook], {
      input: JSON.stringify({ hook_event_name: "Stop", cwd: worktree }),
      env: { ...process.env, CLAUDE_PROJECT_DIR: repo },
      encoding: "utf8",
    });

    assert.equal(result.status, 2);
  });

  it("keeps the turn going when the config has no validate command", () => {
    const result = runHook({});

    assert.equal(result.status, 2);
    assert.match(result.stderr, /validate must be a command/);
  });
});
