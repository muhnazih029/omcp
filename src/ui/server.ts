import * as p from "@clack/prompts";
import { applyServerSet } from "../apply.ts";
import { externalServers } from "../external.ts";
import { installFromGit, type InstallProgress } from "../install.ts";
import {
  enabledServers,
  isServerName,
  isWildcardProfile,
  profileServerNames,
  removeCatalogEntry,
  renameCatalogEntry,
  saveStore,
  upsertCatalogEntry,
} from "../store.ts";
import type { InstallRecipe, ServerConfig, Store } from "../types.ts";
import { describeCommand, splitCommand } from "../util.ts";
import { ask, shortenHint } from "./common.ts";

type Kind = "bunx" | "npx" | "command" | "remote" | "git";
type Field = "start" | "name" | "description" | "tags";
type Definition = { server: ServerConfig; recipe?: InstallRecipe; nameSeed: string };

function suggestName(pkgOrUrl: string): string {
  const trimmed = pkgOrUrl.trim();
  if (trimmed.includes("://")) {
    try {
      const url = new URL(trimmed);
      const parts = url.pathname.split("/").filter(Boolean);
      const last = parts[parts.length - 1] ?? url.hostname;
      return last.replace(/^mcp-/, "").replace(/-mcp$/, "").replace(/\.git$/, "");
    } catch {
      return "remote-server";
    }
  }
  const withoutScope = trimmed.split("/").pop() ?? trimmed;
  return withoutScope
    .replace(/^mcp-/, "")
    .replace(/-mcp$/, "")
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function parseEnv(input: string): Record<string, string> | undefined {
  const pairs = input
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  const env: Record<string, string> = {};
  for (const pair of pairs) {
    const index = pair.indexOf("=");
    if (index <= 0) continue;
    env[pair.slice(0, index).trim()] = pair.slice(index + 1).trim();
  }
  return Object.keys(env).length > 0 ? env : undefined;
}

function parseTags(input: string): string[] | undefined {
  const tags = input
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
  return tags.length > 0 ? tags : undefined;
}

/** Step 1 of add/edit: ask how the server starts and collect its definition. */
async function collectServerDefinition(): Promise<Definition> {
  const kind = await ask(
    await p.select<Kind>({
      message: "How is this server started?",
      options: [
        { value: "bunx", label: "Bun package", hint: "bunx -y <package>" },
        { value: "npx", label: "npm package", hint: "npx -y <package>" },
        {
          value: "command",
          label: "Existing command",
          hint: "a binary or script already on your machine",
        },
        { value: "remote", label: "Remote server", hint: "Streamable HTTP endpoint" },
        { value: "git", label: "Git repository", hint: "clone, install, build, then run locally" },
      ],
    }),
  );

  let server: ServerConfig;
  let recipe: InstallRecipe | undefined;
  let nameSeed = "";

  if (kind === "bunx" || kind === "npx") {
    const pkg = await ask(
      await p.text({
        message: "Package name",
        placeholder: "@upstash/context7-mcp",
        validate: (value) => (value && value.trim() !== "" ? undefined : "Package name is required"),
      }),
    );
    nameSeed = pkg;

    const extraArgs = await ask(
      await p.text({ message: "Extra arguments (optional)", placeholder: "", initialValue: "" }),
    );

    const envInput = await ask(
      await p.text({
        message: "Environment variables (optional, KEY=value, comma separated)",
        placeholder: "GITHUB_TOKEN={env:GITHUB_TOKEN}",
        initialValue: "",
      }),
    );

    const command = [kind === "bunx" ? "bunx" : "npx", "-y", pkg.trim()];
    command.push(...splitCommand(extraArgs));

    server = {
      type: "local",
      command,
      ...(parseEnv(envInput) ? { environment: parseEnv(envInput) } : {}),
    };
    recipe = { kind, package: pkg.trim() };
  } else if (kind === "command") {
    const raw = await ask(
      await p.text({
        message: "Command",
        placeholder: "node /path/to/mcp-server.js",
        validate: (value) =>
          value && splitCommand(value).length > 0 ? undefined : "Command is required",
      }),
    );
    server = { type: "local", command: splitCommand(raw) };
    recipe = { kind: "command", command: server.command! };
    nameSeed = server.command?.at(-1) ?? "server";
  } else if (kind === "remote") {
    const url = await ask(
      await p.text({
        message: "Remote URL",
        placeholder: "https://mcp.example.com/mcp",
        validate: (value) => {
          if (!value) return "URL is required";
          try {
            new URL(value);
            return undefined;
          } catch {
            return "Enter a valid absolute URL";
          }
        },
      }),
    );
    const headersInput = await ask(
      await p.text({
        message: "Headers (optional, KEY=value, comma separated)",
        placeholder: "Authorization=Bearer {env:TOKEN}",
        initialValue: "",
      }),
    );
    server = {
      type: "remote",
      url: url.trim(),
      ...(parseEnv(headersInput) ? { headers: parseEnv(headersInput) } : {}),
    };
    nameSeed = url;
  } else {
    const repository = await ask(
      await p.text({
        message: "Git repository",
        placeholder: "https://github.com/owner/mcp-server.git",
        validate: (value) => (value && value.trim() !== "" ? undefined : "Repository is required"),
      }),
    );
    const entry = await ask(
      await p.text({
        message: "Entry file, relative to the repo",
        placeholder: "dist/index.js",
        validate: (value) => (value && value.trim() !== "" ? undefined : "Entry file is required"),
      }),
    );
    const installCommand = await ask(
      await p.text({
        message: "Install command (optional)",
        placeholder: "bun install",
        initialValue: "bun install",
      }),
    );
    const buildCommand = await ask(
      await p.text({ message: "Build command (optional)", placeholder: "bun run build", initialValue: "" }),
    );

    nameSeed = repository;
    const provisionalName = suggestName(repository) || "server";

    const progress: InstallProgress = {
      step: (message) => p.log.step(message),
      info: (message) => p.log.info(message),
    };

    server = await installFromGit({
      name: provisionalName,
      repository: repository.trim(),
      installCommand,
      buildCommand,
      entry: entry.trim(),
      progress,
    });

    recipe = {
      kind: "git",
      repository: repository.trim(),
      install: splitCommand(installCommand),
      build: buildCommand.trim() ? splitCommand(buildCommand) : undefined,
      entry: entry.trim(),
    };
  }

  return { server, recipe, nameSeed };
}

async function askServerName(store: Store, suggested: string, exclude?: string): Promise<string> {
  return await ask(
    await p.text({
      message: "Server name in OpenCode config",
      initialValue: suggested,
      validate: (value) => {
        const clean = (value ?? "").trim();
        if (clean === "") return "Name is required";
        if (!isServerName(clean)) return "Use letters, numbers, dashes and underscores only";
        if (clean !== exclude && clean in store.catalog) return `Server "${clean}" already exists`;
        return undefined;
      },
    }),
  );
}

export async function addServerFlow(store: Store, assignTo?: string): Promise<string> {
  const { server, recipe, nameSeed } = await collectServerDefinition();

  const name = await askServerName(store, suggestName(nameSeed) || "server");

  const description = await ask(
    await p.text({ message: "Short description (optional)", placeholder: "What this server is for", initialValue: "" }),
  );

  const tagsInput = await ask(
    await p.text({
      message: "Tags (optional, comma separated)",
      placeholder: "design, code, research",
      initialValue: "",
    }),
  );

  upsertCatalogEntry(store, name, {
    server,
    install: recipe,
    description: description.trim() || undefined,
    tags: parseTags(tagsInput),
  });

  const target = assignTo && assignTo in store.profiles ? store.profiles[assignTo] : undefined;

  if (target) {
    if (!isWildcardProfile(target) && !target.servers.includes(name)) {
      target.servers.push(name);
    }
  } else {
    const candidates = Object.entries(store.profiles).filter(
      ([, profile]) => !isWildcardProfile(profile) && !profile.servers.includes(name),
    );

    if (candidates.length > 0) {
      const picked = await ask(
        await p.multiselect<string>({
          message: "Add this server to which profiles?",
          options: candidates.map(([profileName, profile]) => {
            const servers = profileServerNames(store, profile);
            return {
              value: profileName,
              label: `${profile.emoji ? `${profile.emoji} ` : ""}${profileName}`,
              hint: shortenHint(servers.length === 0 ? "empty profile" : servers.join(", ")),
            };
          }),
          required: false,
          initialValues: [],
        }),
      );

      for (const profileName of picked) {
        const profile = store.profiles[profileName];
        if (profile) profile.servers.push(name);
      }
    }
  }

  saveStore(store);
  return name;
}

/**
 * Edit a catalog server. The user picks which fields to change; env vars are
 * part of the "how it starts" wizard, so changing the command re-asks them.
 * Returns true when a change was written.
 */
export async function editServerFlow(store: Store, name: string): Promise<boolean> {
  const external = externalServers(store);
  if (name in external) {
    p.log.warn(`"${name}" is plugin-provided. omcp cannot edit its definition.`);
    return false;
  }

  const entry = store.catalog[name];
  if (!entry) {
    p.log.warn(`Server "${name}" is not in the catalog.`);
    return false;
  }

  const fields = await ask(
    await p.multiselect<Field>({
      message: `Edit server "${name}" — what do you want to change?`,
      options: [
        {
          value: "start",
          label: "How it starts",
          hint: shortenHint(entry.server.url ?? describeCommand(entry.server.command)),
        },
        { value: "name", label: "Name", hint: name },
        { value: "description", label: "Description", hint: entry.description ?? "(none)" },
        { value: "tags", label: "Tags", hint: entry.tags?.join(", ") ?? "(none)" },
      ],
      required: true,
    }),
  );

  let newName = name;
  let server = entry.server;
  let recipe = entry.install;
  let description = entry.description;
  let tags = entry.tags;

  if (fields.includes("start")) {
    const definition = await collectServerDefinition();
    server = definition.server;
    recipe = definition.recipe;
  }

  if (fields.includes("name")) {
    newName = await askServerName(store, name, name);
  }

  if (fields.includes("description")) {
    const value = await ask(
      await p.text({
        message: "Short description (optional)",
        placeholder: "What this server is for",
        initialValue: entry.description ?? "",
      }),
    );
    description = value.trim() || undefined;
  }

  if (fields.includes("tags")) {
    const value = await ask(
      await p.text({
        message: "Tags (optional, comma separated)",
        placeholder: "design, code, research",
        initialValue: entry.tags?.join(", ") ?? "",
      }),
    );
    tags = parseTags(value);
  }

  const wasEnabled = enabledServers().includes(name);

  if (newName !== name && !renameCatalogEntry(store, name, newName)) {
    throw new Error(`Cannot rename "${name}" to "${newName}".`);
  }

  upsertCatalogEntry(store, newName, { server, install: recipe, description, tags });

  // Keep the connection state the user had before the edit.
  const enabled = enabledServers().filter((server) => server !== name);
  if (wasEnabled && !enabled.includes(newName)) enabled.push(newName);
  applyServerSet(store, enabled, { sync: false });
  saveStore(store);

  p.log.success(newName === name ? `Server "${name}" updated.` : `Server "${name}" renamed to "${newName}".`);
  return true;
}

/**
 * Delete a server from the catalog, every profile, and opencode.json.
 * Plugin-provided servers are refused: config cannot turn them off anyway.
 */
export async function deleteServerFlow(
  store: Store,
  name: string,
  options: { force?: boolean } = {},
): Promise<boolean> {
  const external = externalServers(store);
  if (name in external) {
    p.log.warn(`"${name}" is plugin-provided. omcp cannot delete it.`);
    return false;
  }

  if (!(name in store.catalog)) {
    p.log.warn(`Server "${name}" is not in the catalog.`);
    return false;
  }

  if (!options.force) {
    const confirmed = await ask(
      await p.confirm({
        message: `Delete server "${name}"? It will be removed from opencode.json and every profile.`,
        initialValue: false,
      }),
    );
    if (!confirmed) {
      p.log.info("Kept the server.");
      return false;
    }
  }

  removeCatalogEntry(store, name);
  const enabled = enabledServers().filter((server) => server !== name);
  applyServerSet(store, enabled, { sync: false });
  saveStore(store);

  p.log.success(`Server "${name}" deleted.`);
  return true;
}
