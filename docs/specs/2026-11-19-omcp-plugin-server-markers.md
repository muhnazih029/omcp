# Plugin-provided MCP markers

**Date:** 2026-11-19
**Status:** implemented

## Problem

`omcp` controls servers through `mcp.servers[*].disabled`. That works for plain MCP entries, but some servers are started by an OpenCode plugin instead. After switching to a profile that excludes such a server, it can remain active and keep appearing in existing sessions — most visibly `claude-mem`, which also runs a persistent daemon.

Users need to see *why* a profile switch did not turn that server off, without reading plugin source or process tables.

## Design

Add a marker, not new profile behaviour. `omcp` never tries to kill processes or edit plugins.

### Detection (`src/external.ts`)

A catalog server is plugin-provided when either signal holds:

1. a file in `~/.config/opencode/plugins/` has the same name after normalising case and punctuation (`claude-mem.js` ↔ `claude-mem`), or
2. its command path contains a `plugins/` directory segment (`.../.claude/plugins/.../mcp-server.cjs`).

Both are structural. Plugin file contents are not scanned, so an unrelated mention of a server name cannot produce a false positive.

### Presentation

- `omcp list` / `omcp status`: server names get `*`, plus one explanatory line:
  `claude-mem (declared by claude-mem.js) — cannot be disabled by omcp`.
- `omcp doctor`: warning check `Plugin-provided MCPs` (does not change the exit code).
- Profile editor (`serverOptions`): hint starts with `plugin-provided · …`.
- Menu header: a `Plugin` row appears only when such servers exist.

## Out of scope

- Killing stale MCP child processes or daemons.
- Editing or removing plugin files.
- Changing how profiles compute their server set.

## Verification

- `test/external.test.ts`: name match (including dash/case differences), command-path match, ordinary servers, missing plugins directory, marker formatting.
- Manual: `omcp status` and `omcp doctor` against the real config show `claude-mem*` with the plugin reason.
