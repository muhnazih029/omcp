# Changelog

## Unreleased

### Added

- Server manager on `m` (or `omcp servers`): lists every catalog server, `e` to edit and `d` to delete the highlighted one.
- `omcp server rm <name> [--force]` to delete a server non-interactively.
- Editing a server can change its name, start command, description and tags; renaming updates every profile that named it.
- Deleting a server removes it from the catalog, every profile and `opencode.json` in one write.

### Changed

- Removed every `← Back` option row. `Esc` (or `Ctrl+C`) now backs out of any prompt; the `?` panel lists it beside the other navigation keys.
- Redesigned the launcher menu: block-letter `omcp` header, extended rules, `full`/`minimal` pinned to the top, `●`/`○` markers, and server detail shown only for the highlighted row.
- The primary keys (↑/↓, Enter, `e`, `a`, `?`, `q`) are now a single footer line; `c`, `d`, `m`, `s`, `x` and the hints live in a `?` toggle panel.
- The menu scales to narrow terminals, keeps the `omcp` header visible above sub-flows, and shows `none` only when the highlighted profile actually has no servers.

## 0.1.0 — 2026-11-19

First public release.

### Added

- Profile-based MCP switching for OpenCode: applying a profile writes `disabled: true` for every server outside it.
- Five starter profiles — `build`, `design`, `full`, `minimal`, `think` — that exist on a fresh install with zero servers.
- Dynamic `full` profile backed by the `["*"]` wildcard, so servers added later are included automatically.
- Interactive menu with ↑/↓ navigation, Enter to apply, and contextual keys: `e` edit, `d` delete, `a` add, `s` sync, `c` create, `x` custom session, `q` quit.
- Custom session mode that restores the previous server set when OpenCode exits.
- Server catalog with registration (`bunx`, `npx`, command, remote URL, Git repository) and import from `opencode.json`.
- `opencode` wrapper setup so typing `opencode` opens the profile menu first, with an `OMCP_BYPASS` escape hatch.
- `omcp doctor` diagnostics for config shape, profiles, the OpenCode binary, the wrapper and PATH order.
- Markers for plugin-provided MCP servers that `disabled` cannot turn off (`claude-mem`).
- Backups before every config write, preservation of unrelated keys, and no-op writes when nothing changed.
- Prebuilt binaries for Linux and macOS (x64 and arm64) plus an `install.sh` with checksum verification.

### Notes

- Requires OpenCode v2.2 or newer (V2 `mcp.servers` shape).
- Windows is not supported yet.

[0.1.0]: https://github.com/muhnazih029/omcp/releases/tag/v0.1.0
