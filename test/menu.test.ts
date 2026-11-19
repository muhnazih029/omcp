import { describe, expect, test } from "bun:test";
import { menuAction, menuFooter } from "../src/ui/menu.ts";

describe("menuAction", () => {
  test("profile actions carry the highlighted profile", () => {
    expect(menuAction("e", "design")).toEqual({ kind: "edit", name: "design" });
    expect(menuAction("d", "design")).toEqual({ kind: "delete", name: "design" });
    expect(menuAction("a", "design")).toEqual({ kind: "add", name: "design" });
    expect(menuAction("s", "design")).toEqual({ kind: "sync", name: "design" });
  });

  test("global actions do not need a profile", () => {
    expect(menuAction("c", "build")).toEqual({ kind: "create" });
    expect(menuAction("x", "build")).toEqual({ kind: "custom" });
    expect(menuAction("q", "build")).toEqual({ kind: "quit" });
  });

  test("is case insensitive and ignores unrelated keys", () => {
    expect(menuAction("E", "think")).toEqual({ kind: "edit", name: "think" });
    expect(menuAction("ArrowDown", "think")).toBeNull();
    expect(menuAction(undefined, "think")).toBeNull();
  });
});

describe("menuFooter", () => {
  test("lists navigation, every action key and the contextual rule", () => {
    const footer = menuFooter();

    expect(footer).toContain("↑/↓ navigate");
    expect(footer).toContain("Enter use selected profile");
    for (const key of ["e", "d", "a", "s", "c", "x", "q"]) {
      expect(footer).toContain(key);
    }
    expect(footer).toContain("act on the highlighted profile");
  });
});
