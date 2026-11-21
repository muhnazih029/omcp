import { findConfigPath } from "../paths.ts";
import { activeProfile } from "../store.ts";
import type { Store } from "../types.ts";
import { shortenHint } from "./common.ts";
import { shortPath } from "../util.ts";

/** Widths shared by the fullscreen menu and the header kept above sub-flows. */
export function menuWidths(): { content: number; rule: number } {
  const cols = process.stdout.columns ?? 100;
  const content = Math.max(44, Math.min(98, cols - 4));
  const rule = Math.max(content, Math.min(content + 4, cols - 2));
  return { content, rule };
}

/** The persistent top of the screen: art, active profile, config and rule. */
export function menuChrome(store: Store): string {
  const art = ["█▀█ █▀▄▀█ █▀▀ █▀█", "█▄█ █ ▀ █ █▄▄ █▀▀"];
  const config = findConfigPath() ? shortPath(findConfigPath()!) : "(not created yet)";
  const room = Math.max(10, menuWidths().content - 20);
  return [
    "",
    "",
    `${art[0]}   ${shortenHint("OpenCode MCP Profile Manager", room)}`,
    `${art[1]}   ${shortenHint(`Active: ${activeProfile(store) ?? "custom"}  |  Config: ${config}`, room)}`,
    "",
    "═".repeat(menuWidths().rule),
    "",
  ].join("\n");
}
