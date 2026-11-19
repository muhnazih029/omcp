import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SANDBOX_ROOT = "/tmp/opencode";

/**
 * Point OMCP at an isolated config directory for the duration of a test.
 * Every module reads OPENCODE_CONFIG_DIR lazily, so this is enough to keep the
 * developer's real ~/.config/opencode untouched.
 */
export function ensureSandbox(): string {
  const dir = mkdtempSync(join(SANDBOX_ROOT, "omcp-test-"));
  process.env.OPENCODE_CONFIG_DIR = dir;
  return dir;
}

export async function sandboxConfig(dir: string, data: unknown): Promise<string> {
  const path = join(dir, "opencode.json");
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return path;
}

export async function readJson(path: string): Promise<any> {
  return JSON.parse(await Bun.file(path).text());
}
