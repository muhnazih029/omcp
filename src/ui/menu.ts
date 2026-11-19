import * as p from "@clack/prompts";
import { applyServerSet } from "../apply.ts";
import { launchOpenCode, resolveBinary } from "../launcher.ts";
import { findConfigPath } from "../paths.ts";
import {
  activeProfile,
  enabledServers,
  profileLabel,
  removeProfile,
  resolveProfile,
  saveStore,
  syncCatalogFromConfig,
} from "../store.ts";
import type { Store } from "../types.ts";
import { shortPath, slugifyProfileName } from "../util.ts";
import { ask, serverOptions, summarizeServers } from "./common.ts";
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

function parseChoice(value: string): Choice {
  if (!value.startsWith(ACTION)) return { kind: "profile", name: value };
  const action = value.slice(ACTION.length);
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

  const lines = [
    `Active profile : ${active ?? "custom"}`,
    `Enabled servers: ${summarizeServers(enabled)}`,
    `Config         : ${configPath ? shortPath(configPath) : "(not created yet)"}`,
  ];

  return lines.join("\n");
}

function menuOptions(store: Store): Array<{ value: string; label: string; hint?: string }> {
  const active = activeProfile(store);
  const names = Object.keys(store.profiles);

  const ordered = [...names].sort((a, b) => {
    if (a === store.lastProfile) return -1;
    if (b === store.lastProfile) return 1;
    if (a === active) return -1;
    if (b === active) return 1;
    return a.localeCompare(b);
  });

  const profileChoices = ordered.map((name) => {
    const profile = store.profiles[name]!;
    const flags: string[] = [];
    if (name === active) flags.push("active");
    if (name === store.lastProfile) flags.push("last used");
    const servers =
      profile.servers.length === 0 ? "no servers" : summarizeServers(profile.servers);
    const suffix = flags.length > 0 ? `${servers} · ${flags.join(", ")}` : servers;

    return {
      value: name,
      label: profileLabel(name, profile),
      hint: suffix,
    };
  });

  return [
    ...profileChoices,
    { value: `${ACTION}custom`, label: "🎯 Custom session", hint: "pick servers for this run only" },
    { value: `${ACTION}edit`, label: "✏️  Edit a profile", hint: "change which servers a profile enables" },
    { value: `${ACTION}create`, label: "➕ Create a profile", hint: "new reusable preset" },
    { value: `${ACTION}add`, label: "📦 Add a server", hint: "register or install an MCP server" },
    { value: `${ACTION}sync`, label: "🔄 Sync from opencode.json", hint: "import servers added elsewhere" },
    { value: `${ACTION}delete`, label: "🗑  Delete a profile", hint: "remove a preset, keep the servers" },
    { value: `${ACTION}quit`, label: "✖  Quit", hint: "" },
  ];
}

async function launch(store: Store, args: string[]): Promise<number> {
  const binary = resolveBinary(store);
  saveStore(store);

  const proc = await launchOpenCode({ binary, args });
  return proc;
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

export async function customSession(store: Store, args: string[]): Promise<number> {
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
            options: names.map((profileName) => {
              const profile = store.profiles[profileName]!;
              return {
                value: profileName,
                label: profileLabel(profileName, profile),
                hint: summarizeServers(profile.servers),
              };
            }),
          }),
        );

  const profile = store.profiles[name]!;
  const picked = await pickServers(store, `Servers in "${name}"`, profile.servers);
  profile.servers = picked;
  saveStore(store);

  p.log.success(`Profile "${name}" updated: ${summarizeServers(picked)}`);
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
    await p.text({ message: "Description (optional)", placeholder: "What this profile is for", initialValue: "" }),
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
      options: names.map((profileName) => ({
        value: profileName,
        label: profileLabel(profileName, store.profiles[profileName]!),
        hint: summarizeServers(store.profiles[profileName]!.servers),
      })),
    }),
  );

  const confirmed = await ask(
    await p.confirm({ message: `Delete profile "${name}"? Servers stay configured.`, initialValue: false }),
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

    const raw = await ask(
      await p.select<string>({
        message: "What do you want to do?",
        options: menuOptions(store),
        initialValue: store.lastProfile ?? activeProfile(store) ?? undefined,
      }),
    );

    const choice = parseChoice(raw);

    if (choice.kind === "profile") {
      const { profile } = resolveProfile(store, choice.name);
      const result = applyServerSet(store, profile.servers);
      store.lastProfile = choice.name;
      saveStore(store);

      if (result.missing.length > 0) {
        p.log.warn(`Not in the catalog, skipped: ${result.missing.join(", ")}`);
      }
      p.log.success(`Profile "${choice.name}": ${summarizeServers(result.enabled)}`);

      return await launch(store, args);
    }

    if (choice.kind === "custom") return await customSession(store, args);
    if (choice.kind === "edit") await editProfile(store);
    if (choice.kind === "create") await createProfile(store);
    if (choice.kind === "delete") await deleteProfile(store);

    if (choice.kind === "add") {
      const added = await addServerFlow(store);
      if (added) p.log.success(`Server "${added}" registered as disabled until a profile enables it.`);
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
