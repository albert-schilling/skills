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

// `event` adds to the Stop event Claude Code sends; the hook keeps what it remembers in TMPDIR.
function runHook(config, event = {}) {
  if (config !== undefined) writeFileSync(join(project, ".agents/factory.json"), JSON.stringify(config));
  return spawnSync(process.execPath, [hook], {
    input: JSON.stringify({ hook_event_name: "Stop", session_id: "s1", ...event }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: project, TMPDIR: project },
    encoding: "utf8",
  });
}

// A validate command that prints the file `out` and fails while it exists.
const printsOut = { validate: "if [ -f out ]; then cat out; exit 1; fi" };
const fail = (text) => writeFileSync(join(project, "out"), text);

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

  it("ends the turn when the same failure comes back after the agent's try, and shows it to the person", () => {
    fail("server:test-image failed\n");
    assert.equal(runHook(printsOut).status, 2);

    const result = runHook(printsOut, { stop_hook_active: true });

    assert.equal(result.status, 0);
    const shown = JSON.parse(result.stdout).systemMessage;
    assert.match(shown, /failed the same way twice/);
    assert.match(shown, /server:test-image failed/);
  });

  it("counts a failure as the same when only timings and the order of lines changed", () => {
    fail("✔ lint\n✔ test\nserver:test-image failed\nRun duration: 1m 15s (4% of the run), 1045ms\n");
    assert.equal(runHook(printsOut).status, 2);
    fail("✔ test\n✔ lint\nserver:test-image failed\nRun duration: 1m 14s (3% of the run), 963ms\n");

    assert.equal(runHook(printsOut, { stop_hook_active: true }).status, 0);
  });

  it("keeps the turn going when the agent's try changed the failure", () => {
    fail("lint: 2 errors\n");
    assert.equal(runHook(printsOut).status, 2);
    fail("typecheck: 1 error\n");

    const result = runHook(printsOut, { stop_hook_active: true });

    assert.equal(result.status, 2);
    assert.match(result.stderr, /typecheck: 1 error/);
  });

  it("blocks the first stop of a new turn, even with the failure the last turn ended on", () => {
    // The last turn blocked and then ended without another stop, say because the person interrupted.
    fail("server:test-image failed\n");
    assert.equal(runHook(printsOut).status, 2);

    assert.equal(runHook(printsOut).status, 2);
  });

  it("forgets a failure once validate passes", () => {
    fail("lint: 2 errors\n");
    runHook(printsOut);
    rmSync(join(project, "out"));
    assert.equal(runHook(printsOut, { stop_hook_active: true }).status, 0);
    fail("lint: 2 errors\n");

    assert.equal(runHook(printsOut, { stop_hook_active: true }).status, 2);
  });

  it("keeps each session's failure apart", () => {
    fail("lint: 2 errors\n");
    runHook(printsOut, { session_id: "other" });

    assert.equal(runHook(printsOut, { stop_hook_active: true }).status, 2);
  });

  it("keeps the turn going when the config has no validate command", () => {
    const result = runHook({});

    assert.equal(result.status, 2);
    assert.match(result.stderr, /validate must be a command/);
  });
});
