#!/usr/bin/env node
// Installs the Factory into a project, the part of `factory-setup` that needs no judgment, so it
// does the same every time and can run again after an update:
//
//   node install.mjs --project <dir> [--scaffold] [--check] [--agent claude-code]
//
// --scaffold copies the starting files from ../templates/ that the project doesn't have yet, and
// never overwrites one. --check lists what .agents/factory.json lacks. --agent installs the phase
// agents and hooks the way that coding agent expects, and checks the config too. It prints what it
// did as JSON, for the setup skill to report.
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(realpathSync(fileURLToPath(import.meta.url)));
const templatesDir = resolve(here, "../templates");
// The skills `npx skills` installs sit side by side, so the Factory's skills are siblings of this one.
const skillsDir = resolve(here, "../..");
const factoryDir = join(skillsDir, "factory");
const resultSkill = join(skillsDir, "factory-result/SKILL.md");

export const supportedAgents = ["claude-code"];

/**
 * Checks .agents/factory.json against the parts of factory.schema.json the Factory relies on;
 * returns the problems, empty when there are none.
 */
export function checkConfig(project) {
  const path = join(project, ".agents/factory.json");
  if (!existsSync(path)) return [".agents/factory.json is missing"];
  let config;
  try {
    config = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    return [`.agents/factory.json isn't valid JSON: ${error.message}`];
  }
  const schema = JSON.parse(readFileSync(join(factoryDir, "factory.schema.json"), "utf8"));
  const problems = schema.required
    .filter((key) => config[key] === undefined)
    .map((key) => `${key} is missing`);
  const allowed = Object.keys(schema.properties);
  problems.push(...Object.keys(config).filter((key) => !allowed.includes(key)).map((key) => `${key} isn't a Factory setting`));
  if (config.codingAgent !== undefined && !supportedAgents.includes(config.codingAgent)) {
    problems.push(`codingAgent must be one of ${supportedAgents.join(", ")}`);
  }
  if (typeof config.validate !== "string" || config.validate.trim() === "") problems.push("validate must be a command");
  if (!Array.isArray(config.testFiles) || config.testFiles.length === 0) problems.push("testFiles needs at least one glob");
  for (const label of schema.properties.labels.required) {
    if (typeof config.labels?.[label] !== "string") problems.push(`labels.${label} is missing`);
  }
  const tiers = Array.isArray(config.riskTiers) ? config.riskTiers : [];
  if (tiers.some((rule) => !["high", "medium", "low"].includes(rule.tier) || !Array.isArray(rule.paths))) {
    problems.push("each riskTiers rule needs a tier (high, medium or low) and paths");
  }
  if (!(tiers.at(-1)?.paths ?? []).includes("**")) problems.push("the last riskTiers rule must match every path (**)");
  return problems;
}

function parseArgs(argv) {
  const args = { project: process.cwd(), scaffold: false, agent: undefined, check: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--project") args.project = resolve(argv[++i]);
    else if (argv[i] === "--scaffold") args.scaffold = true;
    else if (argv[i] === "--agent") args.agent = argv[++i];
    else if (argv[i] === "--check") args.check = true;
    else throw new Error(`Unknown argument ${argv[i]}`);
  }
  return args;
}

function filesBelow(dir, prefix = "") {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? filesBelow(join(dir, entry.name), `${prefix}${entry.name}/`)
      : [`${prefix}${entry.name}`],
  );
}

/** Copies each template the project lacks; returns the paths created and the ones kept. */
export function scaffold(project) {
  const created = [];
  const kept = [];
  for (const file of filesBelow(templatesDir)) {
    const target = join(project, file);
    if (existsSync(target)) {
      kept.push(file);
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(templatesDir, file), target);
    // An install may not keep the executable bit, and a script is run as a command.
    if (file.endsWith(".sh")) chmodSync(target, statSync(target).mode | 0o111);
    created.push(file);
  }
  return { created, kept };
}

/** Splits an agent source file into its frontmatter fields and its body. */
export function parseAgent(text) {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (match === null) throw new Error("An agent file starts with a frontmatter block");
  const fields = {};
  for (const line of match[1].split("\n")) {
    const field = /^(\w[\w-]*):\s*(.*)$/.exec(line);
    if (field === null) continue;
    const [, key, value] = field;
    fields[key] = value.startsWith("[")
      ? value
          .slice(1, -1)
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : value;
  }
  return { fields, body: match[2] };
}

// From the project's root, with `/` separators; absolute when the skills are installed elsewhere.
function fromProject(project, path) {
  const rel = relative(project, path).split("\\").join("/");
  return rel.startsWith("..") || isAbsolute(rel) ? path : rel;
}

const claudeCode = {
  models: { strong: "opus", fast: "sonnet" },
  tools: { read: "Read, Grep, Glob, Bash", write: "Read, Grep, Glob, Edit, Write, Bash" },
  hookCommand(project, script) {
    const path = fromProject(project, join(factoryDir, "hooks/claude-code", script));
    return isAbsolute(path) ? `node "${path}"` : `node "$CLAUDE_PROJECT_DIR"/${path}`;
  },
  marker: "# Rendered by factory-setup",

  renderAgent(project, sourceFile) {
    const { fields, body } = parseAgent(readFileSync(sourceFile, "utf8"));
    const model = this.models[fields.model];
    const tools = this.tools[fields.access];
    if (model === undefined || tools === undefined) {
      throw new Error(`${fields.name}: model must be strong or fast, access read or write`);
    }
    const lines = [
      "---",
      `${this.marker} from ${fromProject(project, sourceFile)}; edit that file, not this one.`,
      `name: ${fields.name}`,
      `description: ${JSON.stringify(fields.description)}`,
      `model: ${model}`,
      `effort: ${fields.effort}`,
      `tools: ${tools}`,
      "skills:",
      "  - factory-result",
    ];
    if ((fields.hooks ?? []).includes("protect-test-files")) {
      lines.push(
        "hooks:",
        "  PreToolUse:",
        '    - matcher: "Edit|Write|MultiEdit|NotebookEdit|Bash"',
        "      hooks:",
        "        - type: command",
        `          command: '${this.hookCommand(project, "protect-test-files.mjs")}'`,
      );
    }
    lines.push("---", "");
    const result = fromProject(project, resultSkill);
    return lines.join("\n") + body.replaceAll("{{factory-result}}", result);
  },

  install(project) {
    const agentsDir = join(project, ".claude/agents");
    mkdirSync(agentsDir, { recursive: true });
    const sources = readdirSync(join(factoryDir, "agents")).filter((file) => file.endsWith(".md"));
    // Agents this script rendered earlier that the Factory no longer has.
    const removed = readdirSync(agentsDir).filter(
      (file) =>
        file.startsWith("factory-") &&
        !sources.includes(file) &&
        readFileSync(join(agentsDir, file), "utf8").includes(this.marker),
    );
    for (const file of removed) rmSync(join(agentsDir, file));
    for (const file of sources) {
      writeFileSync(join(agentsDir, file), this.renderAgent(project, join(factoryDir, "agents", file)));
    }

    const settingsPath = join(project, ".claude/settings.json");
    const settings = existsSync(settingsPath) ? JSON.parse(readFileSync(settingsPath, "utf8")) : {};
    settings.hooks ??= {};
    const others = (settings.hooks.Stop ?? []).filter(
      (group) => !(group.hooks ?? []).some((hook) => String(hook.command).includes("stop-validate.mjs")),
    );
    settings.hooks.Stop = [
      ...others,
      {
        hooks: [
          { type: "command", command: this.hookCommand(project, "stop-validate.mjs"), timeout: 1200 },
        ],
      },
    ];
    writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);

    const gitignore = join(project, ".gitignore");
    const ignored = existsSync(gitignore) ? readFileSync(gitignore, "utf8") : "";
    const worktrees = !ignored.split("\n").includes(".claude/worktrees/");
    if (worktrees) {
      const prefix = ignored === "" || ignored.endsWith("\n") ? "" : "\n";
      writeFileSync(gitignore, `${ignored}${prefix}# The Factory's worktrees\n.claude/worktrees/\n`);
    }

    return {
      agents: sources.map((file) => `.claude/agents/${file}`),
      removedAgents: removed.map((file) => `.claude/agents/${file}`),
      settings: ".claude/settings.json",
      gitignore: worktrees ? "added .claude/worktrees/" : "unchanged",
    };
  },
};

const adapters = { "claude-code": claudeCode };

export function install({ project, scaffold: withScaffold, agent, check }) {
  const report = { project };
  if (withScaffold) report.scaffold = scaffold(project);
  if (check || agent !== undefined) report.configProblems = checkConfig(project);
  if (agent !== undefined) {
    const adapter = adapters[agent];
    if (adapter === undefined) {
      throw new Error(`No adapter for ${agent}; supported: ${supportedAgents.join(", ")}`);
    }
    report[agent] = adapter.install(project);
  }
  return report;
}

if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    console.log(JSON.stringify(install(parseArgs(process.argv.slice(2))), null, 2));
  } catch (error) {
    console.error(String(error instanceof Error ? error.message : error));
    process.exit(1);
  }
}
