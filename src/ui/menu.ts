import { isCancel, SelectPrompt } from "@clack/core";
import * as p from "@clack/prompts";
import { applyServerSet } from "../apply.ts";
import { externalServers, markExternal } from "../external.ts";
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
  CancelledError,
  runSubFlow,
  serverOptions,
  shortenHint,
  summarizeServers,
} from "./common.ts";
import { addServerFlow } from "./server.ts";
import { manageServers } from "./servers.ts";

type MenuOption = { value: string; label: string; hint?: string };
type MenuPrompt = Omit<SelectPrompt<MenuOption>, "prompt">;
type MenuView = { store: Store; more: boolean; submitted?: string };

export type MenuChoice =
  | { kind: "profile"; name: string }
  | { kind: "custom" }
  | { kind: "edit"; name: string }
  | { kind: "delete"; name: string }
  | { kind: "add"; name: string }
  | { kind: "sync"; name: string }
  | { kind: "manage" }
  | { kind: "more" }
  | { kind: "create" }
  | { kind: "quit" };

const CONTENT_WIDTH = 98;
const RULE_WIDTH = 104;

/** Map a single keypress to an action. `?` toggles the modal instead of submitting. */
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
    case "m":
      return { kind: "manage" };
    case "?":
      return { kind: "more" };
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

function actionLabel(choice: MenuChoice): string {
  switch (choice.kind) {
    case "edit":
      return `Edit ${choice.name}`;
    case "delete":
      return `Delete ${choice.name}`;
    case "add":
      return `Add a server to ${choice.name}`;
    case "sync":
      return `Sync into ${choice.name}`;
    case "manage":
      return "Manage MCPs";
    case "more":
      return "More actions";
    case "create":
      return "Create a profile";
    case "custom":
      return "Custom session";
    case "quit":
      return "Quit";
    default:
      return "";
  }
}

/** One-line footer. The remaining keys live in the `?` panel. */
export function menuFooter(more = false): string {
  return [
    "[↑↓] Navigate",
    "[Enter] Apply",
    "[e] Edit",
    "[a] Add",
    more ? "[?] Close" : "[?] More",
    "[q] Quit",
  ].join("    ");
}

/** full and minimal stay on top; the rest are alphabetical. */
function orderedProfileNames(store: Store): string[] {
  const pinned = ["full", "minimal"].filter((name) => name in store.profiles);
  const rest = Object.keys(store.profiles)
    .filter((name) => !pinned.includes(name))
    .sort((a, b) => a.localeCompare(b));
  return [...pinned, ...rest];
}

function alignRight(left: string, right: string): string {
  const gap = Math.max(1, CONTENT_WIDTH - 2 - left.length - right.length);
  return `  ${left}${" ".repeat(gap)}${right}`;
}

function renderHeader(store: Store): string {
  const art = ["█▀█ █▀▄▀█ █▀▀ █▀█", "█▄█ █ ▀ █ █▄▄ █▀▀"];
  const config = findConfigPath() ? shortPath(findConfigPath()!) : "(not created yet)";
  return [
    `${art[0]}   OpenCode MCP Profile Manager`,
    `${art[1]}   Active: ${activeProfile(store) ?? "custom"}  |  Config: ${config}`,
  ].join("\n");
}

function renderProfileRow(
  name: string,
  detail: string,
  count: string,
  selected: boolean,
  active: boolean,
): string {
  const marker = selected ? "●" : "○";
  const badge = active ? "[ACTIVE]" : "        ";
  const left = `${marker} ${name.padEnd(8)} ${badge}  ${detail}`;
  return `  ${left.padEnd(CONTENT_WIDTH - 2 - count.length)}${count}`;
}

function renderProfiles(store: Store, selected: string): string {
  const names = orderedProfileNames(store);
  const active = activeProfile(store);
  const external = externalServers(store);
  const thin = `  ${"─".repeat(RULE_WIDTH - 2)}`;
  const lines = [alignRight("PROFILES", `${names.length} TOTAL`), thin];

  for (const name of names) {
    const profile = store.profiles[name]!;
    const members = profileServerNames(store, profile);
    const detail = name !== selected
      ? ""
      : isWildcardProfile(profile)
        ? `all configured servers (${members.length})`
        : members.length > 0
          ? summarizeServers(members.map((server) => markExternal(server, external)))
          : "";
    const count = `${members.length} server${members.length === 1 ? "" : "s"}`;
    lines.push(renderProfileRow(name, detail, count, name === selected, name === active));
  }

  lines.push(thin);
  return lines.join("\n");
}

function renderMore(): string {
  const box = (text: string) => `  │${text.padEnd(CONTENT_WIDTH - 4)}│`;
  return [
    `  ┌─ MORE ACTIONS ${"─".repeat(CONTENT_WIDTH - 19)}┐`,
    box(""),
    box("  Profile       [c] Create profile        [d] Delete selected profile"),
    box("  Servers       [a] Add server            [m] Manage MCP servers"),
    box("                [s] Sync config           [x] Custom session"),
    box("  Navigation    [esc] Back / Cancel       [?] Toggle this panel"),
    box(""),
    box("  Servers marked * (claude-mem*) come from a plugin and cannot be disabled."),
    box(""),
    `  └${"─".repeat(CONTENT_WIDTH - 4)}┘`,
  ].join("\n");
}

function renderMenu(prompt: MenuPrompt, view: MenuView): string {
  const selected = prompt.options[prompt.cursor]?.value ?? "";
  const lines = [
    renderHeader(view.store),
    "",
    "═".repeat(RULE_WIDTH),
    "",
    renderProfiles(view.store, selected),
    "",
    `  ${menuFooter(view.more)}`,
  ];

  if (view.submitted) lines.push("", `  ${view.submitted}`);
  if (view.more) lines.push("", renderMore());
  lines.push("");
  return lines.join("\n");
}

function profileHints(store: Store): MenuOption[] {
  const active = activeProfile(store);
  const external = externalServers(store);
  return orderedProfileNames(store).flatMap((name) => {
    const profile = store.profiles[name]!;
    const flags: string[] = [];
    if (name === active) flags.push("active");
    if (name === store.lastProfile) flags.push("last used");
    const members = profileServerNames(store, profile);
    const servers = isWildcardProfile(profile)
      ? "all configured servers"
      : members.length === 0
        ? "no servers"
        : summarizeServers(members.map((server) => markExternal(server, external)));
    const hint = flags.length > 0 ? `${servers} · ${flags.join(", ")}` : servers;
    return [{ value: name, label: profileLabel(name, profile), hint }];
  });
}

/** Main menu: ↑/↓ moves the highlight, Enter applies, action keys act on it. */
async function chooseMenu(store: Store): Promise<MenuChoice> {
  const options = profileHints(store);
  const view: MenuView = { store, more: false };
  const prompt = new SelectPrompt<MenuOption>({
    options,
    initialValue: store.lastProfile ?? activeProfile(store) ?? undefined,
    render: function (this: MenuPrompt) {
      return renderMenu(this, view);
    },
  });

  let action: MenuChoice | null = null;
  prompt.on("key", (value?: string, event?: { name?: string; sequence?: string }) => {
    const highlighted = prompt.options[prompt.cursor]?.value ?? "";
    const choice = menuAction(value ?? event?.sequence ?? event?.name, highlighted);
    if (!choice) return;
    if (choice.kind === "more") {
      view.more = !view.more;
      return;
    }
    action = choice;
    view.submitted = actionLabel(choice);
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

function assignServers(store: Store, profileName: string, names: string[]): void {
  const profile = store.profiles[profileName];
  if (!profile || isWildcardProfile(profile)) return;
  profile.servers = [...new Set([...profile.servers, ...names])];
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
  const names = orderedProfileNames(store);
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
                hint: shortenHint(
                  isWildcardProfile(profile)
                    ? "all configured servers"
                    : summarizeServers(profileServerNames(store, profile)),
                ),
              };
            }),
          }),
        );

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
  const names = orderedProfileNames(store);
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
            options: names.map((profileName) => {
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
          }),
        );

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

/** Wipe the previous menu/sub-flow so Back does not stack old screens. */
function clearScreen(): void {
  if (!process.stdout.isTTY) return;
  process.stdout.write("\x1b[2J\x1b[H");
}

/**
 * Interactive launcher loop. Returns the exit code of the OpenCode process,
 * or 0 when the user quits the menu without launching.
 */
export async function runMenu(store: Store, args: string[]): Promise<number> {
  let first = true;
  for (;;) {
    if (!first) clearScreen();
    first = false;

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
    if (choice.kind === "more") continue;

    if (choice.kind === "add") {
      await runSubFlow(async () => {
        const added = await addServerFlow(store, choice.name);
        p.log.success(
          isWildcardProfile(store.profiles[choice.name]!)
            ? `Server "${added}" is already included by full.`
            : `Server "${added}" registered and added to "${choice.name}".`,
        );
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

    if (choice.kind === "manage") await runSubFlow(() => manageServers(store));

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
