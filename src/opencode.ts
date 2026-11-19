import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseJsonc, stripComments, stringifyJson } from "./jsonc.ts";
import { backupDir, defaultConfigPath, findConfigPath } from "./paths.ts";
import type { ServerConfig } from "./types.ts";
import { isPlainObject } from "./util.ts";

const NON_SERVER_KEYS = new Set(["servers", "timeout"]);
const MAX_BACKUPS = 20;

export type ConfigState = {
  path: string;
  exists: boolean;
  data: Record<string, unknown>;
  hadComments: boolean;
};

export function readConfig(): ConfigState {
  const path = findConfigPath();
  if (!path || !existsSync(path)) {
    return { path: path ?? defaultConfigPath(), exists: false, data: {}, hadComments: false };
  }

  const text = readFileSync(path, "utf8");
  const { hadComments } = stripComments(text);
  const parsed = parseJsonc(text);

  if (!isPlainObject(parsed)) {
    throw new Error(`Expected a JSON object in ${path}`);
  }

  return { path, exists: true, data: parsed, hadComments };
}

export function isServerLike(value: unknown): value is ServerConfig {
  if (!isPlainObject(value)) return false;
  if (value.type === "local" || value.type === "remote") return true;
  if (Array.isArray(value.command)) return true;
  if (typeof value.url === "string") return true;
  return false;
}

/**
 * Read MCP servers from a config object, supporting both shapes:
 * the V2 `mcp.servers` map and the deprecated map of servers directly under `mcp`.
 */
export function extractServers(data: Record<string, unknown>): {
  servers: Record<string, ServerConfig>;
  legacy: string[];
} {
  const servers: Record<string, ServerConfig> = {};
  const legacy: string[] = [];

  const mcp = data.mcp;
  if (!isPlainObject(mcp)) return { servers, legacy };

  for (const [name, value] of Object.entries(mcp)) {
    if (NON_SERVER_KEYS.has(name)) continue;
    if (isServerLike(value)) {
      servers[name] = value;
      legacy.push(name);
    }
  }

  const nested = mcp.servers;
  if (isPlainObject(nested)) {
    for (const [name, value] of Object.entries(nested)) {
      if (isServerLike(value)) servers[name] = value;
    }
  }

  return { servers, legacy };
}

/** Strip omcp-irrelevant runtime flags so the catalog stores a clean definition. */
export function toCatalogServer(server: ServerConfig): ServerConfig {
  const clone: ServerConfig = { ...server };
  delete clone.disabled;
  return clone;
}

/**
 * Write the server map back into the config while leaving every unrelated key
 * untouched. Legacy top-level server entries are migrated into `mcp.servers`
 * because V2 only reads the nested map.
 */
export function writeServers(
  state: ConfigState,
  servers: Record<string, ServerConfig>,
  options: { dryRun?: boolean } = {},
): { path: string; backup?: string } {
  const data = structuredClone(state.data);
  const mcp = isPlainObject(data.mcp) ? { ...data.mcp } : {};

  for (const key of Object.keys(mcp)) {
    if (NON_SERVER_KEYS.has(key)) continue;
    if (isServerLike(mcp[key])) delete mcp[key];
  }

  mcp.servers = servers;
  data.mcp = mcp;

  const text = stringifyJson(data);

  if (options.dryRun) return { path: state.path };
  if (state.exists && readFileSync(state.path, "utf8") === text) {
    return { path: state.path };
  }

  const backup = state.exists ? backupConfig(state.path) : undefined;
  mkdirSync(dirname(state.path), { recursive: true });
  writeFileSync(state.path, text, "utf8");

  return { path: state.path, backup };
}

export function backupConfig(path: string): string {
  const dir = backupDir();
  mkdirSync(dir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = join(dir, `opencode-${stamp}.json`);
  copyFileSync(path, target);

  pruneBackups(dir);
  return target;
}

function pruneBackups(dir: string): void {
  const files = readdirSync(dir)
    .filter((name) => name.startsWith("opencode-") && name.endsWith(".json"))
    .sort();

  for (const old of files.slice(0, Math.max(0, files.length - MAX_BACKUPS))) {
    try {
      unlinkSync(join(dir, old));
    } catch {
      // A stale backup we cannot delete is not worth failing a config write over.
    }
  }
}
