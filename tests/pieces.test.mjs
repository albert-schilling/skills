// Checks the Factory's pieces as a whole: they name nothing of a project's own, use no skills from
// outside this repository, and refer only to config keys, agents and files that exist.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { parseAgent } from "../scripts/render-adapters.mjs";

const skillsDir = resolve(import.meta.dirname, "../skills");
const read = (path) => readFileSync(join(skillsDir, path), "utf8");
const filesBelow = (dir, prefix = "") =>
  readdirSync(join(skillsDir, dir), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesBelow(join(dir, entry.name)) : [join(dir, entry.name)],
  );

const skills = readdirSync(skillsDir);
const allFiles = skills.flatMap((skill) => filesBelow(skill));
const textFiles = allFiles.filter((file) => /\.(md|mjs|json|sh)$/.test(file));
const schema = JSON.parse(read("factory/factory.schema.json"));
const template = JSON.parse(read("factory-setup/templates/.agents/factory.json"));

// The models and effort the Factory's phases start from.
const expected = {
  "factory-researcher": { model: "fast", effort: "low", access: "read" },
  "factory-planner": { model: "strong", effort: "high", access: "read" },
  "factory-test-writer": { model: "strong", effort: "high", access: "write" },
  "factory-implementer": { model: "fast", effort: "medium", access: "write" },
  "factory-reviewer-spec": { model: "strong", effort: "high", access: "write" },
  "factory-reviewer-standards": { model: "strong", effort: "high", access: "write" },
  "factory-reviewer-security": { model: "strong", effort: "high", access: "write" },
};

describe("the skills", () => {
  it("are the Factory's four", () => {
    assert.deepEqual(skills.toSorted(), ["factory", "factory-pull-request", "factory-result", "factory-setup"]);
  });

  for (const skill of skills) {
    it(`${skill} has a frontmatter with its name and a description`, () => {
      const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(read(`${skill}/SKILL.md`))?.[1] ?? "";

      assert.match(frontmatter, new RegExp(`^name: ${skill}$`, "m"));
      assert.ok((/^description: (.*)$/m.exec(frontmatter)?.[1] ?? "").length > 60);
    });
  }

  it("only a person starts the factory and the setup", () => {
    for (const skill of ["factory", "factory-setup"]) {
      assert.match(read(`${skill}/SKILL.md`), /^disable-model-invocation: true$/m, skill);
    }
  });
});

describe("the phase agents", () => {
  const names = readdirSync(join(skillsDir, "factory/agents")).map((file) => file.replace(/\.md$/, ""));

  it("are exactly the seven", () => {
    assert.deepEqual(names.toSorted(), Object.keys(expected).toSorted());
  });

  for (const [name, want] of Object.entries(expected)) {
    it(`${name} has its model tier, effort, access and description, and points to the result format`, () => {
      const { fields, body } = parseAgent(read(`factory/agents/${name}.md`));

      assert.deepEqual({ name: fields.name, model: fields.model, effort: fields.effort, access: fields.access }, { name, ...want });
      assert.ok(fields.description.length > 80);
      assert.doesNotMatch(fields.description, /: /, "a description with ': ' breaks a plain YAML value");
      assert.match(body, /\{\{factory-result\}\}/);
    });
  }

  it("only the implementer runs the test-file hook", () => {
    const hooked = names.filter((name) => (parseAgent(read(`factory/agents/${name}.md`)).fields.hooks ?? []).includes("protect-test-files"));

    assert.deepEqual(hooked, ["factory-implementer"]);
  });
});

describe("the factory skill", () => {
  const text = filesBelow("factory").filter((file) => file.endsWith(".md") && !file.includes("agents/")).map(read).join("\n");

  it("starts each phase agent, and no other", () => {
    const named = new Set(text.match(/\bfactory-[a-z-]+[a-z]/g));
    for (const skill of ["factory-result", "factory-pull-request", "factory-setup"]) named.delete(skill);

    assert.deepEqual([...named].toSorted(), Object.keys(expected).toSorted());
  });

  it("has an adapter for every coding agent the schema allows", () => {
    for (const agent of schema.properties.codingAgent.enum) {
      assert.ok(existsSync(join(skillsDir, "factory/adapters", agent, "README.md")), agent);
    }
  });
});

describe("every piece", () => {
  // `config.<key>` in a skill must be a key the schema defines.
  it("names only config keys the schema and the template have", () => {
    const keys = textFiles.flatMap((file) => [...read(file).matchAll(/`config\.([\w.]+)`/g)].map((match) => match[1]));
    const resolves = (key, root) => key.split(".").reduce((value, part) => value?.[part], root) !== undefined;

    assert.ok(keys.length > 10);
    assert.deepEqual(keys.filter((key) => !resolves(key, template)), []);
    assert.deepEqual(keys.filter((key) => schema.properties[key.split(".")[0]] === undefined), []);
  });

  it("links only files that exist", () => {
    const broken = textFiles
      .filter((file) => file.endsWith(".md") && !file.includes("/templates/"))
      .flatMap((file) =>
        [...read(file).matchAll(/\]\(([\w./-]+)\)/g)]
          .map((match) => match[1])
          .filter((link) => !link.startsWith("http") && !existsSync(join(skillsDir, dirname(file), link)))
          .map((link) => `${file} → ${link}`),
      );

    assert.deepEqual(broken, []);
  });

  it("names no project of its own", () => {
    assert.deepEqual(textFiles.filter((file) => /bardery|poligent/i.test(read(file))), []);
  });

  // The Factory is self-contained: it calls no skill from outside this repository.
  it("uses no third-party skill", () => {
    const outside = /`(pr|security-review|code-review|tdd|grilling|domain-modeling|codebase-design|diagnosing-bugs)`\s+skill|pullRequestSkill|run the `security-review`/;

    assert.deepEqual(textFiles.filter((file) => outside.test(read(file))), []);
  });

  it("names Claude Code's tools only in its adapter and installer", () => {
    const tools = /\b(AskUserQuestion|SendMessage|EnterWorktree|ExitWorktree|subagent_type)\b|`Agent` tool|the Agent tool/;
    const allowed = ["factory/adapters/claude-code/README.md", "factory-setup/SKILL.md"];

    assert.deepEqual(textFiles.filter((file) => !allowed.includes(file) && tools.test(read(file))), []);
  });
});
