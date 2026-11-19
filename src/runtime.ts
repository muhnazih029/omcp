import { spawn } from "node:child_process";

/** Run a command with the terminal attached and resolve with its exit code. */
export function spawnInherit(
  command: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command[0]!, command.slice(1), {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });
}

/**
 * How the `opencode` wrapper should re-enter omcp.
 *
 * - compiled binary: the binary is `process.execPath`
 * - Bun from source: `bun /path/to/bin/omcp.ts`
 * - npm/Node: `node /path/to/dist/cli.js`
 */
export function launcherInvocation(): { command: string; args: string[] } {
  const bun = (globalThis as { Bun?: { main?: string } }).Bun;

  if (bun && typeof bun.main === "string" && bun.main.endsWith(".ts")) {
    return { command: process.execPath, args: [bun.main] };
  }

  if (!bun) {
    const entry = process.argv[1];
    if (entry) return { command: process.execPath, args: [entry] };
  }

  return { command: process.execPath, args: [] };
}
