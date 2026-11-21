import { findConfigPath } from "../paths.ts";
import { shortPath } from "../util.ts";

/** Widths shared by the fullscreen menu and the header kept above sub-flows. */
export function menuWidths(): { content: number; rule: number } {
  const cols = process.stdout.columns ?? 100;
  const content = Math.max(44, Math.min(98, cols - 4));
  const rule = Math.max(content, Math.min(content + 4, cols - 2));
  return { content, rule };
}

/** Center a single line; each header line stays short enough to avoid wrapping. */
function center(line: string): string {
  const columns = process.stdout.columns ?? 100;
  return " ".repeat(Math.max(0, Math.floor((columns - line.length) / 2))) + line;
}

/** The persistent header: centered block-letter OMCP, title, config and rule. */
export function menuChrome(): string {
  const config = findConfigPath() ? shortPath(findConfigPath()!) : "(not created yet)";
  const lines = [
    "█▀█ █▀▄▀█ █▀▀ █▀█",
    "█▄█ █ ▀ █ █▄▄ █▀▀",
    "OpenCode MCP Profile Manager",
    `Config: ${config}`,
    "═".repeat(menuWidths().rule),
  ];

  return ["", ...lines.map(center), ""].join("\n");
}
