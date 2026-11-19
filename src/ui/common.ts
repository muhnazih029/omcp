import * as p from "@clack/prompts";
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

export const BACK_VALUE = "__back__";

/** Option appended to sub-menu selects so users can return without quitting. */
export function backOption<V extends string = string>(): MenuOption<V> {
  return { value: BACK_VALUE as V, label: "← Back", hint: "back to the main menu" };
}

/** Keep hints on one line in narrow terminals. */
export function shortenHint(value: string | undefined, max = 48): string | undefined {
  if (!value) return undefined;
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

export function serverOptions(store: Store): ServerOption[] {
  return Object.keys(store.catalog)
    .sort((a, b) => a.localeCompare(b))
    .map((name) => {
      const entry = store.catalog[name]!;
      const hint = shortenHint(entry.description ?? describeCommand(entry.server.command));
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
