import { describe, expect, test } from "bun:test";
import { serverAction, serverMenuFooter } from "../src/ui/servers.ts";
import {
  emptyStore,
  isServerName,
  removeCatalogEntry,
  renameCatalogEntry,
} from "../src/store.ts";

function seed() {
  const store = emptyStore();
  store.catalog.alpha = { server: { type: "local", command: ["alpha"] } };
  store.catalog.beta = { server: { type: "local", command: ["beta"] } };
  store.profiles.full = { servers: ["*"] };
  store.profiles.build = { servers: ["alpha", "beta"] };
  store.profiles.think = { servers: ["alpha"] };
  return store;
}

describe("serverAction", () => {
  test("edit and delete target the highlighted server", () => {
    expect(serverAction("e", "figcraft")).toEqual({ kind: "edit", name: "figcraft" });
    expect(serverAction("d", "figcraft")).toEqual({ kind: "delete", name: "figcraft" });
  });

  test("unrelated keys are ignored; Esc is handled by the prompt as back", () => {
    expect(serverAction("ArrowDown", "figcraft")).toBeNull();
    expect(serverAction("q", "figcraft")).toBeNull();
    expect(serverAction(undefined, "figcraft")).toBeNull();
  });
});

describe("serverMenuFooter", () => {
  test("stays two lines and lists all keys", () => {
    const footer = serverMenuFooter();
    expect(footer.split("\n")).toHaveLength(2);
    for (const key of ["e", "d"]) expect(footer).toContain(key);
    expect(footer).toContain("esc back");
    expect(footer).toContain("↑↓");
  });
});

describe("server names", () => {
  test("accepts OpenCode-safe ids only", () => {
    expect(isServerName("figcraft")).toBe(true);
    expect(isServerName("my_server-2")).toBe(true);
    expect(isServerName("two words")).toBe(false);
    expect(isServerName("../escape")).toBe(false);
    expect(isServerName("")).toBe(false);
  });
});

describe("renameCatalogEntry", () => {
  test("moves the catalog key and rewrites explicit profiles", () => {
    const store = seed();
    expect(renameCatalogEntry(store, "alpha", "figcraft")).toBe(true);
    expect(store.catalog.figcraft).toBeDefined();
    expect(store.catalog.alpha).toBeUndefined();
    expect(store.profiles.build!.servers).toEqual(["figcraft", "beta"]);
    expect(store.profiles.think!.servers).toEqual(["figcraft"]);
    expect(store.profiles.full!.servers).toEqual(["*"]);
  });

  test("refuses collisions, unknowns, invalid names and no-ops keep the entry", () => {
    const store = seed();
    expect(renameCatalogEntry(store, "alpha", "beta")).toBe(false);
    expect(renameCatalogEntry(store, "missing", "new")).toBe(false);
    expect(renameCatalogEntry(store, "alpha", "bad name")).toBe(false);
    expect(renameCatalogEntry(store, "alpha", "alpha")).toBe(true);
  });
});

describe("removeCatalogEntry", () => {
  test("drops the entry and every explicit reference", () => {
    const store = seed();
    expect(removeCatalogEntry(store, "alpha")).toBe(true);
    expect(store.catalog.alpha).toBeUndefined();
    expect(store.profiles.build!.servers).toEqual(["beta"]);
    expect(store.profiles.think!.servers).toEqual([]);
    expect(store.profiles.full!.servers).toEqual(["*"]);
  });

  test("reports a missing entry", () => {
    const store = seed();
    expect(removeCatalogEntry(store, "missing")).toBe(false);
  });
});
