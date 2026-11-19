import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * OpenCode's global configuration directory.
 *
 * Precedence mirrors OpenCode itself: an explicit OPENCODE_CONFIG_DIR wins,
 * then $XDG_CONFIG_HOME/opencode, then ~/.config/opencode.
 */
export function configDir(): string {
  const explicit = process.env.OPENCODE_CONFIG_DIR;
  if (explicit && explicit.trim() !== "") return expandHome(explicit.trim());

  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && xdg.trim() !== "" ? expandHome(xdg.trim()) : join(homedir(), ".config");
  return join(base, "opencode");
}

/** Location of omcp's own state file (profiles + server catalog). */
export function storePath(): string {
  return join(configDir(), "omcp.json");
}

/**
 * Locate the OpenCode config that omcp writes to.
 *
 * OpenCode accepts both opencode.jsonc and opencode.json. Prefer the file that
 * already exists so we never create a second, competing document.
 */
export function findConfigPath(dir: string = configDir()): string | null {
  for (const name of ["opencode.jsonc", "opencode.json"]) {
    const candidate = join(dir, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Fallback path used when the user has never created an OpenCode config. */
export function defaultConfigPath(dir: string = configDir()): string {
  return join(dir, "opencode.json");
}

export function backupDir(): string {
  return join(configDir(), "omcp-backups");
}

export function expandHome(input: string): string {
  if (input === "~") return homedir();
  if (input.startsWith("~/")) return join(homedir(), input.slice(2));
  return input;
}
