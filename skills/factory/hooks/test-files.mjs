// The logic of the implementer's test-file guard, independent of any coding agent: given a tool
// call, it returns the test file the call would change, or undefined. A coding agent's wrapper
// (hooks/<agent>/protect-test-files.mjs) turns that into the agent's own hook protocol.
//
// Test files are the `testFiles` globs in .agents/factory.json. For shell commands it catches the
// ones that plainly write a file (redirects, rm, sed -i, git checkout, …), following `cd` and
// looking inside directories they remove or restore; the standards reviewer's cheat detection
// catches the rest.
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { globToRegExp } from "./glob.mjs";

export const configPath = ".agents/factory.json";

/** Reads the test file globs from the project's Factory config; throws when they're missing. */
export function readTestFiles(root) {
  const config = JSON.parse(readFileSync(resolve(root, configPath), "utf8"));
  const globs = config?.testFiles;
  // An empty list would protect nothing, so it fails closed like a missing one.
  if (!Array.isArray(globs) || globs.length === 0 || !globs.every((glob) => typeof glob === "string")) {
    throw new Error("testFiles must be a list of at least one glob");
  }
  return globs;
}

const writingPrograms = new Set(["rm", "mv", "cp", "tee", "touch", "truncate", "ln", "dd", "patch"]);
// Their last argument is a destination that keeps its other files.
const copyingPrograms = new Set(["mv", "cp", "ln"]);
// They only read their sources; mv removes its sources, so it changes them too.
const sourceReadingPrograms = new Set(["cp", "ln"]);
const writingGitCommands = new Set(["checkout", "restore", "rm", "mv", "apply"]);
const prefixes = new Set(["sudo", "env", "command", "xargs", "nohup", "time"]);
const skippedDirectories = new Set(["node_modules", ".git", ".nx"]);

// The paths a shell command may write: redirect targets, and the arguments of writing programs,
// each resolved against the directory its part of the command runs in. Undefined when a `cd` goes
// somewhere this can't follow before something is written.
function shellTargets(command, cwd) {
  const targets = [];
  let dir = cwd;
  for (const segment of splitCommand(withoutHeredocBodies(command))) {
    const written = [...segment.matchAll(/>>?\|?\s*(['"]?)([^\s'";&|<>()]+)\1/g)].map((m) => ({
      path: m[2],
      recursive: false,
    }));
    const words = segment
      .trim()
      .match(/"[^"]*"|'[^']*'|\S+/g)
      ?.map((word) => word.replace(/^['"]|['"]$/g, "")) ?? [];
    while (words.length > 0 && (prefixes.has(words[0]) || /^\w+=/.test(words[0]))) words.shift();
    const [program = "", ...args] = words;
    if (program === "cd" || program === "pushd") {
      const to = args[0];
      dir = to === undefined || /^[-~$]/.test(to) || dir === undefined ? undefined : resolve(dir, to);
      continue;
    }
    const inPlace = ["sed", "perl"].includes(program) && args.some((arg) => /^-\w*i/.test(arg));
    const gitWrite = program === "git" && writingGitCommands.has(args[0] ?? "");
    if (writingPrograms.has(program) || inPlace || gitWrite) {
      const paths = ["sed", "perl"].includes(program) ? scriptFreeArgs(args) : args.filter((arg) => !arg.startsWith("-"));
      const destination = copyingPrograms.has(program) && paths.length > 1 ? paths.at(-1) : undefined;
      // Into a folder (one that exists, or a path ending in `/`), each source lands under its name.
      const intoFolder =
        destination !== undefined &&
        (destination.endsWith("/") || (dir !== undefined && isDirectory(resolve(dir, destination))));
      for (const path of paths) {
        if (path === destination) continue;
        if (destination === undefined || !sourceReadingPrograms.has(program)) written.push({ path, recursive: true });
        if (intoFolder) written.push({ path: join(destination, basename(path)), recursive: true });
      }
      if (destination !== undefined) written.push({ path: destination, recursive: false });
    }
    if (written.length === 0) continue;
    if (dir === undefined) return undefined;
    const from = dir;
    targets.push(...written.map(({ path, recursive }) => widen({ path: resolve(from, path), recursive })));
  }
  return targets;
}

// The file arguments of sed or perl: their script (`s#a.*#b#`) is not a path, though a wildcard in
// it would otherwise stand for a whole folder. The script is the value of `-e`/`-f`, or else the
// first argument that isn't an option. Other options with a separate value (`sed -l N`,
// `perl -I dir`) make that value count as the script, so the real script lands in the files: that
// only denies more, never less.
function scriptFreeArgs(args) {
  const files = [];
  let hasScript = args.some((arg) => /^-\w*[ef]$/.test(arg) || /^--(expression|file)/.test(arg));
  let takesValue = false;
  for (const arg of args) {
    if (takesValue) takesValue = false;
    else if (arg.startsWith("-")) takesValue = /^-\w*[ef]$/.test(arg) || /^--(expression|file)$/.test(arg);
    else if (!hasScript) hasScript = true;
    else files.push(arg);
  }
  return files;
}

// Splits a command into its parts at `&&`, `||`, `;`, `|` and newlines, but not where one is inside
// single or double quotes (`sed -i 's|a|b|' file`). Only simple quoting is followed.
function splitCommand(command) {
  const parts = [];
  let part = "";
  let quote;
  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    if (quote !== undefined) {
      if (char === quote) quote = undefined;
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (/[;|\n]/.test(char) || (char === "&" && command[i + 1] === "&")) {
      if (command.startsWith(char + char, i)) i++;
      parts.push(part);
      part = "";
      continue;
    }
    part += char;
  }
  parts.push(part);
  return parts;
}

// A heredoc's body is data for a program, not commands, so its lines aren't checked. Anything that
// only looks like a heredoc (`$((1<<2))`, `<<<`, a `<<` in quotes) never reaches a terminator line,
// and then the whole command is checked, so a misread can only deny too much, never too little.
function withoutHeredocBodies(command) {
  const kept = [];
  let end;
  for (const line of command.split("\n")) {
    if (end !== undefined) {
      if (line.trim() === end) end = undefined;
      continue;
    }
    kept.push(line);
    const opener = line.replace(/\$\(\([^)]*\)\)/g, "").match(/(?<!<)<<(?!<)-?\s*(\S+)/);
    end = opener?.[1].replace(/^['"\\]+|['"]+$/g, "");
  }
  return end === undefined ? kept.join("\n") : command;
}

// Whether git ignores the path, as build output usually is; false outside a repository.
function isGitIgnored(path) {
  return spawnSync("git", ["-C", dirname(path), "check-ignore", "-q", path]).status === 0;
}

// The shell expands a wildcard the hook can't see, so a path with one stands for its folder up to
// the first wildcard, with everything below it (`src/*` → all of `src`).
function widen({ path, recursive }) {
  const segments = path.split("/");
  const first = segments.findIndex((segment) => /[*?[]/.test(segment));
  if (first === -1) return { path, recursive };
  return { path: segments.slice(0, first).join("/") || "/", recursive: true };
}

function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Checks one tool call. `call` is `{ kind: "edit", path }` for a file edit or
 * `{ kind: "shell", command }` for a shell command; `cwd` is where it runs.
 * Returns `{ deny: reason }`, or `{}` when the call may go ahead.
 */
export function checkToolCall(call, { root, cwd = root, testFiles }) {
  const patterns = testFiles.map(globToRegExp);
  const isTestFile = (fromRoot) => patterns.some((pattern) => pattern.test(fromRoot));

  // The first test file at or, for a recursive target, below the path, relative to the project.
  const testFileAt = ({ path, recursive }) => {
    const fromRoot = relative(root, path).split("\\").join("/");
    if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) return undefined;
    if (isTestFile(fromRoot)) return isGitIgnored(path) ? undefined : fromRoot;
    if (!recursive || !isDirectory(path)) return undefined;
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (skippedDirectories.has(entry.name)) continue;
      const found = testFileAt({ path: join(path, entry.name), recursive: entry.isDirectory() });
      if (found !== undefined) return found;
    }
    return undefined;
  };

  const targets =
    call.kind === "shell"
      ? shellTargets(call.command, cwd)
      : call.path === undefined
        ? []
        : [{ path: resolve(cwd, call.path), recursive: false }];

  if (targets === undefined) {
    return {
      deny:
        "This command changes to a directory the hook can't follow (`cd -`, `~` or a variable) and " +
        "then writes, so it can't tell whether it touches a test file. Use paths from the project " +
        "directory instead.",
    };
  }
  const testFile = targets.map(testFileAt).find((found) => found !== undefined);
  if (testFile === undefined) return {};
  return {
    deny:
      `${testFile} is a test file, and the implementer doesn't change tests. If a test is wrong ` +
      "or can't pass, stop and return `blocked`, naming the test and why.",
  };
}
