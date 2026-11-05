#!/usr/bin/env node
// Renders the phase agents (skills/factory/agents/*.md, neutral format) into each coding agent's
// own format, under skills/factory/adapters/<agent>/. The rendered files ship with the skill, so
// `factory-setup` only copies them and a project needs no build step:
//
//   node scripts/render-adapters.mjs          # write the rendered files
//   node scripts/render-adapters.mjs --check  # fail when they're out of date (tests and CI)
//
// This script stays in this repository; it isn't part of an installed skill.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const factoryDir = join(repo, "skills/factory");

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

// Claude Code finds the installed skills in .claude/skills/, whether `npx skills` copied them
// there or linked them from .agents/skills/, so the rendered files can name fixed paths.
const claudeCode = {
  models: { strong: "opus", fast: "sonnet" },
  tools: { read: "Read, Grep, Glob, Bash", write: "Read, Grep, Glob, Edit, Write, Bash" },
  hook: (script) => `node "$CLAUDE_PROJECT_DIR"/.claude/skills/factory/hooks/claude-code/${script}`,
  resultSkill: ".claude/skills/factory-result/SKILL.md",

  render(name, text) {
    const { fields, body } = parseAgent(text);
    const model = this.models[fields.model];
    const tools = this.tools[fields.access];
    if (model === undefined || tools === undefined) {
      throw new Error(`${name}: model must be strong or fast, access read or write`);
    }
    const lines = [
      "---",
      `# Rendered from .claude/skills/factory/agents/${name}; /factory-setup copies it here. Change the source, not this file.`,
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
        `          command: '${this.hook("protect-test-files.mjs")}'`,
      );
    }
    lines.push("---", "");
    return lines.join("\n") + body.replaceAll("{{factory-result}}", this.resultSkill);
  },

  // The project settings the Factory adds: the Stop hook that runs `validate`.
  settings() {
    const hook = { type: "command", command: this.hook("stop-validate.mjs"), timeout: 1200 };
    return { hooks: { Stop: [{ hooks: [hook] }] } };
  },
};

export const adapters = { "claude-code": claudeCode };

/** The files each adapter ships, by path from the repository root, with their content. */
export function renderAll() {
  const files = {};
  const sources = readdirSync(join(factoryDir, "agents")).filter((file) => file.endsWith(".md"));
  for (const [agent, adapter] of Object.entries(adapters)) {
    const dir = `skills/factory/adapters/${agent}`;
    for (const file of sources) {
      files[`${dir}/agents/${file}`] = adapter.render(file, readFileSync(join(factoryDir, "agents", file), "utf8"));
    }
    files[`${dir}/settings.json`] = `${JSON.stringify(adapter.settings(), null, 2)}\n`;
  }
  return files;
}

/** The rendered files that are missing or differ from what's committed. */
export function staleFiles() {
  return Object.entries(renderAll())
    .filter(([path, content]) => !existsSync(join(repo, path)) || readFileSync(join(repo, path), "utf8") !== content)
    .map(([path]) => path);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--check")) {
    const stale = staleFiles();
    if (stale.length > 0) {
      console.error(`Out of date; run node scripts/render-adapters.mjs:\n${stale.join("\n")}`);
      process.exit(1);
    }
  } else {
    for (const [path, content] of Object.entries(renderAll())) {
      mkdirSync(dirname(join(repo, path)), { recursive: true });
      writeFileSync(join(repo, path), content);
    }
  }
}
