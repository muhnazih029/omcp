import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describeExternal, externalServers, markExternal } from "../src/external.ts";
import { emptyStore } from "../src/store.ts";
import type { CatalogEntry, Store } from "../src/types.ts";

const SANDBOX_ROOT = "/tmp/opencode";

function withCatalog(catalog: Record<string, CatalogEntry>): Store {
  const store = emptyStore();
  store.catalog = catalog;
  return store;
}

function sandbox(): string {
  return mkdtempSync(join(SANDBOX_ROOT, "omcp-external-"));
}

describe("externalServers", () => {
  test("flags a server that has a plugin file with the same name", () => {
    const dir = sandbox();
    mkdirSync(join(dir, "plugins"));
    writeFileSync(join(dir, "plugins", "claude-mem.js"), "export const x = 1;\n", "utf8");

    const store = withCatalog({
      "claude-mem": { server: { type: "local", command: ["node", "server.js"] } },
    });

    const external = externalServers(store, dir);
    expect(external["claude-mem"]).toEqual({
      plugin: join(dir, "plugins", "claude-mem.js"),
      reason: "declared by claude-mem.js",
    });
  });

  test("matches names regardless of dashes and case", () => {
    const dir = sandbox();
    mkdirSync(join(dir, "plugins"));
    writeFileSync(join(dir, "plugins", "Claude_Mem.mjs"), "export const x = 1;\n", "utf8");

    const store = withCatalog({
      "claude-mem": { server: { type: "local", command: ["node", "server.js"] } },
    });

    expect(externalServers(store, dir)["claude-mem"]?.plugin).toContain("Claude_Mem.mjs");
  });

  test("flags a command that runs from a plugin install", () => {
    const dir = sandbox();

    const store = withCatalog({
      pencil: {
        server: {
          type: "local",
          command: ["/home/me/.claude/plugins/cache/vendor/plugin/scripts/mcp-server.cjs"],
        },
      },
    });

    expect(externalServers(store, dir)).toEqual({
      pencil: { reason: "command runs from a plugin install" },
    });
  });

  test("leaves ordinary servers alone and tolerates a missing plugins directory", () => {
    const dir = sandbox();

    const store = withCatalog({
      github: { server: { type: "local", command: ["bunx", "-y", "@modelcontextprotocol/server-github"] } },
      context7: { server: { type: "local", command: ["bunx", "-y", "@upstash/context7-mcp"] } },
    });

    expect(externalServers(store, dir)).toEqual({});
  });
});

describe("external markers", () => {
  test("marks only plugin-provided servers", () => {
    const external = { "claude-mem": { reason: "declared by claude-mem.js" } };

    expect(markExternal("claude-mem", external)).toBe("claude-mem*");
    expect(markExternal("github", external)).toBe("github");
  });

  test("explains why the server cannot be disabled", () => {
    expect(describeExternal("claude-mem", { reason: "declared by claude-mem.js" })).toBe(
      "claude-mem (declared by claude-mem.js) — cannot be disabled by omcp",
    );
  });
});
