import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { findBinaryOnPath, isWrapper } from "./launcher.ts";
import { configDir, findConfigPath, storePath } from "./paths.ts";
import { extractServers, readConfig } from "./opencode.ts";
import { wrapperPath } from "./setup.ts";
import { enabledServers, profileServerNames } from "./store.ts";
import type { Store } from "./types.ts";
import { shortPath } from "./util.ts";

export type Check = {
  ok: boolean;
  warn?: boolean;
  label: string;
  detail?: string;
};

export function collectChecks(store: Store): Check[] {
  const checks: Check[] = [];

  const configPath = findConfigPath();
  checks.push({
    ok: configPath !== null,
    warn: configPath === null,
    label: "OpenCode config",
    detail: configPath ? shortPath(configPath) : `no opencode.json in ${shortPath(configDir())}`,
  });

  let legacyCount = 0;
  let serverCount = 0;
  if (configPath) {
    try {
      const state = readConfig();
      const { servers, legacy } = extractServers(state.data);
      serverCount = Object.keys(servers).length;
      legacyCount = legacy.length;
      checks.push({
        ok: true,
        label: "Config parses",
        detail: `${serverCount} server(s) defined`,
      });
      checks.push({
        ok: legacyCount === 0,
        warn: legacyCount > 0,
        label: "V2 mcp shape",
        detail:
          legacyCount === 0
            ? "all servers live under mcp.servers"
            : `${legacyCount} legacy entr(ies) under mcp; run \`omcp sync\` then launch to migrate`,
      });
    } catch (error) {
      checks.push({
        ok: false,
        label: "Config parses",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  checks.push({
    ok: existsSync(storePath()),
    label: "omcp state",
    detail: shortPath(storePath()),
  });

  const catalogSize = Object.keys(store.catalog).length;
  const enabled = enabledServers();
  checks.push({
    ok: catalogSize > 0,
    warn: catalogSize === 0,
    label: "Catalog",
    detail: catalogSize === 0 ? "no servers registered yet" : `${catalogSize} registered, ${enabled.length} enabled`,
  });

  const brokenProfiles = Object.entries(store.profiles).filter(([, profile]) =>
    profileServerNames(store, profile).some((name) => !(name in store.catalog)),
  );
  checks.push({
    ok: brokenProfiles.length === 0,
    warn: brokenProfiles.length > 0,
    label: "Profiles",
    detail:
      brokenProfiles.length === 0
        ? `${Object.keys(store.profiles).length} profile(s), all servers resolvable`
        : brokenProfiles
            .map(([name, profile]) => {
              const missing = profileServerNames(store, profile).filter(
                (server) => !(server in store.catalog),
              );
              return `${name} → missing ${missing.join(", ")}`;
            })
            .join("; "),
  });

  const real = findBinaryOnPath();
  checks.push({
    ok: real !== null,
    label: "OpenCode binary",
    detail: real ?? "not found on PATH",
  });

  const wrapper = wrapperPath();
  const wrapperInstalled = existsSync(wrapper) && isWrapper(wrapper);
  checks.push({
    ok: wrapperInstalled,
    warn: !wrapperInstalled,
    label: "opencode wrapper",
    detail: wrapperInstalled ? shortPath(wrapper) : `not installed; run \`omcp setup\``,
  });

  if (real) {
    const wrapperDir = dirname(wrapper);
    const pathDirs = (process.env.PATH ?? "").split(":");
    const wrapperIndex = pathDirs.indexOf(wrapperDir);
    const realIndex = pathDirs.indexOf(dirname(real));
    const shadows = wrapperIndex === -1 || realIndex === -1 || wrapperIndex > realIndex;
    checks.push({
      ok: !shadows,
      warn: shadows,
      label: "PATH order",
      detail: shadows
        ? `${wrapperDir} must come before ${dirname(real)} for the wrapper to win`
        : "wrapper resolves before the real binary",
    });
  }

  return checks;
}
