import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnInherit } from "./runtime.ts";
import type { Store } from "./types.ts";
import { expandHome } from "./paths.ts";

const WRAPPER_MARKER = "OMCP_WRAPPER";

/**
 * True when the file at `path` is the omcp shell wrapper installed on PATH.
 * We must never exec the wrapper from inside omcp: it would recurse forever.
 */
export function isWrapper(path: string): boolean {
  try {
    const head = readFileSync(path, "utf8").slice(0, 4096);
    return head.includes(WRAPPER_MARKER);
  } catch {
    return false;
  }
}

function isExecutable(path: string): boolean {
  try {
    return (statSync(path).mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

/** Scan PATH for a real OpenCode binary, skipping the omcp wrapper. */
export function findBinaryOnPath(): string | null {
  const path = process.env.PATH ?? "";
  for (const dir of path.split(":")) {
    if (!dir) continue;
    const candidate = join(dir, "opencode");
    if (!existsSync(candidate)) continue;
    if (isWrapper(candidate)) continue;
    if (!isExecutable(candidate)) continue;
    try {
      return realpathSync(candidate);
    } catch {
      return candidate;
    }
  }
  return null;
}

export function resolveBinary(store: Store, override?: string): string {
  const explicit = override ?? process.env.OMCP_OPENCODE_BIN;
  if (explicit && explicit.trim() !== "") {
    const path = expandHome(explicit.trim());
    if (!existsSync(path)) throw new Error(`OpenCode binary not found at ${path}`);
    return path;
  }

  if (store.opencodeBinary && existsSync(store.opencodeBinary) && !isWrapper(store.opencodeBinary)) {
    return store.opencodeBinary;
  }

  const found = findBinaryOnPath();
  if (!found) {
    throw new Error(
      "Could not find the real `opencode` binary on PATH. Set OMCP_OPENCODE_BIN to its absolute path.",
    );
  }

  store.opencodeBinary = found;
  return found;
}

export type LaunchOptions = {
  binary: string;
  args: string[];
  cwd?: string;
};

/** Hand the terminal over to the real OpenCode process and return its exit code. */
export async function launchOpenCode(options: LaunchOptions): Promise<number> {
  return await spawnInherit([options.binary, ...options.args], {
    cwd: options.cwd,
    env: { ...process.env, OMCP_BYPASS: "1" },
  });
}
