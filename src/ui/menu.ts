import * as p from "@clack/prompts";
import { applyServerSet } from "../apply.ts";
import { launchOpenCode, resolveBinary } from "../launcher.ts";
import { findConfigPath } from "../paths.ts";
import {
  activeProfile,
  enabledServers,
  isWildcardProfile,
  profileLabel,
  profileServerNames,
  removeProfile,
  resolveProfile,
  saveStore,
  syncCatalogFromConfig,
} from "../store.ts";
import type { Profile, Store } from "../types.ts";
import { shortPath, slugifyProfileName } from "../util.ts";
import {
  ask,
  backOption,
  BACK_VALUE,
  CancelledError,
  serverOptions,
  shortenHint,
  summarizeServers,
} from "./common.ts";
import { addServerFlow } from "./server.ts";

const ACTION = "action:";

type Choice =
  | { kind: "profile"; name: string }
  | { kind: "custom" }
  | { kind: "edit" }
  | { kind: "create" }
  | { kind: "add" }
  | { kind: "sync" }
  | { kind: "delete" }
  | { kind: "quit" };

export type MenuBinding = {
  key: string;
  target: string;
  label: string;
  hint?: string;
};

const ACTION_KEYS = ["x", "e", "c", "a", "s", "d", "q"] as const;
const PROFILE_KEYS = [
  ..."1234567890".split(""),
  ..."abcdefghijklmnopqrstuvwxyz".split(""),
].filter((key) => !ACTION_KEYS.includes(key as (typeof ACTION_KEYS)[number]));

/**
 * Keys and targets for the main menu. Pure so both the selectKey options and
 * the legend are generated from the same source and cannot drift apart.
 */
export function menuBindings(store: Store): MenuBinding[] {
  const active = activeProfile(store);
  const names = Object.keys(store.profiles).sort((a, b) => a.localeCompare(b));

  const profileBindings = names.flatMap((name, index) => {
    const key = PROFILE_KEYS[index];
    if (!key) return [];
    const profile = store.profiles[name]!;
    const flags: string[] = [];
    if (name === active) flags.push("active");
    if (name === store.lastProfile) flags.push("last used");
    const servers = isWildcardProfile(profile)
      ? "all configured servers"
      : profileServerNames(store, profile).length === 0
        ? "no servers"
        : summarizeServers(profileServerNames(store, profile));
    const hint = flags.length > 0 ? `${servers} · ${flags.join(", ")}` : servers;

    return [{ key, target: name, label: profileLabel(name, profile), hint }];
  });

  return [
    ...profileBindings,
    { key: "x", target: `${ACTION}custom`, label: "🎯 Custom session", hint: "servers for this run only" },
    { key: "e", target: `${ACTION}edit`, label: "✏️ Edit a profile", hint: "change a profile's servers" },
    { key: "c", target: `${ACTION}create`, label: "➕ Create a profile", hint: "new reusable preset" },
    { key: "a", target: `${ACTION}add`, label: "📦 Add a server", hint: "register a new MCP server" },
    { key: "s", target: `${ACTION}sync`, label: "🔄 Sync from opencode.json", hint: "import servers added elsewhere" },
    { key: "d", target: `${ACTION}delete`, label: "🗑 Delete a profile", hint: "remove a preset, keep servers" },
    { key: "q", target: `${ACTION}quit`, label: "✖ Quit", hint: "launch nothing" },
  ];
}

export function parseChoice(key: string, bindings: MenuBinding[]): Choice {
  const binding = bindings.find((item) => item.key === key);
  if (!binding) return { kind: "quit" };
  if (!binding.target.startsWith(ACTION)) return { kind: "profile", name: binding.target };

  const action = binding.target.slice(ACTION.length);
  switch (action) {
    case "custom":
    case "edit":
    case "create":
    case "add":
    case "sync":
    case "delete":
    case "quit":
      return { kind: action };
    default:
      return { kind: "quit" };
  }
}

function header(store: Store): string {
  const active = activeProfile(store);
  const enabled = enabledServers();
  const configPath = findConfigPath();

  return [
    `Active profile : ${active ?? "custom"}`,
    `Enabled servers: ${summarizeServers(enabled)}`,
    `Config         : ${configPath ? shortPath(configPath) : "(not created yet)"}`,
    "",
    "Keys  1-5 profiles · x custom · e edit · c create · a add · s sync · d delete · q quit",
    "      add: register/install a new MCP server   sync: import servers from opencode.json",
  ].join("\n");
}

async function launch(store: Store, args: string[]): Promise<number> {
  const binary = resolveBinary(store);
  saveStore(store);
  return await launchOpenCode({ binary, args });
}

async function pickServers(
  store: Store,
  message: string,
  initialValues: string[],
): Promise<string[]> {
  if (Object.keys(store.catalog).length === 0) {
    p.log.warn("No servers are registered yet. Use “Add a server” first.");
    return [];
  }

  return ask(
    await p.multiselect<string>({
      message,
      options: serverOptions(store),
      initialValues,
      required: false,
    }),
  );
}

/** Keep `full` dynamic when the user re-selects every registered server. */
function editedServers(store: Store, profile: Profile, picked: string[]): string[] {
  if (isWildcardProfile(profile) && picked.length === Object.keys(store.catalog).length) {
    return ["*"];
  }
  return picked;
}

/** Return to the menu on cancellation instead of exiting omcp. */
async function runSubFlow(flow: () => Promise<void>): Promise<boolean> {
  try {
    await flow();
    return true;
  } catch (error) {
    if (error instanceof CancelledError) {
      p.log.info("Back to menu.");
      return false;
    }
    throw error;
  }
}

export async function customSession(store: Store, args: string[]): Promise<number | null> {
  const previous = enabledServers();
  const picked = await pickServers(store, "Servers for this session only", previous);

  applyServerSet(store, picked);
  saveStore(store);
  p.log.success(`Session servers: ${summarizeServers(picked)}`);

  const code = await launch(store, args);

  applyServerSet(store, previous);
  p.log.info(`Restored: ${summarizeServers(previous)}`);

  return code;
}

export async function editProfile(store: Store, preselected?: string): Promise<void> {
  const names = Object.keys(store.profiles);
  if (names.length === 0) {
    p.log.warn("There are no profiles to edit yet.");
    return;
  }

  const name =
    preselected && preselected in store.profiles
      ? preselected
      : await ask(
          await p.select<string>({
            message: "Which profile do you want to edit?",
            options: [
              ...names.map((profileName) => {
                const profile = store.profiles[profileName]!;
                return {
                  value: profileName,
                  label: profileLabel(profileName, profile),
                  hint: shortenHint(
                    isWildcardProfile(profile)
                      ? "all configured servers"
                      : summarizeServers(profileServerNames(store, profile)),
                  ),
                };
              }),
              backOption(),
            ],
          }),
        );

  if (name === BACK_VALUE) return;

  const profile = store.profiles[name]!;
  const picked = await pickServers(
    store,
    `Servers in "${name}"`,
    profileServerNames(store, profile),
  );
  profile.servers = editedServers(store, profile, picked);
  saveStore(store);

  p.log.success(`Profile "${name}" updated: ${summarizeServers(profileServerNames(store, profile))}`);
}

export async function createProfile(store: Store): Promise<void> {
  const rawName = await ask(
    await p.text({
      message: "Profile name",
      placeholder: "review",
      validate: (value) => {
        const slug = slugifyProfileName(value ?? "");
        if (slug === "") return "Use at least one letter or number";
        if (slug in store.profiles) return `Profile "${slug}" already exists`;
        return undefined;
      },
    }),
  );

  const name = slugifyProfileName(rawName);

  const emoji = await ask(
    await p.text({ message: "Emoji (optional)", placeholder: "🔍", initialValue: "" }),
  );

  const description = await ask(
    await p.text({
      message: "Description (optional)",
      placeholder: "What this profile is for",
      initialValue: "",
    }),
  );

  const servers = await pickServers(store, `Servers in "${name}"`, []);

  store.profiles[name] = {
    emoji: emoji.trim() === "" ? undefined : emoji.trim(),
    description: description.trim() === "" ? undefined : description.trim(),
    servers,
  };

  saveStore(store);
  p.log.success(`Profile "${name}" created: ${summarizeServers(servers)}`);
}

export async function deleteProfile(store: Store): Promise<void> {
  const names = Object.keys(store.profiles);
  if (names.length === 0) {
    p.log.warn("There are no profiles to delete.");
    return;
  }

  const name = await ask(
    await p.select<string>({
      message: "Which profile do you want to delete?",
      options: [
        ...names.map((profileName) => {
          const profile = store.profiles[profileName]!;
          return {
            value: profileName,
            label: profileLabel(profileName, profile),
            hint: shortenHint(
              isWildcardProfile(profile)
                ? "all configured servers"
                : summarizeServers(profileServerNames(store, profile)),
            ),
          };
        }),
        backOption(),
      ],
    }),
  );

  if (name === BACK_VALUE) return;

  const confirmed = await ask(
    await p.confirm({
      message: `Delete profile "${name}"? Servers stay configured.`,
      initialValue: false,
    }),
  );

  if (!confirmed) {
    p.log.info("Kept the profile.");
    return;
  }

  removeProfile(store, name);
  saveStore(store);
  p.log.success(`Profile "${name}" deleted.`);
}

/**
 * Interactive launcher loop. Returns the exit code of the OpenCode process,
 * or 0 when the user quits the menu without launching.
 */
export async function runMenu(store: Store, args: string[]): Promise<number> {
  for (;;) {
    p.note(header(store), "omcp");

    const bindings = menuBindings(store);
    const key = await ask(
      await p.selectKey<string>({
        message: "Press a key to choose",
        options: bindings.map((binding) => ({
          value: binding.key,
          label: binding.label,
          hint: binding.hint,
        })),
      }),
    );

    const choice = parseChoice(key, bindings);

    if (choice.kind === "profile") {
      const { profile } = resolveProfile(store, choice.name);
      const result = applyServerSet(store, profileServerNames(store, profile));
      store.lastProfile = choice.name;
      saveStore(store);

      if (result.missing.length > 0) {
        p.log.warn(`Not in the catalog, skipped: ${result.missing.join(", ")}`);
      }
      p.log.success(`Profile "${choice.name}": ${summarizeServers(result.enabled)}`);

      return await launch(store, args);
    }

    if (choice.kind === "custom") {
      let code: number | null = null;
      await runSubFlow(async () => {
        code = await customSession(store, args);
      });
      if (code !== null) return code;
      continue;
    }

    if (choice.kind === "edit") await runSubFlow(() => editProfile(store));
    if (choice.kind === "create") await runSubFlow(() => createProfile(store));
    if (choice.kind === "delete") await runSubFlow(() => deleteProfile(store));

    if (choice.kind === "add") {
      await runSubFlow(async () => {
        const added = await addServerFlow(store);
        if (added) {
          p.log.success(`Server "${added}" registered as disabled until a profile enables it.`);
        }
      });
    }

    if (choice.kind === "sync") {
      const before = Object.keys(store.catalog);
      syncCatalogFromConfig(store);
      saveStore(store);
      const after = Object.keys(store.catalog);
      const added = after.filter((name) => !before.includes(name));
      p.log.success(
        added.length > 0
          ? `Imported ${added.length} new server(s): ${added.join(", ")}`
          : "Catalog is already up to date.",
      );
    }

    if (choice.kind === "quit") {
      p.outro("Nothing launched. Your profiles are saved.");
      return 0;
    }
  }
}
