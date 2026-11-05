// Glob matching for the Factory's config (`testFiles`, `riskTiers`), so the hooks need nothing
// beyond Node. Paths are relative to the project, with `/` separators.
//
// - `**` matches any number of folders, including none (`**/x` matches `x` and `a/b/x`).
// - `*` matches within one path segment, `?` one character.
// - `{a,b}` matches either alternative.

/** Turns one glob into a regular expression that matches a whole path. */
export function globToRegExp(glob) {
  let source = "";
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];
    if (char === "*" && glob[i + 1] === "*") {
      const slashAfter = glob[i + 2] === "/";
      source += slashAfter ? "(?:.*/)?" : ".*";
      i += slashAfter ? 2 : 1;
    } else if (char === "*") {
      source += "[^/]*";
    } else if (char === "?") {
      source += "[^/]";
    } else if (char === "{") {
      const end = glob.indexOf("}", i);
      if (end === -1) {
        source += "\\{";
        continue;
      }
      const options = glob.slice(i + 1, end).split(",");
      source += `(?:${options.map((option) => globToRegExp(option).source.slice(1, -1)).join("|")})`;
      i = end;
    } else {
      source += char.replace(/[.+^$()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`);
}

/** Whether a project-relative path matches a glob. */
export function matchesGlob(path, glob) {
  return globToRegExp(glob).test(path);
}
