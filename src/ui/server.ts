import * as p from "@clack/prompts";
import { installFromGit, type InstallProgress } from "../install.ts";
import { saveStore, upsertCatalogEntry } from "../store.ts";
import type { InstallRecipe, ServerConfig, Store } from "../types.ts";
import { splitCommand } from "../util.ts";
import { ask } from "./common.ts";

type Kind = "bunx" | "npx" | "command" | "remote" | "git";

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

export async function addServerFlow(store: Store): Promise<string | null> {
  const kind = await ask(
    await p.select<Kind>({
      message: "How is this server started?",
      options: [
        { value: "bunx", label: "Bun package", hint: "bunx -y <package>" },
        { value: "npx", label: "npm package", hint: "npx -y <package>" },
        { value: "command", label: "Existing command", hint: "a binary or script already on your machine" },
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

  const suggested = suggestName(nameSeed) || "server";
  const name = await ask(
    await p.text({
      message: "Server name in OpenCode config",
      initialValue: suggested,
      validate: (value) => {
        const clean = (value ?? "").trim();
        if (clean === "") return "Name is required";
        if (!/^[a-zA-Z0-9_-]+$/.test(clean)) return "Use letters, numbers, dashes and underscores only";
        return undefined;
      },
    }),
  );

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

  const tags = tagsInput
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);

  upsertCatalogEntry(store, name, {
    server,
    install: recipe,
    description: description.trim() || undefined,
    tags: tags.length > 0 ? tags : undefined,
  });

  const candidates = Object.entries(store.profiles).filter(
    ([, profile]) => !profile.servers.includes(name),
  );

  if (candidates.length > 0) {
    const picked = await ask(
      await p.multiselect<string>({
        message: "Add this server to which profiles?",
        options: candidates.map(([profileName, profile]) => ({
          value: profileName,
          label: `${profile.emoji ? `${profile.emoji} ` : ""}${profileName}`,
          hint: profile.servers.length === 0 ? "empty profile" : profile.servers.join(", "),
        })),
        required: false,
        initialValues: [],
      }),
    );

    for (const profileName of picked) {
      const profile = store.profiles[profileName];
      if (profile) profile.servers.push(name);
    }
  }

  saveStore(store);
  return name;
}
