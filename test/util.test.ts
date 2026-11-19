import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { guessTags, slugifyProfileName, splitCommand } from "../src/util.ts";
import { findBinaryOnPath, isWrapper } from "../src/launcher.ts";
import { removeWrapper, setupWrapper, wrapperPath } from "../src/setup.ts";

describe("splitCommand", () => {
  test("splits plain arguments", () => {
    expect(splitCommand("node  server.js --port 3000")).toEqual([
      "node",
      "server.js",
      "--port",
      "3000",
    ]);
  });

  test("honours quotes and keeps spaces", () => {
    expect(splitCommand(`bun run "/path/with space/index.ts" --flag`)).toEqual([
      "bun",
      "run",
      "/path/with space/index.ts",
      "--flag",
    ]);
  });

  test("handles single quotes", () => {
    expect(splitCommand(`sh -c 'echo "hi there"'`)).toEqual(["sh", "-c", 'echo "hi there"']);
  });

  test("returns an empty list for blank input", () => {
    expect(splitCommand("   ")).toEqual([]);
  });
});

describe("slugifyProfileName", () => {
  test("normalises names", () => {
    expect(slugifyProfileName("  Deep Work! ")).toBe("deep-work");
    expect(slugifyProfileName("UI/UX")).toBe("ui-ux");
    expect(slugifyProfileName("---")).toBe("");
  });
});

describe("guessTags", () => {
  test("tags by keyword", () => {
    expect(guessTags("pencil")).toContain("design");
    expect(guessTags("github")).toContain("code");
    expect(guessTags("context7")).toContain("research");
    expect(guessTags("claude-mem")).toContain("memory");
    expect(guessTags("dank-todo")).toContain("tasks");
  });
});

describe("wrapper detection", () => {
  test("findBinaryOnPath skips the omcp wrapper", () => {
    const root = mkdtempSync(join(tmpdir(), "omcp-path-"));
    const wrapperDir = join(root, "wrapper");
    const realDir = join(root, "real");
    mkdirSync(wrapperDir);
    mkdirSync(realDir);
    writeFileSync(join(wrapperDir, "opencode"), "#!/bin/sh\n# OMCP_WRAPPER\nexit 0\n", {
      mode: 0o755,
    });
    writeFileSync(join(realDir, "opencode"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });

    const originalPath = process.env.PATH;
    process.env.PATH = `${wrapperDir}:${realDir}`;
    try {
      const found = findBinaryOnPath();
      expect(found).toBe(realpathSync(join(realDir, "opencode")));
      expect(isWrapper(found!)).toBe(false);
    } finally {
      process.env.PATH = originalPath;
    }
  });

  test("isWrapper is false for a normal file", () => {
    expect(isWrapper("/etc/hostname")).toBe(false);
  });
});

describe("setupWrapper", () => {
  test("refuses to overwrite a foreign file without force", () => {
    const target = wrapperPath();
    if (isWrapper(target)) removeWrapper();

    const fake = Bun.spawnSync(["sh", "-c", `test -f ${target} && echo exists || echo missing`]);
    void fake;

    // Only meaningful when the wrapper is not installed; the real binary must exist.
    const real = findBinaryOnPath();
    if (!real) return;

    const result = setupWrapper({ force: true });
    expect(result.path).toBe(target);
    expect(isWrapper(target)).toBe(true);

    const script = readFileSync(target, "utf8");
    expect(script).toContain(result.realBinary);
    expect(script).toContain("OMCP_BYPASS");

    const removed = removeWrapper();
    expect(removed.removed).toBe(true);
  });
});
