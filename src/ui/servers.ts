import { isCancel, SelectPrompt } from "@clack/core";
import * as p from "@clack/prompts";
import { describeExternal, externalServers, markExternal } from "../external.ts";
import type { Store } from "../types.ts";
import { describeCommand } from "../util.ts";
import { menuChrome } from "./chrome.ts";
import { CancelledError, runSubFlow } from "./common.ts";
import { deleteServerFlow, editServerFlow } from "./server.ts";

type ServerOption = { value: string; label: string; hint?: string };
type ServerPrompt = Omit<SelectPrompt<ServerOption>, "prompt">;

export type ServerChoice =
  | { kind: "edit"; name: string }
  | { kind: "delete"; name: string };

/** Map a key to a server action. Esc is handled by the prompt as cancel/back. */
export function serverAction(key: string | undefined, server: string): ServerChoice | null {
  switch (key?.toLowerCase()) {
    case "e":
      return { kind: "edit", name: server };
    case "d":
      return { kind: "delete", name: server };
    default:
      return null;
  }
}

function actionLabel(choice: ServerChoice): string {
  switch (choice.kind) {
    case "edit":
      return `✏️ Edit ${choice.name}`;
    case "delete":
      return `🗑 Delete ${choice.name}`;
  }
}

export function serverMenuFooter(): string {
  return [
    "↑/↓ move · Enter edit",
    "e edit · d delete · esc back",
  ].join("\n");
}

function renderServerMenu(this: ServerPrompt): string {
  const guide = "│  ";
  const icon = this.state === "submit" ? "◇" : this.state === "cancel" ? "■" : "◆";

  if (this.state === "submit" || this.state === "cancel") {
    const chosen = this.options[this.cursor]?.label ?? "";
    const bottom = this.state === "cancel" ? "\n└" : "";
    return `${icon}  Manage MCPs\n${guide}${chosen}${bottom}\n`;
  }

  const rows = this.options.map((option, index) => {
    const marker = index === this.cursor ? "●" : "○";
    const hint = option.hint ? ` (${option.hint})` : "";
    return `${guide}${marker} ${option.label}${hint}`;
  });

  return [
    `${icon}  Manage MCPs`,
    ...rows,
    guide,
    ...serverMenuFooter().split("\n").map((line) => `${guide}${line}`),
    "└",
    "",
  ].join("\n");
}

function serverOptions(store: Store): ServerOption[] {
  const external = externalServers(store);

  return Object.keys(store.catalog)
    .sort((a, b) => a.localeCompare(b))
    .map((name) => {
      const entry = store.catalog[name]!;
      const base = entry.description ?? entry.server.url ?? describeCommand(entry.server.command);
      const hint = name in external ? "plugin-provided · read only" : base;
      return { value: name, label: markExternal(name, external), hint };
    });
}

async function chooseServer(store: Store): Promise<ServerChoice> {
  const options = serverOptions(store);
  const prompt = new SelectPrompt<ServerOption>({
    options,
    initialValue: options[0]?.value,
    render: renderServerMenu,
  });

  let action: ServerChoice | null = null;
  prompt.on("key", (value?: string) => {
    const highlighted = prompt.options[prompt.cursor]?.value ?? "";
    const choice = serverAction(value, highlighted);
    if (!choice) return;
    action = choice;
    prompt.options[prompt.cursor] = { value: highlighted, label: actionLabel(choice) };
    prompt.value = `action:${choice.kind}`;
    prompt.state = "submit";
  });

  const submitted = await prompt.prompt();
  if (isCancel(submitted)) throw new CancelledError();
  if (action) return action;

  return { kind: "edit", name: String(submitted) };
}

/**
 * Server manager loop. Lists every catalog server; `e` edits, `d` deletes.
 * Esc cancels the prompt, which unwinds to the parent menu.
 */
export async function manageServers(store: Store): Promise<void> {
  if (Object.keys(store.catalog).length === 0) {
    p.log.warn("No servers registered yet. Use “Add a server” first.");
    return;
  }

  const external = externalServers(store);
  const pluginNotes = Object.entries(external).map(([name, info]) => describeExternal(name, info));
  if (pluginNotes.length > 0) {
    p.log.info(`Plugin-provided: ${pluginNotes.join("; ")}`);
  }

  for (;;) {
    const choice = await chooseServer(store);

    if (choice.kind === "edit") {
      await runSubFlow(async () => {
        await editServerFlow(store, choice.name);
      }, menuChrome(store));
    } else {
      await runSubFlow(async () => {
        await deleteServerFlow(store, choice.name);
      }, menuChrome(store));
    }
  }
}
