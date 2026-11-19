# Launch & Distribution Plan: omcp

Dokumen ini berisi materi siap pakai untuk mempublikasikan `omcp` ke komunitas pengembang.

---

## 1. Publish ke npm (`omcp-cli`)

Repo sudah disiapkan:
- Package name: `omcp-cli`
- Executable binary name: `omcp` (jadi `npx omcp-cli` menjalankan `omcp`)
- Build output: `dist/cli.js` (kompatibel Node.js 18+)

### Langkah eksekusi:
```sh
cd /mnt/d/Project/04-playground/omcp

# Login ke akun npm Anda
npm login

# Publish
npm publish --access public
```

Setelah di-publish, siapa pun bisa menjalankan:
```sh
npx omcp-cli
# atau
npm install -g omcp-cli
```

---

## 2. Salinan Post / Show HN / Reddit

### A. Hacker News: Show HN
**Title:** Show HN: omcp – Profile-based MCP server switcher for OpenCode

**Link:** https://github.com/muhnazih029/omcp

**Body:**
> Hey HN,
>
> If you use OpenCode (or similar agentic coding tools) with several MCP servers configured, you've probably noticed that every server is connected on every prompt turn.
>
> 5 MCP servers can easily inject 30+ tool definitions and thousands of tokens of JSON schema into your context window on every request — even when you're just asking a quick git question or writing docs where your database/browser MCPs have zero relevance.
>
> I built `omcp`, a lightweight CLI/TUI profile manager for OpenCode:
>
> 1. Starter profiles out of the box (`build`, `design`, `think`, `minimal`, and dynamic `full`).
> 2. Zero context waste: switching profiles toggles `disabled: true` in `opencode.json` so servers reconnect/disconnect instantly via OpenCode's config watcher without restarting.
> 3. Interactive TUI with arrow navigation and contextual keys (`e` to edit, `a` to register, `s` to sync).
> 4. Optional `opencode` shell wrapper so typing `opencode` gives you a quick profile picker before launching.
> 5. Detects plugin-provided MCPs (like `claude-mem`) and marks them clearly when config flags cannot disable them.
>
> Standalone binary (Linux/macOS x64 & arm64) via curl or run instantly with `npx omcp-cli`.
>
> Code & releases: https://github.com/muhnazih029/omcp
>
> Feedback and contributions welcome!

---

### B. Reddit (r/opencode, r/LocalLLaMA, r/ClaudeAI)
**Title:** Built a profile switcher for OpenCode to stop MCP servers from bloating my context window

**Post Body:**
> One issue I hit when using OpenCode with Model Context Protocol (MCP) was context tax. Having 5-6 servers configured means all their tool schemas are permanently in the prompt context.
>
> I wrote **omcp** — an interactive profile manager that lets you group MCP servers by workflow:
>
> - `minimal`: clean context, zero MCPs for rapid questions.
> - `build`: GitHub, dev tools, linters.
> - `design`: UI/Figma/Pencil MCPs.
> - `think`: research & memory servers.
> - `full`: dynamic wildcard covering all configured servers.
>
> When you pick a profile, omcp toggles `disabled: true` in `opencode.json`. Because OpenCode watches its config file, servers update immediately without losing your workflow.
>
> You can try it directly without installing via:
> ```sh
> npx omcp-cli
> ```
> Or install the single binary:
> ```sh
> curl -fsSL https://github.com/muhnazih029/omcp/releases/latest/download/install.sh | sh
> ```
>
> GitHub repo: https://github.com/muhnazih029/omcp
>
> Would love to hear if you have ideas for starter profiles or MCP workflows!

---

### C. OpenCode Discord / GitHub Discussions (Showcase)
> Hey everyone! Made a quick tool for managing MCP presets in OpenCode: **omcp**.
>
> It lets you swap between server profiles (`minimal`, `build`, `design`, `think`, `full`) from a fast TUI so you aren't paying the token/context price for unused MCP tools on every prompt turn.
>
> GitHub: https://github.com/muhnazih029/omcp
> Try it: `npx omcp-cli`
>
> Tested on Linux & macOS. Feedback appreciated!

---

## 3. Template Balasan untuk Email Agensi

Jika ingin merespons email dari Agensi.io tanpa komitmen, gunakan salah satu opsi di bawah:

### Opsi 1: Menolak dengan sopan (Rekomendasi)
> Hi,
>
> Thanks for reaching out and taking a look at `omcp`!
>
> Just to clarify, `omcp` is an open-source CLI launcher and configuration manager for OpenCode, not a standalone MCP server or prompt skill. At this stage, my focus is keeping it open-source and free for developers to use directly from GitHub and npm.
>
> I'll keep Agensi in mind if I build agent-specific skills down the line.
>
> Best regards,  
> Muhammad

### Opsi 2: Minta klarifikasi traffic & kecocokan
> Hi,
>
> Thanks for the note. `omcp` is currently a CLI/TUI profile manager for OpenCode rather than a prompt-based agent skill. 
>
> Could you clarify what format of skill you're imagining for a CLI profile tool on Agensi, and what kind of search volume you're seeing specifically for OpenCode MCP tooling?
>
> Best regards,  
> Muhammad
