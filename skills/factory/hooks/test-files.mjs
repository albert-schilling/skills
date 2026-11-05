// The logic of the implementer's test-file guard, independent of any coding agent: given a tool
// call, it returns the test file the call would change, or undefined. A coding agent's wrapper
// (hooks/<agent>/protect-test-files.mjs) turns that into the agent's own hook protocol.
//
// Test files are the `testFiles` globs in .agents/factory.json. For shell commands it catches the
// ones that plainly write a file (redirects, rm, sed -i, git checkout, …), following `cd` and
// looking inside directories they remove or restore; the standards reviewer's cheat detection
// catches the rest.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
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
  for (const segment of command.split(/&&|\|\||[;|\n]/)) {
    const written = [...segment.matchAll(/>>?\|?\s*(['"]?)([^\s'";&|<>()]+)\1/g)].map((m) => ({
      path: m[2],
      recursive: false,
    }));
    const words = segment
      .trim()
      .split(/\s+/)
      .map((word) => word.replace(/^['"]|['"]$/g, ""));
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
      const paths = args.filter((arg) => !arg.startsWith("-"));
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
    if (isTestFile(fromRoot)) return fromRoot;
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
