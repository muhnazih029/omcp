import { isCancel, SelectPrompt } from "@clack/core";
import * as p from "@clack/prompts";
import { externalServers, markExternal } from "../external.ts";
import type { Store } from "../types.ts";
import { describeCommand } from "../util.ts";
import { menuChrome, menuWidths } from "./chrome.ts";
import { CancelledError, runSubFlow, shortenHint } from "./common.ts";
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
      return `Edit ${choice.name}`;
    case "delete":
      return `Delete ${choice.name}`;
  }
}

export function serverMenuFooter(compact = false): string {
  if (compact) return "↑↓ move  e edit  d delete  esc back";
  return "[↑↓] move    [e] edit    [d] delete    [esc] back";
}

function alignRight(left: string, right: string, width: number): string {
  const gap = Math.max(1, width - 2 - left.length - right.length);
  return `  ${left}${" ".repeat(gap)}${right}`;
}

function serverRow(
  option: ServerOption,
  selected: boolean,
  width: number,
  kind: string,
): string {
  const marker = selected ? "●" : "○";
  const prefix = `${marker} ${option.label.padEnd(14)}  `;
  const detailWidth = Math.max(0, width - 3 - prefix.length - kind.length);
  const detail = selected ? (shortenHint(option.hint ?? "none", detailWidth) ?? "") : "";
  const body = prefix + detail;
  return `  ${body.padEnd(width - 2 - kind.length)}${kind}`;
}

function renderServerMenu(prompt: ServerPrompt, store: Store): string {
  const selected = prompt.options[prompt.cursor]?.value ?? "";
  const { content, rule } = menuWidths();
  const external = externalServers(store);
  const compact = content < 76;
  const thin = `  ${"─".repeat(rule - 2)}`;

  if (prompt.state === "submit" || prompt.state === "cancel") {
    const chosen = prompt.options[prompt.cursor]?.label ?? "";
    return `${alignRight("MCP SERVERS", `${prompt.options.length} TOTAL`, content)}\n${thin}\n  ${chosen}\n`;
  }

  const lines = [
    alignRight("MCP SERVERS", `${prompt.options.length} TOTAL`, content),
    thin,
  ];

  for (const option of prompt.options) {
    const name = option.value;
    const kind = name in external
      ? "plugin"
      : store.catalog[name]?.server.type === "remote"
        ? "remote"
        : "local";
    lines.push(serverRow(option, name === selected, content, kind));
  }

  lines.push("", thin);
  lines.push(`  ${serverMenuFooter(compact)}`);
  if (Object.keys(external).length > 0) {
    lines.push("", `  * plugin-provided — edit and delete are disabled.`);
  }
  lines.push("");
  return lines.join("\n");
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
  let submittedLabel = "";
  const prompt = new SelectPrompt<ServerOption>({
    options,
    initialValue: options[0]?.value,
    render: function (this: ServerPrompt) {
      return renderServerMenu(this, store);
    },
  });

  let action: ServerChoice | null = null;
  prompt.on("key", (value?: string) => {
    const highlighted = prompt.options[prompt.cursor]?.value ?? "";
    const choice = serverAction(value, highlighted);
    if (!choice) return;
    action = choice;
    submittedLabel = actionLabel(choice);
    prompt.value = `action:${choice.kind}`;
    prompt.state = "submit";
  });

  const submitted = await prompt.prompt();
  if (isCancel(submitted)) throw new CancelledError();
  if (action) {
    if (submittedLabel) console.log(`  ${submittedLabel}`);
    return action;
  }

  return { kind: "edit", name: String(submitted) };
}

/** Server manager loop. Lists every catalog server; `e` edits, `d` deletes. */
export async function manageServers(store: Store): Promise<void> {
  if (Object.keys(store.catalog).length === 0) {
    p.log.warn("No servers registered yet. Use “Add a server” first.");
    return;
  }

  for (;;) {
    const choice = await chooseServer(store);

    if (choice.kind === "edit") {
      await runSubFlow(async () => {
        await editServerFlow(store, choice.name);
      }, menuChrome());
    } else {
      await runSubFlow(async () => {
        await deleteServerFlow(store, choice.name);
      }, menuChrome());
    }
  }
}
