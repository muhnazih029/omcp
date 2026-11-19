import { readConfig, writeServers } from "./opencode.ts";
import { profileServerNames, resolveProfile, syncCatalogFromConfig } from "./store.ts";
import type { ServerConfig, Store } from "./types.ts";

export type ApplyResult = {
  path: string;
  backup?: string;
  enabled: string[];
  disabled: string[];
  missing: string[];
};

/**
 * Rewrite `mcp.servers` so exactly `names` are connected.
 *
 * Every catalog server stays defined in the config with `disabled: true`, so a
 * profile switch is a flag flip instead of a config rewrite. OpenCode watches
 * the file and reconnects servers on save, so this also works mid-session.
 */
export function applyServerSet(store: Store, names: string[], options: { dryRun?: boolean } = {}): ApplyResult {
  syncCatalogFromConfig(store);

  const state = readConfig();
  const selected = new Set(names);
  const servers: Record<string, ServerConfig> = {};

  for (const [name, entry] of Object.entries(store.catalog)) {
    const server: ServerConfig = { ...entry.server };
    if (selected.has(name)) {
      delete server.disabled;
    } else {
      server.disabled = true;
    }
    servers[name] = server;
  }

  const missing = names.filter((name) => !(name in store.catalog));
  const enabled = names.filter((name) => name in store.catalog);
  const disabled = Object.keys(servers).filter((name) => !selected.has(name));

  const write = writeServers(state, servers, { dryRun: options.dryRun });

  return {
    path: write.path,
    backup: write.backup,
    enabled,
    disabled,
    missing,
  };
}

export function applyProfile(
  store: Store,
  profileName: string,
  options: { dryRun?: boolean } = {},
): ApplyResult {
  const { profile } = resolveProfile(store, profileName);
  return applyServerSet(store, profileServerNames(store, profile), options);
}
