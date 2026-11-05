import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

const hook = resolve(import.meta.dirname, "../skills/factory/hooks/claude-code/protect-test-files.mjs");

// A throwaway project with its own Factory config.
let project;
beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), "protect-test-files-"));
  mkdirSync(join(project, ".agents"));
  writeFileSync(
    join(project, ".agents/factory.json"),
    JSON.stringify({ testFiles: ["**/*.test.ts", "**/fixtures/**"] }),
  );
});
afterEach(() => {
  rmSync(project, { recursive: true, force: true });
});

function runHook(tool_name, tool_input) {
  const result = spawnSync(process.execPath, [hook], {
    input: JSON.stringify({ hook_event_name: "PreToolUse", cwd: project, tool_name, tool_input }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: project },
    encoding: "utf8",
  });
  const decision = result.stdout === "" ? undefined : JSON.parse(result.stdout);
  return { status: result.status, stderr: result.stderr, decision };
}

const denied = (result) => result.decision?.hookSpecificOutput?.permissionDecision === "deny";

describe("the implementer's test-file hook (Claude Code)", () => {
  for (const [tool, path] of [
    ["Edit", "src/story.test.ts"],
    ["Write", "src/new.test.ts"],
    ["MultiEdit", "src/fixtures/story.json"],
  ]) {
    it(`denies ${tool} on a test file and tells the agent to stop and report`, () => {
      const result = runHook(tool, { file_path: join(project, path) });

      assert.equal(result.status, 0);
      assert.equal(result.decision.hookSpecificOutput.hookEventName, "PreToolUse");
      assert.ok(denied(result));
      assert.match(result.decision.hookSpecificOutput.permissionDecisionReason, new RegExp(path));
      assert.match(result.decision.hookSpecificOutput.permissionDecisionReason, /`blocked`/);
    });
  }

  it("allows edits to source files", () => {
    const result = runHook("Edit", { file_path: join(project, "src/story.ts") });

    assert.equal(result.status, 0);
    assert.equal(result.decision, undefined);
  });

  it("allows a file outside the project, even one named like a test", () => {
    assert.equal(runHook("Write", { file_path: join(tmpdir(), "elsewhere.test.ts") }).decision, undefined);
  });

  for (const command of [
    "cat > src/story.test.ts <<'EOF'\nit('passes', () => {})\nEOF",
    "echo 'it.skip' >> src/story.test.ts",
    "sed -i 's/toBe(1)/toBe(2)/' src/story.test.ts",
    "git checkout main -- src/story.test.ts",
    "cd src && rm -f story.test.ts",
    "CI=1 xargs rm < list.txt src/fixtures/a.json",
  ]) {
    it(`denies the shell command ${JSON.stringify(command)}`, () => {
      assert.ok(denied(runHook("Bash", { command })));
    });
  }

  for (const command of [
    "npx vitest run src/story.test.ts 2>&1 | tail -20",
    "cat src/story.test.ts",
    "git diff -- src/story.test.ts",
    "sed -n '1,20p' src/story.test.ts",
    "echo done > src/story.ts",
  ]) {
    it(`allows the shell command ${JSON.stringify(command)}`, () => {
      assert.equal(runHook("Bash", { command }).decision, undefined);
    });
  }

  describe("with tests on disk", () => {
    beforeEach(() => {
      mkdirSync(join(project, "src/fixtures"), { recursive: true });
      mkdirSync(join(project, "dist"));
      writeFileSync(join(project, "src/story.test.ts"), "");
      writeFileSync(join(project, "src/fixtures/story.json"), "");
    });

    for (const command of [
      "cd src/fixtures && rm story.json",
      "cd src; cd fixtures; echo '{}' > story.json",
      "rm -rf src",
      "git restore -- src",
      "git checkout .",
      "mv src elsewhere",
      "rm -rf src/*",
      "rm src/*.ts",
      "cp payload.json src/fixtures/",
      "mv new.json src/fixtures",
      "mv src/story.test.ts dist/",
      "cp other.json src/fixtures/story.json",
    ]) {
      it(`denies ${JSON.stringify(command)}, which reaches a test file through a directory`, () => {
        assert.ok(denied(runHook("Bash", { command })));
      });
    }

    for (const command of [
      "rm -rf dist",
      "cp build.ts src/",
      "cd src && rm story.ts",
      "cd dist && rm -r .",
      "rm dist/*.js",
      "cp src/fixtures/story.json /tmp/story.json",
      "cp -r src/fixtures dist/",
      "ln -s src/story.test.ts dist/story.test.ts.link",
    ]) {
      it(`allows ${JSON.stringify(command)}, which reaches no test file`, () => {
        assert.equal(runHook("Bash", { command }).decision, undefined);
      });
    }

    it("denies a write after a cd it can't follow", () => {
      const result = runHook("Bash", { command: 'cd "$TMPDIR" && rm -rf src' });

      assert.match(result.decision.hookSpecificOutput.permissionDecisionReason, /can't follow/);
    });
  });

  it("matches paths from the worktree the call runs in, not the checkout the session started in", () => {
    const repo = join(project, "repo");
    const worktree = join(project, "worktree");
    const git = (...args) => spawnSync("git", args, { cwd: repo, encoding: "utf8" });
    mkdirSync(join(repo, ".agents"), { recursive: true });
    writeFileSync(join(repo, ".agents/factory.json"), JSON.stringify({ testFiles: ["src/**/*.test.ts"] }));
    git("init", "-q");
    git("add", "-A");
    git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init");
    git("worktree", "add", "-q", worktree);
    mkdirSync(join(worktree, "src"));

    const result = spawnSync(process.execPath, [hook], {
      input: JSON.stringify({ cwd: join(worktree, "src"), tool_name: "Write", tool_input: { file_path: join(worktree, "src/a.test.ts") } }),
      env: { ...process.env, CLAUDE_PROJECT_DIR: repo },
      encoding: "utf8",
    });

    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
  });

  it("blocks every call when testFiles is empty, rather than protecting nothing", () => {
    writeFileSync(join(project, ".agents/factory.json"), JSON.stringify({ testFiles: [] }));

    const result = runHook("Edit", { file_path: join(project, "src/story.test.ts") });

    assert.equal(result.status, 2);
    assert.match(result.stderr, /at least one glob/);
  });

  it("blocks every call when the config can't be read, rather than letting edits through", () => {
    rmSync(join(project, ".agents/factory.json"));

    const result = runHook("Edit", { file_path: join(project, "src/story.ts") });

    assert.equal(result.status, 2);
    assert.match(result.stderr, /\.agents\/factory\.json/);
  });
});
