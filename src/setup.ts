import { chmodSync, existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { findBinaryOnPath, isWrapper } from "./launcher.ts";

export function wrapperPath(): string {
  return join(homedir(), ".local", "bin", "opencode");
}

function shellQuote(value: string): string {
  if (/^[a-zA-Z0-9_\-./:@]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Command that re-enters omcp, whether running from source or a compiled binary. */
export function launcherInvocation(): { command: string; args: string[] } {
  const main = Bun.main;
  if (main.endsWith(".ts")) {
    return { command: process.execPath, args: [main] };
  }
  return { command: main, args: [] };
}

export type SetupResult = {
  path: string;
  realBinary: string;
  created: boolean;
};

export function setupWrapper(options: { force?: boolean; realBinary?: string } = {}): SetupResult {
  const target = wrapperPath();
  const existing = existsSync(target);

  if (existing && !isWrapper(target) && !options.force) {
    throw new Error(
      `${target} already exists and is not an omcp wrapper. Re-run with --force to replace it.`,
    );
  }

  const real = options.realBinary ?? findBinaryOnPath();
  if (!real) {
    throw new Error(
      "Could not find the real `opencode` binary on PATH. Pass --binary /path/to/opencode.",
    );
  }

  const invocation = launcherInvocation();
  const command = [invocation.command, ...invocation.args].map(shellQuote).join(" ");

  const script = [
    "#!/bin/sh",
    "# OMCP_WRAPPER: installed by `omcp setup`. Remove with `omcp setup --remove`.",
    `OMCP_REAL_OPENCODE="${real}"`,
    "",
    "# Recursion guard: omcp itself launches OpenCode with this set.",
    'if [ -n "$OMCP_BYPASS" ]; then',
    '  exec "$OMCP_REAL_OPENCODE" "$@"',
    "fi",
    "",
    "# Explicit opt out, e.g. in scripts or CI.",
    'if [ -n "$OMCP_NO_MENU" ]; then',
    '  exec "$OMCP_REAL_OPENCODE" "$@"',
    "fi",
    "",
    "# No terminal to draw a menu on: behave exactly like the real binary.",
    'if [ ! -t 0 ] || [ ! -t 1 ]; then',
    '  exec "$OMCP_REAL_OPENCODE" "$@"',
    "fi",
    "",
    `OMCP_AS_OPENCODE=1 exec ${command} "$@"`,
    "",
  ].join("\n");

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, script, "utf8");
  chmodSync(target, 0o755);

  return { path: target, realBinary: real, created: true };
}

export function removeWrapper(): { path: string; removed: boolean } {
  const target = wrapperPath();
  if (!existsSync(target)) return { path: target, removed: false };
  if (!isWrapper(target)) {
    throw new Error(`${target} is not an omcp wrapper; refusing to delete it.`);
  }
  unlinkSync(target);
  return { path: target, removed: true };
}
