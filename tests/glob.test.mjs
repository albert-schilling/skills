import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchesGlob } from "../skills/factory/hooks/glob.mjs";

describe("matchesGlob", () => {
  const cases = [
    ["src/story.test.ts", "**/*.test.ts", true],
    ["story.test.ts", "**/*.test.ts", true],
    ["src/story.ts", "**/*.test.ts", false],
    ["src/fixtures/a/b.json", "**/fixtures/**", true],
    ["infra/main.tf", "infra/**", true],
    ["infrastructure/main.tf", "infra/**", false],
    ["apps/web/src/sign-in.tsx", "apps/**/*sign-in*", true],
    ["src/test/java/AppTest.java", "**/src/test/**", true],
    ["web/src/App.spec.ts", "**/*.{spec,test}.ts", true],
    ["web/src/App.ts", "**/*.{spec,test}.ts", false],
    ["a/b.md", "*.md", false],
    ["README.md", "*.md", true],
    ["a.ts", "?.ts", true],
    ["docs/a+b.md", "docs/a+b.md", true],
  ];
  for (const [path, glob, expected] of cases) {
    it(`${expected ? "matches" : "doesn't match"} ${path} with ${glob}`, () => {
      assert.equal(matchesGlob(path, glob), expected);
    });
  }
});
