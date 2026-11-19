import { isCancel, SelectPrompt } from "@clack/core";
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

type MenuOption = { value: string; label: string; hint?: string };
type MenuPrompt = Omit<SelectPrompt<MenuOption>, "prompt">;

export type MenuChoice =
  | { kind: "profile"; name: string }
  | { kind: "custom" }
  | { kind: "edit"; name: string }
  | { kind: "delete"; name: string }
  | { kind: "add"; name: string }
  | { kind: "sync"; name: string }
  | { kind: "create" }
  | { kind: "quit" };

/**
 * Map a single keypress to an action. Actions that operate on a profile use
 * the currently highlighted one. Pure so the key handler and tests share it.
 */
export function menuAction(key: string | undefined, profile: string): MenuChoice | null {
  switch (key?.toLowerCase()) {
    case "e":
      return { kind: "edit", name: profile };
    case "d":
      return { kind: "delete", name: profile };
    case "a":
      return { kind: "add", name: profile };
    case "s":
      return { kind: "sync", name: profile };
    case "c":
      return { kind: "create" };
    case "x":
      return { kind: "custom" };
    case "q":
      return { kind: "quit" };
    default:
      return null;
  }
}

/** Label shown when an action key submits the menu. */
function actionLabel(choice: MenuChoice): string {
  switch (choice.kind) {
    case "edit":
      return `✏️ Edit ${choice.name}`;
    case "delete":
      return `🗑 Delete ${choice.name}`;
    case "add":
      return `📦 Add a server to ${choice.name}`;
    case "sync":
      return `🔄 Sync into ${choice.name}`;
    case "create":
      return "➕ Create a profile";
    case "custom":
      return "🎯 Custom session";
    case "quit":
      return "✖ Quit";
    default:
      return "";
  }
}

/** Informational footer shown under the profile list, never a selectable row. */
export function menuFooter(): string {
  return [
    "↑/↓ navigate · Enter use selected profile",
    "e edit · d delete · a add server · s sync · c create · x custom · q quit",
    "edit / delete / add / sync act on the highlighted profile",
  ].join("\n");
}

function renderMenu(this: MenuPrompt): string {
  const guide = "│  ";
  const icon = this.state === "submit" ? "◇" : this.state === "cancel" ? "■" : "◆";

  if (this.state === "submit" || this.state === "cancel") {
    const chosen = this.options[this.cursor]?.label ?? "";
    const bottom = this.state === "cancel" ? "\n└" : "";
    return `${icon}  Choose a profile\n${guide}${chosen}${bottom}\n`;
  }

  const rows = this.options.map((option, index) => {
    const marker = index === this.cursor ? "●" : "○";
    const hint = option.hint ? ` (${option.hint})` : "";
    return `${guide}${marker} ${option.label}${hint}`;
  });

  return [
    `${icon}  Choose a profile`,
    ...rows,
    guide,
    ...menuFooter().split("\n").map((line) => `${guide}${line}`),
    "└",
    "",
  ].join("\n");
}

function profileHints(store: Store): MenuOption[] {
  const active = activeProfile(store);
  return Object.keys(store.profiles)
    .sort((a, b) => a.localeCompare(b))
    .flatMap((name) => {
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
      return [{ value: name, label: profileLabel(name, profile), hint }];
    });
}

/** Main menu: arrows move through profiles, Enter applies, action keys act on the highlighted profile. */
async function chooseMenu(store: Store): Promise<MenuChoice> {
  const options = profileHints(store);
  const prompt = new SelectPrompt<MenuOption>({
    options,
    initialValue: store.lastProfile ?? activeProfile(store) ?? undefined,
    render: renderMenu,
  });

  let action: MenuChoice | null = null;
  prompt.on("key", (value?: string) => {
    const highlighted = prompt.options[prompt.cursor]?.value ?? "";
    const choice = menuAction(value, highlighted);
    if (!choice) return;
    action = choice;
    prompt.options[prompt.cursor] = { value: highlighted, label: actionLabel(choice) };
    prompt.value = `action:${choice.kind}`;
    prompt.state = "submit";
  });

  const submitted = await prompt.prompt();
  if (isCancel(submitted)) throw new CancelledError();
  if (action) return action;

  const name = String(submitted);
  if (!(name in store.profiles)) return { kind: "quit" };
  return { kind: "profile", name };
}

function header(store: Store): string {
  return [
    `Active profile : ${activeProfile(store) ?? "custom"}`,
    `Enabled servers: ${summarizeServers(enabledServers())}`,
    `Config         : ${findConfigPath() ? shortPath(findConfigPath()!) : "(not created yet)"}`,
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

/** Add names to a profile without duplicating them. Wildcard profiles already cover everything. */
function assignServers(store: Store, profileName: string, names: string[]): void {
  const profile = store.profiles[profileName];
  if (!profile || isWildcardProfile(profile)) return;
  profile.servers = [...new Set([...profile.servers, ...names])];
}

/** Return to the menu on cancellation instead of exiting omcp. */
async function runSubFlow(flow: () => Promise<void>): Promise<void> {
  try {
    await flow();
  } catch (error) {
    if (error instanceof CancelledError) {
      p.log.info("Back to menu.");
      return;
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

export async function deleteProfile(store: Store, preselected?: string): Promise<void> {
  const names = Object.keys(store.profiles);
  if (names.length === 0) {
    p.log.warn("There are no profiles to delete.");
    return;
  }

  const name =
    preselected && preselected in store.profiles
      ? preselected
      : await ask(
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
    const choice = await chooseMenu(store);

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

    if (choice.kind === "edit") await runSubFlow(() => editProfile(store, choice.name));
    if (choice.kind === "delete") await runSubFlow(() => deleteProfile(store, choice.name));
    if (choice.kind === "create") await runSubFlow(() => createProfile(store));

    if (choice.kind === "add") {
      await runSubFlow(async () => {
        const added = await addServerFlow(store, choice.name);
        if (added) {
          p.log.success(
            isWildcardProfile(store.profiles[choice.name]!)
              ? `Server "${added}" is already included by full.`
              : `Server "${added}" registered and added to "${choice.name}".`,
          );
        }
      });
    }

    if (choice.kind === "sync") {
      const before = Object.keys(store.catalog);
      syncCatalogFromConfig(store);
      const added = Object.keys(store.catalog).filter((name) => !before.includes(name));
      assignServers(store, choice.name, added);
      saveStore(store);
      p.log.success(
        added.length > 0
          ? `Imported ${added.length} server(s) into "${choice.name}": ${added.join(", ")}`
          : "Catalog is already up to date.",
      );
    }

    if (choice.kind === "custom") {
      let code: number | null = null;
      await runSubFlow(async () => {
        code = await customSession(store, args);
      });
      if (code !== null) return code;
      continue;
    }

    if (choice.kind === "quit") {
      p.outro("Nothing launched. Your profiles are saved.");
      return 0;
    }
  }
}
