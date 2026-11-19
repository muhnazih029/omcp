import { describe, expect, test } from "bun:test";
import {
  ensureSandbox,
  readJson,
  sandboxConfig,
} from "./helpers.ts";

describe("extractServers / writeServers", () => {
  test("accepts the deprecated top-level mcp map", async () => {
    const dir = ensureSandbox();
    await sandboxConfig(dir, {
      mcp: {
        alpha: { type: "local", command: ["bunx", "alpha"] },
      },
    });

    const { extractServers, readConfig } = await import("../src/opencode.ts");
    const state = readConfig();
    const { servers, legacy } = extractServers(state.data);

    expect(Object.keys(servers)).toEqual(["alpha"]);
    expect(legacy).toEqual(["alpha"]);
  });

  test("prefers mcp.servers and merges legacy entries", async () => {
    const dir = ensureSandbox();
    await sandboxConfig(dir, {
      mcp: {
        legacy: { type: "local", command: ["legacy"] },
        servers: { nested: { type: "remote", url: "https://example.com/mcp" } },
        timeout: { startup: 45000 },
      },
    });

    const { extractServers, readConfig } = await import("../src/opencode.ts");
    const { servers } = extractServers(readConfig().data);

    expect(Object.keys(servers).sort()).toEqual(["legacy", "nested"]);
  });

  test("migrates legacy entries and preserves unrelated keys", async () => {
    const dir = ensureSandbox();
    await sandboxConfig(dir, {
      $schema: "https://opencode.ai/config.json",
      model: "9router/main",
      mcp: {
        alpha: { type: "local", command: ["bunx", "alpha"] },
        timeout: { startup: 45000 },
      },
    });

    const { readConfig, writeServers } = await import("../src/opencode.ts");
    const state = readConfig();
    const result = writeServers(state, {
      alpha: { type: "local", command: ["bunx", "alpha"], disabled: true },
    });

    expect(result.backup).toBeDefined();

    const written = await readJson(result.path);
    expect(written.model).toBe("9router/main");
    expect(written.$schema).toBe("https://opencode.ai/config.json");
    expect((written.mcp as any).alpha).toBeUndefined();
    expect((written.mcp as any).timeout).toEqual({ startup: 45000 });
    expect((written.mcp as any).servers.alpha.disabled).toBe(true);
  });

  test("does not write when the content is unchanged", async () => {
    const dir = ensureSandbox();
    await sandboxConfig(dir, {
      mcp: { alpha: { type: "local", command: ["alpha"] } },
    });

    const { readConfig, writeServers } = await import("../src/opencode.ts");
    const servers = { alpha: { type: "local" as const, command: ["alpha"] } };

    const first = writeServers(readConfig(), servers);
    const second = writeServers(readConfig(), servers);

    expect(first.backup).toBeDefined();
    expect(second.backup).toBeUndefined();
  });
});
