import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";
import { renderAll, staleFiles } from "../scripts/render-adapters.mjs";

const repo = resolve(import.meta.dirname, "..");
const files = renderAll();
const agent = (name) => files[`skills/factory/adapters/claude-code/agents/${name}.md`];

describe("the adapters' rendered files", () => {
  it("are up to date with the neutral agent files", () => {
    assert.deepEqual(staleFiles(), []);
  });
});

describe("the Claude Code adapter", () => {
  it("has each of the seven phase agents", () => {
    const agents = Object.keys(files).filter((path) => path.includes("/claude-code/agents/"));

    assert.equal(agents.length, 7);
  });

  it("maps model tier, access and effort to Claude Code's frontmatter, with the result format preloaded", () => {
    const planner = agent("factory-planner");

    assert.match(planner, /^model: opus$/m);
    assert.match(planner, /^effort: high$/m);
    assert.match(planner, /^tools: Read, Grep, Glob, Bash$/m);
    assert.match(planner, /^skills:\n {2}- factory-result$/m);
    assert.match(planner, /^description: ".+"$/m);
    assert.match(planner, /`\.claude\/skills\/factory-result\/SKILL\.md`/);
    assert.doesNotMatch(planner, /\{\{/);
    assert.match(agent("factory-implementer"), /^model: sonnet$/m);
    assert.match(agent("factory-implementer"), /^tools: Read, Grep, Glob, Edit, Write, Bash$/m);
  });

  // The installed skill sits at .claude/skills/factory/, which is this repository's skills/factory/.
  const inRepo = (command) => join(repo, command.replace(/^node "\$CLAUDE_PROJECT_DIR"\/\.claude\/skills\//, "skills/"));

  it("guards only the implementer with the test-file hook, at a script that exists", () => {
    const command = /command: '(.+)'/.exec(agent("factory-implementer"))?.[1];

    assert.match(agent("factory-implementer"), /matcher: "Edit\|Write\|MultiEdit\|NotebookEdit\|Bash"/);
    assert.ok(command !== undefined && existsSync(inRepo(command)), command);
    assert.doesNotMatch(agent("factory-reviewer-spec"), /hooks:/);
  });

  it("adds the Stop hook that runs validate, from a script that exists", () => {
    const settings = JSON.parse(files["skills/factory/adapters/claude-code/settings.json"]);
    const [hook] = settings.hooks.Stop[0].hooks;

    assert.match(hook.command, /stop-validate\.mjs$/);
    assert.ok(existsSync(inRepo(hook.command)));
    assert.ok(hook.timeout >= 600);
  });

  it("marks each rendered agent on its first frontmatter line, so the setup can tell them apart", () => {
    for (const [path, content] of Object.entries(files).filter(([path]) => path.endsWith(".md"))) {
      assert.match(content.split("\n")[1], /^# Rendered from /, path);
    }
    assert.equal(readFileSync(join(repo, "skills/factory/adapters/claude-code/settings.json"), "utf8"), files["skills/factory/adapters/claude-code/settings.json"]);
  });
});
