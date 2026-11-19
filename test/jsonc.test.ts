import { describe, expect, test } from "bun:test";
import { parseJsonc, stripComments, stripJsonc, stripTrailingCommas } from "../src/jsonc.ts";

describe("stripComments", () => {
  test("removes line and block comments", () => {
    const input = `{
      // a line comment
      "a": 1, /* inline */ "b": 2
    }`;
    const { text, hadComments } = stripComments(input);
    expect(hadComments).toBe(true);
    expect(parseJsonc(text)).toEqual({ a: 1, b: 2 });
  });

  test("keeps comment markers inside strings", () => {
    const input = `{ "url": "https://example.com//path", "note": "/* not a comment */" }`;
    const { text, hadComments } = stripComments(input);
    expect(hadComments).toBe(false);
    expect(parseJsonc(text)).toEqual({
      url: "https://example.com//path",
      note: "/* not a comment */",
    });
  });

  test("respects escaped quotes", () => {
    const input = `{ "a": "he said \\"hi\\" // still a string" } // trailing`;
    const { text } = stripComments(input);
    expect(parseJsonc(text)).toEqual({ a: 'he said "hi" // still a string' });
  });
});

describe("stripTrailingCommas", () => {
  test("removes trailing commas in objects and arrays", () => {
    const input = `{ "a": [1, 2, 3,], "b": { "c": 1, }, }`;
    expect(parseJsonc(stripTrailingCommas(input))).toEqual({ a: [1, 2, 3], b: { c: 1 } });
  });

  test("leaves commas inside strings alone", () => {
    const input = `{ "a": "one, two,", }`;
    expect(parseJsonc(stripTrailingCommas(input))).toEqual({ a: "one, two," });
  });
});

describe("stripJsonc", () => {
  test("handles a realistic opencode.jsonc", () => {
    const input = `{
      "$schema": "https://opencode.ai/config.json",
      // default model
      "model": "9router/main",
      "mcp": {
        "servers": {
          "github": {
            "type": "local",
            "command": ["bunx", "-y", "@modelcontextprotocol/server-github"],
            "environment": { "TOKEN": "{env:GITHUB_TOKEN}" },
          },
        },
      },
    }`;
    const parsed = parseJsonc(stripJsonc(input)) as Record<string, any>;
    expect(parsed.model).toBe("9router/main");
    expect(parsed.mcp.servers.github.command).toEqual([
      "bunx",
      "-y",
      "@modelcontextprotocol/server-github",
    ]);
  });
});
