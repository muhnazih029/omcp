import * as p from "@clack/prompts";
import { externalServers } from "../external.ts";
import type { Store } from "../types.ts";
import { describeCommand } from "../util.ts";

export class CancelledError extends Error {
  constructor() {
    super("Cancelled");
    this.name = "CancelledError";
  }
}

/** Unwrap a clack prompt result, turning the cancel sentinel into an exception. */
type Cancel = typeof p.CANCEL_SYMBOL;

export function ask<T extends string>(value: T | Cancel): T;
export function ask(value: boolean | Cancel): boolean;
export function ask<T>(value: T[] | Cancel): T[];
export function ask(value: unknown): unknown {
  if (p.isCancel(value)) throw new CancelledError();
  return value;
}

export type ServerOption = {
  value: string;
  label: string;
  hint?: string;
};

export type MenuOption<V extends string = string> = { value: V; label: string; hint?: string };

/** Keep hints on one line in narrow terminals. */
export function shortenHint(value: string | undefined, max = 48): string | undefined {
  if (!value) return undefined;
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

export function serverOptions(store: Store): ServerOption[] {
  const external = externalServers(store);

  return Object.keys(store.catalog)
    .sort((a, b) => a.localeCompare(b))
    .map((name) => {
      const entry = store.catalog[name]!;
      const base = entry.description ?? describeCommand(entry.server.command);
      const hint = shortenHint(
        name in external ? ["plugin-provided", base].filter(Boolean).join(" · ") : base,
      );
      return { value: name, label: name, hint };
    });
}

export function summarizeServers(names: string[]): string {
  if (names.length === 0) return "no servers";
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 3).join(", ")} +${names.length - 3}`;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Wipe the previous screen so the next view starts clean. */
export function clearScreen(): void {
  if (!process.stdout.isTTY) return;
  process.stdout.write("\x1b[2J\x1b[H");
}

/** Return to the parent menu on cancellation instead of exiting omcp. */
export async function runSubFlow(flow: () => Promise<void>, header?: string): Promise<void> {
  clearScreen();
  if (header) process.stdout.write(`${header}\n`);
  try {
    await flow();
  } catch (error) {
    if (error instanceof CancelledError) {
      p.log.info("Back to menu.");
      return;
    }
    throw error;
  }
}
