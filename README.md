# omcp

**Profile-based MCP switching for [OpenCode](https://opencode.ai).**

Turn MCP servers on and off per workflow instead of paying the context cost of every server, on every request, forever.

```
$ opencode

┌  omcp
│  Active profile : build
│  Enabled servers: github, context7, dank-todo
│  Config         : ~/.config/opencode/opencode.json
│
◆  What do you want to do?
│  ○ 🎨 design   pencil
│  ○ 🧠 think    claude-mem, context7
│  ● 💻 build    github, context7, dank-todo · active, last used
│  ○ ⚡ full     claude-mem, github, context7, pencil, dank-todo
│  ○ 🍃 minimal  no servers
│  ○ 🎯 Custom session      pick servers for this run only
│  ○ ✏️  Edit a profile      change which servers a profile enables
│  ○ ➕ Create a profile     new reusable preset
│  ○ 📦 Add a server         register or install an MCP server
│  ○ 🔄 Sync from opencode.json
│  ○ 🗑  Delete a profile
│  ○ ✖  Quit
└
```

---

## Why

Every MCP server configured in OpenCode connects at startup, and its tool schemas become part of the model context on every turn. Five servers can mean dozens of tools and thousands of tokens of schema — paid again on every request, even when you are writing a README and the design server has nothing to say.

`omcp` keeps a single catalog of servers plus a set of named **profiles**. When you pick a profile, only that profile's servers are connected. The rest stay defined in `opencode.json` with `disabled: true`, so switching back is a flag flip, not a re-configuration.

## Features

- **Profiles** — `design`, `think`, `build`, `full`, `minimal` seeded on first run, all editable.
- **Persistent edits** — change what a profile contains once and it stays that way.
- **Custom sessions** — pick an ad-hoc server set for one run, restored automatically when OpenCode exits.
- **Server installer** — register `bunx` / `npx` packages, existing commands, remote URLs, or clone a Git repo and run its install/build steps.
- **Live reload** — OpenCode watches its config file, so a profile switch reconnects servers without a restart.
- **Legacy migration** — old configs with servers directly under `mcp` are migrated to the V2 `mcp.servers` shape on the first write.
- **Careful writes** — every change is backed up, unrelated config keys are preserved, and identical content is never rewritten.

## Requirements

- [Bun](https://bun.sh) 1.1 or newer
- OpenCode v2.2 or newer

## Install

```sh
git clone https://github.com/muhnazih029/omcp.git
cd omcp
bun install
bun link          # exposes the `omcp` command
omcp setup        # installs the `opencode` wrapper into ~/.local/bin
```

`omcp setup` writes `~/.local/bin/opencode`, which opens the menu and then hands the terminal to the real binary. It never replaces the real binary and falls back to it when:

- `OMCP_BYPASS` is set (omcp sets this when it launches OpenCode),
- `OMCP_NO_MENU` is set (for scripts and CI),
- stdin or stdout is not a terminal.

Remove it any time:

```sh
omcp setup --remove
```

Make sure `~/.local/bin` comes before the real binary directory in `PATH`. `omcp doctor` tells you if it does not.

## Quickstart

```sh
omcp                  # interactive launcher
omcp use build        # switch profile without launching
opencode              # opens the menu, then starts OpenCode
```

## Commands

| Command | What it does |
| --- | --- |
| `omcp` | Interactive launcher |
| `omcp -p, --profile <name> [args…]` | Apply a profile; forward the rest to OpenCode |
| `omcp use <name>` | Apply a profile, no launch |
| `omcp launch [name] [-- args…]` | Apply (optional) and launch |
| `omcp custom` | Custom server set for one run |
| `omcp list` | Profiles and servers with active markers |
| `omcp status` | Current profile, enabled and disabled servers |
| `omcp edit [name]` | Change which servers a profile enables |
| `omcp new` | Create a profile |
| `omcp rm <name>` | Delete a profile (servers stay configured) |
| `omcp add` | Register or install an MCP server |
| `omcp sync` | Import servers added to `opencode.json` elsewhere |
| `omcp doctor` | Diagnose config, PATH, wrapper and profile problems |
| `omcp setup [--force]` | Install the `opencode` wrapper |
| `omcp setup --remove` | Remove the wrapper |

Anything that is not an omcp command is forwarded to OpenCode:

```sh
omcp mcp list
omcp service status
omcp run --prompt "summarize this repo"
omcp --continue
```

## Starter profiles

Created on first run, only for servers you actually have configured:

| Profile | Servers | Use it for |
| --- | --- | --- |
| `🎨 design` | `pencil`, `figma`, `playwright`, `shadcn`, `magic` | UI/UX, wireframes, visual work |
| `🧠 think` | `claude-mem`, `context7`, `sequential-thinking`, `memory`, `deepwiki` | Research, brainstorming, long-term memory |
| `💻 build` | `github`, `gitlab`, `context7`, `dank-todo`, `sentry`, `postgres` | Day-to-day coding, reviews, tasks |
| `⚡ full` | every configured server | Complex multi-discipline sessions |
| `🍃 minimal` | none | Quick questions, edits, cheapest context |

Names that are not installed are dropped, and a profile whose servers are all missing is skipped. Edit any of them with `omcp edit`.

## How it works

OpenCode reads MCP servers from `mcp.servers`. A server stays configured but disconnected with `disabled: true`, and config changes are picked up without a restart.

`omcp` writes that map for you:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "model": "9router/main",
  "mcp": {
    "servers": {
      "github": { "type": "local", "command": ["bunx", "-y", "@modelcontextprotocol/server-github"] },
      "pencil": {
        "type": "local",
        "command": ["/opt/pencil/mcp-server"],
        "disabled": true
      }
    }
  }
}
```

The server catalog and your profiles live next to it in `~/.config/opencode/omcp.json`:

```jsonc
{
  "version": 1,
  "lastProfile": "build",
  "opencodeBinary": "/usr/bin/opencode",
  "profiles": {
    "design": { "emoji": "🎨", "description": "UI/UX and visual work", "servers": ["pencil"] }
  },
  "catalog": {
    "pencil": {
      "description": "OpenPencil design MCP",
      "tags": ["design"],
      "server": { "type": "local", "command": ["/opt/pencil/mcp-server"] }
    }
  }
}
```

`OPENCODE_CONFIG_DIR` and `XDG_CONFIG_HOME` are honoured, so the whole thing can be pointed at a sandbox directory.

## Safety

- Every config write first copies the previous file to `~/.config/opencode/omcp-backups/` (last 20 kept).
- Keys other than `mcp` are never touched.
- Identical content is not rewritten, so OpenCode is not reloaded for nothing.
- Server definitions edited by hand (or with `opencode mcp add`) win: `omcp sync` imports them instead of overwriting.

## Roadmap

- [ ] TUI plugin so profiles can be switched from inside a running session
- [ ] Project-scoped profiles (`.opencode/omcp.json`)
- [ ] Shareable server recipes (`omcp install <recipe>`)
- [ ] Optional remote catalog for popular MCP servers

## Contributing

Issues and pull requests are welcome. Please run `bun test` and `bun run typecheck` before opening a PR.

## License

[MIT](./LICENSE)
