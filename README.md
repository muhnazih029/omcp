# omcp

[![CI](https://github.com/muhnazih029/omcp/actions/workflows/ci.yml/badge.svg)](https://github.com/muhnazih029/omcp/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/muhnazih029/omcp)](https://github.com/muhnazih029/omcp/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Profile-based MCP switching for [OpenCode](https://opencode.ai).**

Turn MCP servers on and off per workflow instead of paying the context cost of every server, on every request, forever.

```sh
curl -fsSL https://github.com/muhnazih029/omcp/releases/latest/download/install.sh | sh
```

```
$ omcp

┌  omcp
│  Active profile : full
│  Enabled servers: no servers
│  Config         : ~/.config/opencode/opencode.json
│
◆  Choose a profile
│  ● 💻 build (no servers)
│  ○ 🎨 design (no servers)
│  ○ ⚡ full (all configured servers)
│  ○ 🍃 minimal (no servers)
│  ○ 🧠 think (no servers)
│
│  ↑/↓ move · Enter apply
│  e edit · d delete · a add · s sync · c create · x custom · q quit
└
```

A brand-new install already shows all five profiles, even with zero MCP servers configured. The starter profiles are empty — you decide which servers belong in each one.

---

## Why

Every MCP server configured in OpenCode connects at startup, and its tool schemas become part of the model context on every turn. Five servers can mean dozens of tools and thousands of tokens of schema — paid again on every request, even when you are writing a README and the design server has nothing to say.

`omcp` keeps a single catalog of servers plus a set of named **profiles**. When you pick a profile, only that profile's servers are connected. The rest stay defined in `opencode.json` with `disabled: true`, so switching back is a flag flip, not a re-configuration.

## Features

- **Starter profiles** — `build`, `design`, `full`, `minimal`, `think` always exist, even with zero servers.
- **Dynamic `full`** — always means every server currently in your catalog; new servers join automatically.
- **Arrow navigation + shortcuts** — ↑/↓ through profiles, Enter to apply, single keys for actions on the highlighted profile.
- **Persistent edits** — change what a profile contains once and it stays that way.
- **Custom sessions** — pick an ad-hoc server set for one run, restored automatically when OpenCode exits.
- **Server installer** — register `bunx` / `npx` packages, existing commands, remote URLs, or clone a Git repo and run its install/build steps.
- **Live reload** — OpenCode watches its config file, so a profile switch reconnects servers without a restart.
- **Legacy migration** — old configs with servers directly under `mcp` are migrated to the V2 `mcp.servers` shape on the first write.
- **Careful writes** — every change is backed up, unrelated config keys are preserved, and identical content is never rewritten.

## Requirements

- Linux or macOS (Windows is not supported yet)
- [OpenCode](https://opencode.ai) v2.2 or newer

Building from source additionally needs [Bun](https://bun.sh) 1.1 or newer.

## Install

```sh
curl -fsSL https://github.com/muhnazih029/omcp/releases/latest/download/install.sh | sh
```

The script picks the binary for your OS and architecture, verifies its SHA-256 checksum, and installs it to `~/.local/bin`. Override the destination with `OMCP_INSTALL_DIR`, or pin a version with `OMCP_VERSION=0.1.0`.

### From source

```sh
git clone https://github.com/muhnazih029/omcp.git
cd omcp
bun install
bun link          # exposes the `omcp` command
omcp              # first run asks how you want to launch
```

On your first `omcp` run you pick how to launch:

- **Use the `omcp` command only** — best for a quick try, leaves `opencode` untouched.
- **Install the `opencode` wrapper** — typing plain `opencode` opens the profile menu first.
- **Decide later** — run `omcp setup` whenever you want.

The choice is saved in `~/.config/opencode/omcp.json`, so you are only asked once. You can change it any time with `omcp setup` or `omcp setup --remove`.

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

Created on first run regardless of how many servers you have:

| Profile | Initial servers | Use it for |
| --- | --- | --- |
| `💻 build` | none | Day-to-day coding, reviews, tasks |
| `🎨 design` | none | UI/UX, wireframes, visual work |
| `⚡ full` | every configured server (dynamic) | Complex multi-discipline sessions |
| `🍃 minimal` | none | Quick questions, edits, cheapest context |
| `🧠 think` | none | Research, brainstorming, long-term memory |

`build`, `design` and `think` start empty on purpose. Add servers to them with `omcp edit <name>` or while registering a new server. `full` stores the wildcard `["*"]`, so it expands to your whole catalog every time you apply it — a server added later is included without touching the profile.

`Custom session` is not a saved profile: it applies a one-off server set and restores the previous config when OpenCode exits.

## Plugin-provided servers

Some MCP servers are not started from `mcp.servers` at all — an OpenCode plugin owns them, or their command runs from inside a plugin install. `omcp` marks those with `*` in `list`, `status`, the profile editor and `doctor`:

```text
Disabled  claude-mem*, github
Plugin    claude-mem (declared by claude-mem.js) — cannot be disabled by omcp
```

`omcp` still writes `disabled: true` for them, so OpenCode will not spawn the copy defined in config. But the plugin keeps its own copy alive, so switching profiles cannot turn it off. To disable one for real, remove or rename its file under `~/.config/opencode/plugins/` and stop any daemon it started.

## Menu navigation and shortcuts

The main menu lists **profiles only**. Use ↑/↓ to move the highlight and Enter to apply the selected profile. The key hints are printed as a footer under the list — they are text, not extra menu rows.

| Key | Action |
| --- | --- |
| `e` | Edit the **highlighted** profile — change which servers it enables |
| `d` | Delete the **highlighted** profile (servers stay configured, with confirmation) |
| `a` | Register a new server and add it to the **highlighted** profile |
| `s` | Sync from `opencode.json` and add imported servers to the **highlighted** profile |
| `c` | Create a new profile |
| `x` | Custom session (this run only) |
| `q` | Quit without launching |

With `full`, `a` and `s` do not add explicit entries because the wildcard already covers every server.

Every sub-menu has a **← Back** option that returns to the main menu. Cancelling a text or multiselect prompt with `Ctrl+C` also returns to the menu instead of exiting `omcp`.

### "Add a server" vs "Sync"

- **Add a server** (`a`) registers a brand-new MCP definition: a `bunx`/`npx` package, an existing command, a remote HTTP endpoint, or a Git repository that is cloned and built. The server lands in the catalog **disabled**, then is assigned to the profile you were highlighting.
- **Sync** (`s`) imports servers you already added elsewhere, for example with `opencode mcp add` or by hand-editing `opencode.json`, and assigns the new ones to the highlighted profile. It does not install anything and never overwrites definitions you changed by hand.

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
