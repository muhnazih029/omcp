import * as p from "@clack/prompts";
import { setupWrapper } from "../setup.ts";
import { saveStore } from "../store.ts";
import type { Store } from "../types.ts";
import { shortPath } from "../util.ts";
import { ask, errorMessage } from "./common.ts";

type LaunchMode = NonNullable<Store["launchMode"]>;

/**
 * First-run chooser. Guests can try omcp without touching their `opencode`
 * command, while people who want the menu on every launch opt into the wrapper.
 */
export async function runOnboarding(store: Store): Promise<void> {
  p.intro("Welcome to omcp");
  p.note(
    [
      "omcp connects only the MCP servers you need for the current task.",
      "Pick how you want to launch it. You can change this any time with",
      "`omcp setup` or `omcp setup --remove`.",
    ].join("\n"),
    "First run",
  );

  const choice = await ask(
    await p.select<LaunchMode>({
      message: "How do you want to launch?",
      options: [
        {
          value: "wrapper",
          label: "Install the opencode wrapper",
          hint: "typing `opencode` opens the profile menu first",
        },
        {
          value: "omcp",
          label: "Use the omcp command only",
          hint: "great for a quick try; leaves opencode untouched",
        },
        {
          value: "later",
          label: "Decide later",
          hint: "run `omcp setup` any time",
        },
      ],
    }),
  );

  if (choice === "wrapper") {
    try {
      const result = setupWrapper();
      store.launchMode = "wrapper";
      saveStore(store);
      p.log.success(`Wrapper installed at ${shortPath(result.path)}`);
      p.log.info("Make sure ~/.local/bin comes before the real binary in PATH.");
      p.log.info("`omcp doctor` checks this for you.");
    } catch (error) {
      p.log.warn(`Could not install the wrapper: ${errorMessage(error)}`);
      p.log.info("You can still use `omcp` directly, or retry with `omcp setup`.");
      store.launchMode = "omcp";
      saveStore(store);
    }
  } else {
    store.launchMode = choice;
    saveStore(store);
    if (choice === "omcp") {
      p.log.success("Using the `omcp` command. Run `omcp setup` if you change your mind.");
    } else {
      p.log.info("No problem. Run `omcp setup` when you want the wrapper.");
    }
  }

  p.outro("Your starter profiles are ready. Pick one to begin.");
}
