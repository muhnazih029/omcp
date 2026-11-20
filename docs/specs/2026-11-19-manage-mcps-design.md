# Manage MCPs

Date: 2026-11-19

## Problem

`omcp` can register a server (`a` / `omcp add`) but cannot remove one from the catalog. Deleting a profile (`d` / `omcp rm`) only drops the profile; the server stays in `omcp.json` and `opencode.json`. A wrong registration (for example a desktop binary mistaken for an MCP command) has to be cleaned by hand.

## Decision

Keep profile delete on `d`. Add a separate server manager, opened with `m` from the main menu and with `omcp servers`.

That menu lists every catalog server. The highlighted row is the target:

- `e` edits that server's definition (Enter on the row does the same).
- `d` deletes that server from the catalog, from every profile, and from `opencode.json`.
- `Esc` cancels the prompt and returns to the main menu. There is no separate Back row.

Plugin-provided servers (`*`) are listed but cannot be edited or deleted. `disabled: true` does not stop them, and rewriting their definition would not either.

## Edit

Editing replaces the stored definition. The user picks which fields to change:

- name
- how it starts (same wizard as add: bunx, npx, command, remote, git)
- description
- tags

Environment variables are part of the start wizard, not a separate field. They stay optional. A server that does not need them leaves the prompt empty.

Renaming updates the catalog key and every profile that names the server. A wildcard profile (`["*"]`) needs no rewrite.

## Delete

Delete asks for confirmation. On yes:

1. Drop the catalog entry.
2. Remove the name from every explicit profile list.
3. Rewrite `opencode.json` from the remaining catalog so the server is gone, not merely disabled.

If the active config had that server enabled, the rewrite leaves it out. OpenCode reloads on save.

## CLI

- `omcp servers` opens the same manager (needs a TTY).
- `omcp server rm <name>` deletes without the menu. It refuses plugin-provided servers and unknown names. `--force` skips the confirmation prompt when stdin is not a TTY; otherwise it confirms.

`omcp rm` stays "delete a profile".

## Out of scope

- Editing a plugin-owned server.
- A separate env-only editor.
- Changing which profiles include a server (that remains `e` on the profile menu).
