import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ServerConfig } from "./types.ts";
import { splitCommand } from "./util.ts";

export function dataDir(): string {
  const xdg = process.env.XDG_DATA_HOME;
  const base = xdg && xdg.trim() !== "" ? xdg : join(homedir(), ".local", "share");
  return join(base, "omcp");
}

export function serversDir(): string {
  return join(dataDir(), "servers");
}

export type InstallProgress = {
  step: (message: string) => void;
  info: (message: string) => void;
};

async function run(command: string[], cwd?: string): Promise<void> {
  const proc = Bun.spawn(command, {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`Command failed (exit ${code}): ${command.join(" ")}`);
  }
}

/**
 * Clone (or refresh) a local MCP server and run its install/build steps.
 * Returns the OpenCode server config pointing at the checkout.
 */
export async function installFromGit(options: {
  name: string;
  repository: string;
  subdir?: string;
  installCommand?: string;
  buildCommand?: string;
  entry: string;
  progress?: InstallProgress;
}): Promise<ServerConfig> {
  const root = join(serversDir(), options.name);
  mkdirSync(serversDir(), { recursive: true });

  if (!existsSync(root)) {
    options.progress?.step(`Cloning ${options.repository}`);
    await run(["git", "clone", "--depth", "1", options.repository, root]);
  } else {
    options.progress?.step(`Updating ${root}`);
    await run(["git", "pull", "--ff-only"], root);
  }

  const workdir = options.subdir ? join(root, options.subdir) : root;

  if (options.installCommand && options.installCommand.trim() !== "") {
    options.progress?.step(`Installing dependencies (${options.installCommand})`);
    await run(splitCommand(options.installCommand), workdir);
  }

  if (options.buildCommand && options.buildCommand.trim() !== "") {
    options.progress?.step(`Building (${options.buildCommand})`);
    await run(splitCommand(options.buildCommand), workdir);
  }

  const entry = join(workdir, options.entry);
  if (!existsSync(entry)) {
    throw new Error(`Entry file not found after install: ${entry}`);
  }

  const command = entry.endsWith(".ts") || entry.endsWith(".js") || entry.endsWith(".mjs") || entry.endsWith(".cjs")
    ? ["bun", entry]
    : [entry];

  return { type: "local", command };
}
