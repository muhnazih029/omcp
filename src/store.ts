import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { extractServers, readConfig, toCatalogServer } from "./opencode.ts";
import { parseJsonc, stringifyJson } from "./jsonc.ts";
import { storePath } from "./paths.ts";
import type { CatalogEntry, Profile, ServerConfig, Store } from "./types.ts";
import { guessTags } from "./util.ts";

type ProfileSeed = {
  name: string;
  emoji: string;
  description: string;
  /** Server names, or "*" for every configured server. */
  servers: string[] | "*";
};

/**
 * Starter profiles. Names that are not configured are dropped; a profile whose
 * seeds are all missing is skipped so a fresh install never shows dead entries.
 */
const PROFILE_SEEDS: ProfileSeed[] = [
  {
    name: "design",
    emoji: "🎨",
    description: "UI/UX, wireframes and visual work",
    servers: ["pencil", "figma", "playwright", "shadcn", "magic"],
  },
  {
    name: "think",
    emoji: "🧠",
    description: "Research, brainstorming and long-term memory",
    servers: ["claude-mem", "context7", "sequential-thinking", "memory", "deepwiki"],
  },
  {
    name: "build",
    emoji: "💻",
    description: "Day-to-day coding, reviews and task tracking",
    servers: ["github", "gitlab", "context7", "dank-todo", "sentry", "postgres"],
  },
  {
    name: "full",
    emoji: "⚡",
    description: "Every configured server (heaviest context cost)",
    servers: "*",
  },
  {
    name: "minimal",
    emoji: "🍃",
    description: "No server at all, cheapest context",
    servers: [],
  },
];

export function emptyStore(): Store {
  return { version: 1, profiles: {}, catalog: {} };
}

export function loadStore(): Store {
  const path = storePath();
  if (!existsSync(path)) {
    const store = bootstrapStore();
    saveStore(store);
    return store;
  }

  const parsed = parseJsonc(readFileSync(path, "utf8"));
  const store = normalizeStore(parsed);
  syncCatalogFromConfig(store);
  return store;
}

export function saveStore(store: Store): void {
  const path = storePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, stringifyJson(store), "utf8");
}

export function normalizeStore(input: unknown): Store {
  const store = emptyStore();
  if (typeof input !== "object" || input === null) return store;

  const raw = input as Partial<Store>;

  if (typeof raw.lastProfile === "string") store.lastProfile = raw.lastProfile;
  if (typeof raw.opencodeBinary === "string") store.opencodeBinary = raw.opencodeBinary;
  if (raw.launchMode === "wrapper" || raw.launchMode === "omcp" || raw.launchMode === "later") {
    store.launchMode = raw.launchMode;
  }

  if (raw.profiles && typeof raw.profiles === "object") {
    for (const [name, profile] of Object.entries(raw.profiles)) {
      const value = profile as Partial<Profile> | undefined;
      if (!value || typeof value !== "object") continue;
      store.profiles[name] = {
        description: typeof value.description === "string" ? value.description : undefined,
        emoji: typeof value.emoji === "string" ? value.emoji : undefined,
        servers: Array.isArray(value.servers) ? value.servers.filter((s) => typeof s === "string") : [],
      };
    }
  }

  if (raw.catalog && typeof raw.catalog === "object") {
    for (const [name, entry] of Object.entries(raw.catalog)) {
      const value = entry as Partial<CatalogEntry> | undefined;
      if (!value || typeof value !== "object" || !value.server) continue;
      store.catalog[name] = {
        description: typeof value.description === "string" ? value.description : undefined,
        tags: Array.isArray(value.tags) ? value.tags.filter((t) => typeof t === "string") : undefined,
        install: value.install,
        server: value.server,
      };
    }
  }

  return store;
}

export function bootstrapStore(): Store {
  const store = emptyStore();
  const state = readConfig();
  const { servers } = extractServers(state.data);

  for (const [name, server] of Object.entries(servers)) {
    store.catalog[name] = {
      description: defaultDescription(name, server),
      tags: guessTags(name),
      server: toCatalogServer(server),
    };
  }

  const available = Object.keys(store.catalog);
  for (const seed of PROFILE_SEEDS) {
    const selected =
      seed.servers === "*" ? available : seed.servers.filter((name) => available.includes(name));

    if (selected.length === 0 && seed.servers !== "*" && seed.servers.length > 0) continue;
    if (selected.length === 0 && seed.servers === "*" && available.length === 0) continue;

    store.profiles[seed.name] = {
      emoji: seed.emoji,
      description: seed.description,
      servers: selected,
    };
  }

  if (store.profiles.minimal === undefined) {
    store.profiles.minimal = {
      emoji: "🍃",
      description: "No server at all, cheapest context",
      servers: [],
    };
  }

  return store;
}

function defaultDescription(name: string, server: ServerConfig): string {
  if (server.type === "remote" && typeof server.url === "string") {
    return `Remote MCP at ${new URL(server.url).host}`;
  }
  const command = server.command ?? [];
  const packageName = command.find((part) => part.startsWith("@") || part.includes("mcp"));
  return packageName ? `Local MCP (${packageName})` : `Local MCP "${name}"`;
}

/**
 * Keep the catalog in step with OpenCode's config. The config file wins for
 * server definitions so hand edits made with `opencode mcp add` or by hand are
 * never silently reverted.
 */
export function syncCatalogFromConfig(store: Store): Store {
  const state = readConfig();
  if (!state.exists) return store;

  const { servers } = extractServers(state.data);

  for (const [name, server] of Object.entries(servers)) {
    const existing = store.catalog[name];
    store.catalog[name] = {
      description: existing?.description ?? defaultDescription(name, server),
      tags: existing?.tags ?? guessTags(name),
      install: existing?.install,
      server: toCatalogServer(server),
    };
  }

  return store;
}

/** Names of servers that OpenCode will actually connect to right now. */
export function enabledServers(): string[] {
  const state = readConfig();
  const { servers } = extractServers(state.data);
  return Object.keys(servers).filter((name) => servers[name]?.disabled !== true);
}

/** Profile whose server set matches the currently enabled servers, if any. */
export function activeProfile(store: Store): string | null {
  const enabled = [...enabledServers()].sort().join(",");
  for (const [name, profile] of Object.entries(store.profiles)) {
    const declared = [...profile.servers].sort().join(",");
    if (declared === enabled) return name;
  }
  return null;
}

export function resolveProfile(store: Store, name: string): { name: string; profile: Profile } {
  const profile = store.profiles[name];
  if (!profile) {
    const names = Object.keys(store.profiles);
    throw new Error(
      names.length === 0
        ? `Unknown profile "${name}". No profiles exist yet. Run \`omcp new\` to create one.`
        : `Unknown profile "${name}". Available: ${names.join(", ")}`,
    );
  }
  return { name, profile };
}

export function profileLabel(name: string, profile: Profile): string {
  const emoji = profile.emoji ? `${profile.emoji} ` : "";
  return `${emoji}${name}`;
}

export function upsertCatalogEntry(store: Store, name: string, entry: CatalogEntry): void {
  const existing = store.catalog[name];
  store.catalog[name] = {
    description: entry.description ?? existing?.description,
    tags: entry.tags ?? existing?.tags,
    install: entry.install ?? existing?.install,
    server: entry.server,
  };
}

export function removeProfile(store: Store, name: string): boolean {
  if (!(name in store.profiles)) return false;
  delete store.profiles[name];
  if (store.lastProfile === name) delete store.lastProfile;
  return true;
}
