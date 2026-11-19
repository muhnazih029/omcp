import { describe, expect, test } from "bun:test";
import { applyProfile, applyServerSet } from "../src/apply.ts";
import { activeProfile, bootstrapStore, enabledServers, loadStore } from "../src/store.ts";
import { ensureSandbox, readJson, sandboxConfig } from "./helpers.ts";

function seed(dir: string) {
  return sandboxConfig(dir, {
    model: "9router/main",
    mcp: {
      pencil: { type: "local", command: ["pencil-mcp"] },
      "claude-mem": { type: "local", command: ["node", "mem.cjs"] },
      context7: { type: "local", command: ["bunx", "-y", "@upstash/context7-mcp"] },
      github: { type: "local", command: ["bunx", "-y", "github-mcp"] },
      "dank-todo": { type: "local", command: ["bun", "todo.ts"] },
    },
  });
}

describe("bootstrapStore", () => {
  test("imports every server and seeds all five starter profiles empty", async () => {
    const dir = ensureSandbox();
    await seed(dir);

    const store = bootstrapStore();

    expect(Object.keys(store.catalog).sort()).toEqual([
      "claude-mem",
      "context7",
      "dank-todo",
      "github",
      "pencil",
    ]);

    expect(Object.keys(store.profiles).sort()).toEqual([
      "build",
      "design",
      "full",
      "minimal",
      "think",
    ]);
    expect(store.profiles.design?.servers).toEqual([]);
    expect(store.profiles.think?.servers).toEqual([]);
    expect(store.profiles.build?.servers).toEqual([]);
    expect(store.profiles.full?.servers).toEqual(["*"]);
    expect(store.profiles.minimal?.servers).toEqual([]);
  });

  test("still seeds all five profiles when the catalog is tiny", async () => {
    const dir = ensureSandbox();
    await sandboxConfig(dir, {
      mcp: { only: { type: "local", command: ["only-mcp"] } },
    });

    const store = bootstrapStore();
    expect(Object.keys(store.profiles).sort()).toEqual([
      "build",
      "design",
      "full",
      "minimal",
      "think",
    ]);
    expect(store.catalog.only).toBeDefined();
  });
});

describe("applyProfile", () => {
  test("enables exactly the profile servers and disables the rest", async () => {
    const dir = ensureSandbox();
    const configPath = await seed(dir);

    const store = loadStore();
    store.profiles.design!.servers = ["pencil"];
    const result = applyProfile(store, "design");

    expect(result.enabled).toEqual(["pencil"]);

    const written = await readJson(configPath);
    const servers = written.mcp.servers;

    expect(servers.pencil.disabled).toBeUndefined();
    expect(servers.github.disabled).toBe(true);
    expect(servers.context7.disabled).toBe(true);
    expect(written.model).toBe("9router/main");
  });

  test("full profile expands to every catalog server", async () => {
    const dir = ensureSandbox();
    const configPath = await seed(dir);

    const store = loadStore();
    const result = applyProfile(store, "full");

    expect(result.enabled).toEqual(Object.keys(store.catalog));
    expect(result.missing).toEqual([]);

    const written = await readJson(configPath);
    for (const name of Object.keys(written.mcp.servers)) {
      expect(written.mcp.servers[name].disabled).toBeUndefined();
    }
  });

  test("minimal profile disables everything but keeps definitions", async () => {
    const dir = ensureSandbox();
    const configPath = await seed(dir);

    const store = loadStore();
    applyProfile(store, "minimal");

    const written = await readJson(configPath);
    const names = Object.keys(written.mcp.servers);
    expect(names).toHaveLength(5);
    for (const name of names) {
      expect(written.mcp.servers[name].disabled).toBe(true);
    }
  });

  test("reports unknown profile names", async () => {
    const dir = ensureSandbox();
    await seed(dir);
    const store = loadStore();
    expect(() => applyProfile(store, "nope")).toThrow(/Unknown profile/);
  });
});

describe("activeProfile", () => {
  test("detects the profile that matches the enabled set", async () => {
    const dir = ensureSandbox();
    await seed(dir);

    const store = loadStore();
    store.profiles.think!.servers = ["claude-mem", "context7"];
    applyProfile(store, "think");
    expect(activeProfile(store)).toBe("think");

    applyProfile(store, "minimal");
    expect(activeProfile(store)).toBe("minimal");
    expect(enabledServers()).toEqual([]);
  });

  test("returns null for a hand picked set", async () => {
    const dir = ensureSandbox();
    await seed(dir);

    const store = loadStore();
    applyServerSet(store, ["github"]);
    expect(activeProfile(store)).toBeNull();
  });
});

describe("syncCatalogFromConfig", () => {
  test("picks up servers added outside omcp", async () => {
    const dir = ensureSandbox();
    await seed(dir);

    const store = loadStore();
    expect(store.catalog.pencil).toBeDefined();

    await sandboxConfig(dir, {
      mcp: {
        servers: {
          pencil: { type: "local", command: ["pencil-mcp"] },
          fresh: { type: "remote", url: "https://fresh.example/mcp" },
        },
      },
    });

    delete store.catalog.fresh;

    const { syncCatalogFromConfig } = await import("../src/store.ts");
    syncCatalogFromConfig(store);

    const freshEntry = Object.entries(store.catalog).find(([name]) => name === "fresh")?.[1];
    expect(freshEntry?.server.type).toBe("remote");
  });
});
