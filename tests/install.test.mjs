import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

const script = resolve(import.meta.dirname, "../skills/factory-setup/scripts/install.mjs");

let project;
beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), "factory-install-"));
});
afterEach(() => {
  rmSync(project, { recursive: true, force: true });
});

function run(...args) {
  const result = spawnSync(process.execPath, [script, "--project", project, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

const read = (path) => readFileSync(join(project, path), "utf8");

function writeConfig(changes = {}) {
  const config = JSON.parse(readFileSync(resolve(import.meta.dirname, "../skills/factory-setup/templates/.agents/factory.json"), "utf8"));
  mkdirSync(join(project, ".agents"), { recursive: true });
  writeFileSync(join(project, ".agents/factory.json"), JSON.stringify({ ...config, testFiles: ["**/*.test.ts"], ...changes }));
}

describe("install.mjs --scaffold", () => {
  it("creates the starting files a project lacks", () => {
    const { scaffold } = run("--scaffold");

    for (const file of [".agents/factory.json", "AGENTS.md", "docs/conventions/pull-requests.md", ".github/ISSUE_TEMPLATE/task.md", "docs/harness-log.md", "scripts/validate.sh"]) {
      assert.ok(scaffold.created.includes(file), file);
      assert.ok(existsSync(join(project, file)), file);
    }
    assert.ok(statSync(join(project, "scripts/validate.sh")).mode & 0o100);
  });

  it("keeps every file the project has", () => {
    writeFileSync(join(project, "AGENTS.md"), "# Ours\n");

    const { scaffold } = run("--scaffold");

    assert.ok(scaffold.kept.includes("AGENTS.md"));
    assert.equal(read("AGENTS.md"), "# Ours\n");
  });
});

describe("install.mjs --check", () => {
  it("passes a complete config", () => {
    writeConfig();

    assert.deepEqual(run("--check").configProblems, []);
  });

  it("reports the template's empty testFiles, a missing key, an unknown key and a missing catch-all", () => {
    writeConfig({ testFiles: [], validate: undefined, extra: 1, riskTiers: [{ tier: "high", paths: ["infra/**"] }] });

    const problems = run("--check").configProblems;

    assert.ok(problems.includes("testFiles needs at least one glob"));
    assert.ok(problems.includes("validate is missing"));
    assert.ok(problems.includes("extra isn't a Factory setting"));
    assert.ok(problems.includes("the last riskTiers rule must match every path (**)"));
  });
});

describe("install.mjs --agent claude-code", () => {
  beforeEach(() => writeConfig());

  it("renders each phase agent with Claude Code's model, tools, preload and body", () => {
    const report = run("--agent", "claude-code")["claude-code"];
    const planner = read(".claude/agents/factory-planner.md");

    assert.equal(report.agents.length, 7);
    assert.match(planner, /^model: opus$/m);
    assert.match(planner, /^effort: high$/m);
    assert.match(planner, /^tools: Read, Grep, Glob, Bash$/m);
    assert.match(planner, /^skills:\n {2}- factory-result$/m);
    assert.match(planner, /^description: ".+"$/m);
    assert.doesNotMatch(planner, /\{\{/);
    assert.match(read(".claude/agents/factory-implementer.md"), /^model: sonnet$/m);
  });

  it("guards only the implementer with the test-file hook, at a path that exists", () => {
    run("--agent", "claude-code");
    const implementer = read(".claude/agents/factory-implementer.md");
    const script = /command: 'node "?(.+?\.mjs)"?'/.exec(implementer)?.[1];

    assert.match(implementer, /matcher: "Edit\|Write\|MultiEdit\|NotebookEdit\|Bash"/);
    assert.ok(script !== undefined && existsSync(script.replace('"$CLAUDE_PROJECT_DIR"/', `${project}/`)), script);
    assert.doesNotMatch(read(".claude/agents/factory-reviewer-spec.md"), /hooks:/);
  });

  it("adds the Stop hook once, keeping the other settings, and ignores the worktrees", () => {
    mkdirSync(join(project, ".claude"), { recursive: true });
    writeFileSync(join(project, ".claude/settings.json"), JSON.stringify({ model: "opus", hooks: { Stop: [{ hooks: [{ type: "command", command: "echo other" }] }] } }));
    writeFileSync(join(project, ".gitignore"), "node_modules");

    run("--agent", "claude-code");
    run("--agent", "claude-code");
    const settings = JSON.parse(read(".claude/settings.json"));
    const commands = settings.hooks.Stop.flatMap((group) => group.hooks.map((hook) => hook.command));

    assert.equal(settings.model, "opus");
    assert.equal(commands.length, 2);
    assert.ok(commands.includes("echo other"));
    assert.equal(commands.filter((command) => command.includes("stop-validate.mjs")).length, 1);
    assert.equal(read(".gitignore").split("\n").filter((line) => line === ".claude/worktrees/").length, 1);
    assert.match(read(".gitignore"), /^node_modules\n/);
  });

  it("removes agents it rendered earlier that the Factory no longer has, and no others", () => {
    mkdirSync(join(project, ".claude/agents"), { recursive: true });
    writeFileSync(join(project, ".claude/agents/factory-old.md"), "---\n# Rendered by factory-setup from x\n---\n");
    writeFileSync(join(project, ".claude/agents/factory-ours.md"), "---\nname: factory-ours\n---\n");

    const report = run("--agent", "claude-code")["claude-code"];

    assert.deepEqual(report.removedAgents, [".claude/agents/factory-old.md"]);
    assert.ok(existsSync(join(project, ".claude/agents/factory-ours.md")));
  });

  it("refuses a coding agent it has no adapter for", () => {
    const result = spawnSync(process.execPath, [script, "--project", project, "--agent", "other"], { encoding: "utf8" });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /No adapter for other/);
  });
});
