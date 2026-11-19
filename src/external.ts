import { readdirSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { configDir } from "./paths.ts";
import type { Store } from "./types.ts";

const PLUGIN_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".mts", ".cts"]);
const PLUGIN_COMMAND = /[/\\]plugins[/\\]/i;

export type ExternalServer = {
  /** OpenCode plugin file responsible, when one can be identified. */
  plugin?: string;
  /** Why switching the profile cannot turn this server off. */
  reason: string;
};

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function listPlugins(dir: string): string[] {
  try {
    return readdirSync(join(dir, "plugins"))
      .filter((file) => PLUGIN_EXTENSIONS.has(extname(file).toLowerCase()))
      .sort()
      .map((file) => join(dir, "plugins", file));
  } catch {
    return [];
  }
}

/**
 * Servers a plugin owns instead of `mcp.servers`, so `disabled: true` cannot
 * stop them. Two signals count as ownership:
 *
 * - a plugin file whose name matches the server name (`claude-mem.js`), or
 * - a command that runs from inside a `plugins/` directory.
 *
 * Both are structural checks; we do not guess from keywords in plugin source.
 */
export function externalServers(
  store: Store,
  dir: string = configDir(),
): Record<string, ExternalServer> {
  const plugins = listPlugins(dir);
  const external: Record<string, ExternalServer> = {};

  for (const [name, entry] of Object.entries(store.catalog)) {
    const plugin = plugins.find((file) => normalize(basename(file, extname(file))) === normalize(name));
    if (plugin) {
      external[name] = { plugin, reason: `declared by ${basename(plugin)}` };
      continue;
    }

    const command = (entry.server.command ?? []).join(" ");
    if (PLUGIN_COMMAND.test(command)) {
      external[name] = { reason: "command runs from a plugin install" };
    }
  }

  return external;
}

/** Append the "cannot be disabled" marker to a server name. */
export function markExternal(name: string, external: Record<string, ExternalServer>): string {
  return name in external ? `${name}*` : name;
}

/** One-line explanation for `omcp status` and the menu header. */
export function describeExternal(name: string, info: ExternalServer): string {
  return `${name} (${info.reason}) — cannot be disabled by omcp`;
}
