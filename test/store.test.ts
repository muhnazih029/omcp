import { describe, expect, test } from "bun:test";
import {
  emptyStore,
  isWildcardProfile,
  normalizeStore,
  profileServerNames,
} from "../src/store.ts";

describe("launchMode persistence", () => {
  test("round-trips a valid choice through normalizeStore", () => {
    const store = normalizeStore({
      version: 1,
      profiles: {},
      catalog: {},
      launchMode: "omcp",
    });

    expect(store.launchMode).toBe("omcp");
    expect(normalizeStore(store).launchMode).toBe("omcp");
  });

  test("keeps every valid choice", () => {
    for (const mode of ["wrapper", "omcp", "later"] as const) {
      expect(normalizeStore({ launchMode: mode }).launchMode).toBe(mode);
    }
  });

  test("ignores unknown values", () => {
    expect(normalizeStore({ launchMode: "bogus" }).launchMode).toBeUndefined();
  });
});

describe("profileServerNames", () => {
  test("expands the wildcard to every catalog server", () => {
    const store = emptyStore();
    store.catalog.alpha = { server: { type: "local", command: ["alpha"] } };
    store.catalog.beta = { server: { type: "remote", url: "https://example.com/mcp" } };

    const profile = { servers: ["*"] };
    expect(profileServerNames(store, profile)).toEqual(["alpha", "beta"]);
    expect(isWildcardProfile(profile)).toBe(true);
  });

  test("keeps explicit server lists unchanged", () => {
    const store = emptyStore();
    const profile = { servers: ["github", "pencil"] };

    expect(profileServerNames(store, profile)).toEqual(["github", "pencil"]);
    expect(isWildcardProfile(profile)).toBe(false);
  });

  test("only treats a lone wildcard as dynamic", () => {
    const store = emptyStore();
    store.catalog.alpha = { server: { type: "local", command: ["alpha"] } };
    const profile = { servers: ["*", "alpha"] };

    expect(profileServerNames(store, profile)).toEqual(["*", "alpha"]);
    expect(isWildcardProfile(profile)).toBe(false);
  });
});
