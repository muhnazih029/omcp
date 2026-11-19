import { existsSync } from "node:fs";
import * as p from "@clack/prompts";
import { applyProfile } from "./apply.ts";
import { collectChecks } from "./doctor.ts";
import { describeExternal, externalServers, markExternal } from "./external.ts";
import { launchOpenCode, resolveBinary } from "./launcher.ts";
import { configDir, findConfigPath, storePath } from "./paths.ts";
import { removeWrapper, setupWrapper } from "./setup.ts";
import {
  activeProfile,
  enabledServers,
  isWildcardProfile,
  loadStore,
  profileServerNames,
  removeProfile,
  resolveProfile,
  saveStore,
  syncCatalogFromConfig,
} from "./store.ts";
import type { Store } from "./types.ts";
import { CancelledError, errorMessage } from "./ui/common.ts";
import { createProfile, customSession, editProfile, runMenu } from "./ui/menu.ts";
import { runOnboarding } from "./ui/onboarding.ts";
import { addServerFlow } from "./ui/server.ts";
import { shortPath } from "./util.ts";

const VERSION = "0.1.0";

/** OpenCode CLI subcommands that must go straight to the real binary. */
const PASSTHROUGH_COMMANDS = new Set([
  "acp",
  "api",
  "auth",
  "debug",
  "mcp",
  "mini",
  "models",
  "pair",
  "plugin",
  "reload",
  "run",
  "serve",
  "service",
  "session",
  "stats",
  "uninstall",
  "update",
  "upgrade",
]);

const HELP = `omcp ${VERSION} — MCP profiles for OpenCode

Usage
  omcp                            Open the interactive launcher
  omcp -p, --profile <name> [..]  Apply a profile and launch OpenCode
  omcp use <name>                 Apply a profile without launching
  omcp launch [name] [-- ...]     Apply a profile and launch OpenCode

Profiles
  omcp list                       Show profiles, servers and what is active
  omcp status                     Show the current server set
  omcp edit [name]                Change which servers a profile enables
  omcp new                        Create a profile interactively
  omcp rm <name>                  Delete a profile

Servers
  omcp add                        Register or install an MCP server
  omcp sync                       Import servers from opencode.json
  omcp doctor                     Diagnose config, PATH and profile problems

Setup
  omcp setup [--force]            Install the \`opencode\` wrapper into ~/.local/bin
  omcp setup --remove             Remove the wrapper
  omcp help                       Show this help
  omcp version                    Show the version

Anything else is forwarded to the real opencode binary, e.g.
  omcp mcp list
  omcp service status
  omcp run --prompt "hello"
`;

function info(message: string): void {
  p.log.info(message);
}

function success(message: string): void {
  p.log.success(message);
}

function printProfileList(store: Store): void {
  const active = activeProfile(store);
  const names = Object.keys(store.profiles).sort();
  const external = externalServers(store);

  if (names.length === 0) {
    console.log("No profiles yet. Run `omcp new` to create one.");
  } else {
    const width = Math.max(...names.map((name) => name.length));
    console.log("Profiles");
    for (const name of names) {
      const profile = store.profiles[name]!;
      const marker = name === active ? "●" : "○";
      const resolved = profileServerNames(store, profile);
      const servers = isWildcardProfile(profile)
        ? `all configured servers (${resolved.length})`
        : resolved.length === 0
          ? "—"
          : resolved.map((server) => markExternal(server, external)).join(", ");
      const last = name === store.lastProfile ? "  (last used)" : "";
      console.log(`  ${marker} ${name.padEnd(width)}  ${servers}${last}`);
    }
  }

  const catalog = Object.keys(store.catalog).sort();
  const enabled = new Set(enabledServers());

  console.log("");
  if (catalog.length === 0) {
    console.log("No servers registered. Run `omcp add` or `omcp sync`.");
    return;
  }

  const labels = catalog.map((name) => markExternal(name, external));
  const width = Math.max(...labels.map((label) => label.length));
  console.log("Servers");
  catalog.forEach((name, index) => {
    const marker = enabled.has(name) ? "✓" : "·";
    const description = store.catalog[name]?.description ?? "";
    console.log(`  ${marker} ${labels[index]!.padEnd(width)}  ${description}`);
  });
  if (Object.keys(external).length > 0) {
    console.log("");
    console.log("* plugin-provided — omcp cannot disable it");
  }
}

function printStatus(store: Store): void {
  const configPath = findConfigPath();
  const enabled = enabledServers();
  const active = activeProfile(store);
  const disabled = Object.keys(store.catalog).filter((name) => !enabled.includes(name));
  const external = externalServers(store);
  const list = (names: string[]): string =>
    names.length > 0 ? names.map((name) => markExternal(name, external)).join(", ") : "none";
  const pluginNotes = Object.entries(external).map(([name, info]) => describeExternal(name, info));

  console.log(`Config    ${configPath ? shortPath(configPath) : `${shortPath(configDir())} (not created)`}`);
  console.log(`State     ${shortPath(storePath())}`);
  console.log(`Profile   ${active ?? "custom"}`);
  console.log(`Enabled   ${list(enabled)}`);
  console.log(`Disabled  ${list(disabled)}`);
  if (pluginNotes.length > 0) {
    console.log(`Plugin    ${pluginNotes.join("; ")}`);
  }
}

function applyAndReport(store: Store, profileName: string): void {
  const { profile } = resolveProfile(store, profileName);
  const result = applyProfile(store, profileName, {});
  store.lastProfile = profileName;
  saveStore(store);

  if (result.missing.length > 0) {
    p.log.warn(`Not in the catalog, skipped: ${result.missing.join(", ")}`);
  }

  success(`Profile "${profileName}": ${summarizeNames(result.enabled)}`);
  if (profileServerNames(store, profile).length === 0) info("This profile enables no servers.");
  info(`Wrote ${shortPath(result.path)}`);
  info("OpenCode reloads MCP servers on save, no restart needed.");
}

function summarizeNames(names: string[]): string {
  if (names.length === 0) return "no servers";
  return names.join(", ");
}

function parseProfileFlag(argv: string[]): { profile?: string; rest: string[] } {
  const rest = [...argv];
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "-p" || arg === "--profile") {
      const value = rest[i + 1];
      rest.splice(i, 2);
      return { profile: value, rest };
    }
    if (arg?.startsWith("--profile=")) {
      rest.splice(i, 1);
      return { profile: arg.slice("--profile=".length), rest };
    }
  }
  return { rest };
}

async function launchWithArgs(store: Store, args: string[]): Promise<number> {
  const binary = resolveBinary(store);
  saveStore(store);
  return await launchOpenCode({ binary, args });
}

function requireTty(): void {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      "The interactive launcher needs a terminal. Use `omcp use <profile>` or `omcp launch <profile>` instead.",
    );
  }
}

export async function main(argv: string[]): Promise<number> {
  const { profile: profileFlag, rest } = parseProfileFlag(argv);
  const [first, ...tail] = rest;

  const store = loadStore();

  // When invoked through the `opencode` wrapper, stay transparent: a help or
  // version request was meant for the real binary, not for omcp.
  if (
    process.env.OMCP_AS_OPENCODE &&
    (first === "help" ||
      first === "--help" ||
      first === "-h" ||
      first === "version" ||
      first === "--version" ||
      first === "-v")
  ) {
    return await launchWithArgs(store, rest);
  }

  if (first === "help" || first === "--help" || first === "-h") {
    process.stdout.write(HELP);
    return 0;
  }

  if (first === "version" || first === "--version" || first === "-v") {
    process.stdout.write(`omcp ${VERSION}\n`);
    return 0;
  }

  // Explicit --profile wins: apply, then forward anything else to OpenCode.
  if (profileFlag) {
    applyAndReport(store, profileFlag);
    if (tail.length === 0) return 0;
    return await launchWithArgs(store, tail);
  }

  if (first === undefined) {
    if (process.env.OMCP_NO_MENU) return await launchWithArgs(store, []);
    requireTty();
    // A wrapper invocation already implies the wrapper choice, and guests
    // running omcp for the first time get to pick before the menu appears.
    if (!store.launchMode && !process.env.OMCP_AS_OPENCODE) await runOnboarding(store);
    return await runMenu(store, []);
  }

  if (first === "use") {
    const name = tail[0];
    if (!name) throw new Error("Usage: omcp use <profile>");
    applyAndReport(store, name);
    return 0;
  }

  if (first === "launch") {
    const name = tail[0] && !tail[0].startsWith("-") ? tail[0] : undefined;
    const args = name ? tail.slice(1) : tail;

    const target = name ?? store.lastProfile ?? activeProfile(store);
    if (target) {
      applyAndReport(store, target);
      return await launchWithArgs(store, args);
    }

    requireTty();
    return await runMenu(store, args);
  }

  if (first === "list" || first === "ls") {
    printProfileList(store);
    return 0;
  }

  if (first === "status") {
    printStatus(store);
    return 0;
  }

  if (first === "edit") {
    await editProfile(store, tail[0]);
    return 0;
  }

  if (first === "new") {
    await createProfile(store);
    return 0;
  }

  if (first === "rm" || first === "remove") {
    const name = tail[0];
    if (!name) throw new Error("Usage: omcp rm <profile>");
    if (!removeProfile(store, name)) throw new Error(`Unknown profile "${name}"`);
    saveStore(store);
    success(`Profile "${name}" deleted. Servers stay configured.`);
    return 0;
  }

  if (first === "add") {
    const added = await addServerFlow(store);
    if (added) success(`Server "${added}" registered as disabled until a profile enables it.`);
    return 0;
  }

  if (first === "sync") {
    const before = Object.keys(store.catalog);
    syncCatalogFromConfig(store);
    saveStore(store);
    const added = Object.keys(store.catalog).filter((name) => !before.includes(name));
    success(added.length > 0 ? `Imported: ${added.join(", ")}` : "Catalog is already up to date.");
    return 0;
  }

  if (first === "custom") {
    requireTty();
    return (await customSession(store, tail)) ?? 0;
  }

  if (first === "setup") {
    if (tail.includes("--remove")) {
      const result = removeWrapper();
      store.launchMode = "omcp";
      saveStore(store);
      success(result.removed ? `Removed ${shortPath(result.path)}` : "No wrapper to remove.");
      return 0;
    }

    const force = tail.includes("--force");
    const binaryIndex = tail.indexOf("--binary");
    const realBinary = binaryIndex !== -1 ? tail[binaryIndex + 1] : undefined;

    const result = setupWrapper({ force, realBinary });
    store.launchMode = "wrapper";
    saveStore(store);
    success(`Wrapper installed at ${shortPath(result.path)}`);
    info(`Real binary: ${result.realBinary}`);
    info("Make sure ~/.local/bin comes before the real binary directory in PATH.");
    return 0;
  }

  if (first === "doctor") {
    const checks = collectChecks(store);
    for (const check of checks) {
      const icon = check.ok ? "✓" : check.warn ? "!" : "✗";
      console.log(`${icon} ${check.label}${check.detail ? `  ${check.detail}` : ""}`);
    }
    const failures = checks.filter((check) => !check.ok && !check.warn);
    return failures.length === 0 ? 0 : 1;
  }

  // Forward OpenCode subcommands and flags untouched.
  if (first.startsWith("-") || PASSTHROUGH_COMMANDS.has(first) || existsSync(first)) {
    return await launchWithArgs(store, rest);
  }

  throw new Error(`Unknown command "${first}". Run \`omcp help\`.`);
}

export function reportError(error: unknown): number {
  if (error instanceof CancelledError) {
    p.cancel("Cancelled.");
    return 130;
  }
  p.log.error(errorMessage(error));
  return 1;
}
