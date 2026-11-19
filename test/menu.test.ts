import { describe, expect, test } from "bun:test";
import { emptyStore } from "../src/store.ts";
import type { Store } from "../src/types.ts";
import { menuBindings, parseChoice } from "../src/ui/menu.ts";
import { ensureSandbox } from "./helpers.ts";

function sampleStore(): Store {
  ensureSandbox();
  const store = emptyStore();
  for (const name of ["build", "design", "full", "minimal", "think"]) {
    store.profiles[name] = { servers: name === "full" ? ["*"] : [] };
  }
  return store;
}

describe("menuBindings", () => {
  test("maps 1-5 to profiles in a stable alphabetical order", () => {
    const bindings = menuBindings(sampleStore());
    const profiles = bindings.filter((binding) => /^\d$/.test(binding.key));

    expect(profiles.map((binding) => binding.key)).toEqual(["1", "2", "3", "4", "5"]);
    expect(profiles.map((binding) => binding.target)).toEqual([
      "build",
      "design",
      "full",
      "minimal",
      "think",
    ]);
  });

  test("binds each action key exactly once", () => {
    const bindings = menuBindings(sampleStore());
    const actions = Object.fromEntries(
      bindings
        .filter((binding) => !/^\d$/.test(binding.key))
        .map((binding) => [binding.key, binding.target]),
    );

    expect(actions).toEqual({
      x: "action:custom",
      e: "action:edit",
      c: "action:create",
      a: "action:add",
      s: "action:sync",
      d: "action:delete",
      q: "action:quit",
    });
  });

  test("parseChoice resolves keys back to profiles and actions", () => {
    const bindings = menuBindings(sampleStore());

    expect(parseChoice("1", bindings)).toEqual({ kind: "profile", name: "build" });
    expect(parseChoice("3", bindings)).toEqual({ kind: "profile", name: "full" });
    expect(parseChoice("e", bindings)).toEqual({ kind: "edit" });
    expect(parseChoice("q", bindings)).toEqual({ kind: "quit" });
    expect(parseChoice("Z", bindings)).toEqual({ kind: "quit" });
  });

  test("the full profile uses a dynamic hint, not a server list", () => {
    const store = sampleStore();
    store.catalog.github = { server: { type: "local", command: ["github-mcp"] } };

    const full = menuBindings(store).find((binding) => binding.target === "full");
    expect(full?.hint).toContain("all configured servers");
  });
});
