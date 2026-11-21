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
    expect(menuAction("m", "build")).toEqual({ kind: "manage" });
    expect(menuAction("?", "build")).toEqual({ kind: "more" });
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
  test("stays on one line with arrow navigation and the primary keys", () => {
    const footer = menuFooter();

    expect(footer).toContain("[↑↓] Navigate");
    expect(footer).toContain("[Enter] Apply");
    for (const key of ["e", "a", "?", "q"]) {
      expect(footer).toContain(`[${key}]`);
    }
    expect(footer).toContain("[?] More");
    expect(footer.split("\n")).toHaveLength(1);
  });

  test("switches the more key to Close while the panel is open", () => {
    expect(menuFooter(true)).toContain("[?] Close");
    expect(menuFooter(true)).not.toContain("[?] More");
  });

  test("has a compact variant for narrow terminals", () => {
    const compact = menuFooter(false, true);
    expect(compact).toContain("↑↓ move");
    expect(compact).toContain("? more");
    expect(compact.length).toBeLessThan(menuFooter().length);
  });
});
