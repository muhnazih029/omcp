import { describe, expect, test } from "bun:test";
import { normalizeStore } from "../src/store.ts";

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
