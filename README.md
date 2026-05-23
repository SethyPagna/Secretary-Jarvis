<p align="center">
  <img src="assets/banner.png" alt="JARVIS" width="100%">
</p>

# JARVIS ☤

<p align="center">
  <a href="https://jarvis-agent.nousresearch.com/docs/"><img src="https://img.shields.io/badge/Docs-jarvis--agent.nousresearch.com-FFD700?style=for-the-badge" alt="Documentation"></a>
  <a href="https://discord.gg/NousResearch"><img src="https://img.shields.io/badge/Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord"></a>
  <a href="https://github.com/NousResearch/jarvis-agent/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License: MIT"></a>
  <a href="https://nousresearch.com"><img src="https://img.shields.io/badge/Built%20by-Nous%20Research-blueviolet?style=for-the-badge" alt="Built by Nous Research"></a>
  <a href="README.zh-CN.md"><img src="https://img.shields.io/badge/Lang-中文-red?style=for-the-badge" alt="中文"></a>
</p>

**The self-improving AI agent built by [Nous Research](https://nousresearch.com).** It's the only agent with a built-in learning loop — it creates skills from experience, improves them during use, nudges itself to persist knowledge, searches its own past conversations, and builds a deepening model of who you are across sessions. Run it on a $5 VPS, a GPU cluster, or serverless infrastructure that costs nearly nothing when idle. It's not tied to your laptop — talk to it from Telegram while it works on a cloud VM.

Use any model you want: llama.cpp first, vLLM second, Ollama as the final local fallback, plus [Nous Portal](https://portal.nousresearch.com), [OpenRouter](https://openrouter.ai), [NovitaAI](https://novita.ai), [NVIDIA NIM](https://build.nvidia.com), [Hugging Face](https://huggingface.co), OpenAI, or your own endpoint. Switch from the desktop Models page with no code changes and no lock-in.

<table>
<tr><td><b>Desktop-first control surface</b></td><td>Unified Home page with orb, live stats, voice input/output, terminal, chat, tools, and notifications in one place.</td></tr>
<tr><td><b>Integrated terminal</b></td><td>The standalone CLI is no longer the product surface. The desktop terminal panel provides command execution, natural-language tasks, history, and streaming tool output through the backend PTY websocket.</td></tr>
<tr><td><b>Lives where you do</b></td><td>Telegram, Discord, Slack, WhatsApp, Signal, and desktop notifications from a single gateway process. Voice memo transcription, cross-platform conversation continuity.</td></tr>
<tr><td><b>A closed learning loop</b></td><td>Agent-curated memory with periodic nudges. Autonomous skill creation after complex tasks. Skills self-improve during use. FTS5 session search with LLM summarization for cross-session recall. <a href="https://github.com/plastic-labs/honcho">Honcho</a> dialectic user modeling. Compatible with the <a href="https://agentskills.io">agentskills.io</a> open standard.</td></tr>
<tr><td><b>Scheduled automations</b></td><td>Built-in cron scheduler with delivery to any platform. Daily reports, nightly backups, weekly audits — all in natural language, running unattended.</td></tr>
<tr><td><b>Delegates and parallelizes</b></td><td>Spawn isolated subagents for parallel workstreams. Write Python scripts that call tools via RPC, collapsing multi-step pipelines into zero-context-cost turns.</td></tr>
<tr><td><b>Runs anywhere, not just your laptop</b></td><td>Seven terminal backends — local, Docker, SSH, Singularity, Modal, Daytona, and Vercel Sandbox. Daytona and Modal offer serverless persistence — your agent's environment hibernates when idle and wakes on demand, costing nearly nothing between sessions. Run it on a $5 VPS or a GPU cluster.</td></tr>
<tr><td><b>Research-ready</b></td><td>Batch trajectory generation, trajectory compression for training the next generation of tool-calling models.</td></tr>
</table>

---

## Quick Install

### Linux, macOS, WSL2, Termux

```bash
curl -fsSL https://raw.githubusercontent.com/NousResearch/jarvis-agent/main/scripts/install.sh | bash
```

### Windows (native, PowerShell) — Early Beta

> **Heads up:** Native Windows support is **early beta**. It installs and runs, but hasn't been road-tested as broadly as our Linux/macOS/WSL2 paths. Please [file issues](https://github.com/NousResearch/jarvis-agent/issues) when you hit rough edges. For the most battle-tested Windows setup today, run the Linux/macOS one-liner above inside **WSL2**.

Run this in PowerShell:

```powershell
iex (irm https://raw.githubusercontent.com/NousResearch/jarvis-agent/main/scripts/install.ps1)
```

The installer handles everything: uv, Python 3.11, Node.js, ripgrep, ffmpeg, **and a portable Git Bash** (MinGit, unpacked to `%LOCALAPPDATA%\jarvis\git` — no admin required, completely isolated from any system Git install).  Jarvis uses this bundled Git Bash to run shell commands.

If you already have Git installed, the installer detects it and uses that instead.  Otherwise a ~45MB MinGit download is all you need — it won't touch or interfere with any system Git.

> **Android / Termux:** The tested manual path is documented in the [Termux guide](https://jarvis-agent.nousresearch.com/docs/getting-started/termux). On Termux, Jarvis installs a curated `.[termux]` extra because the full `.[all]` extra currently pulls Android-incompatible voice dependencies.
>
> **Windows:** Native Windows is supported as an **early beta**. The desktop remake uses an embedded backend plus an in-app terminal, so the standalone CLI is no longer the primary surface.

During the desktop remake, the backend child process can be launched for development with:

```bash
jarvis-desktop-backend --host 127.0.0.1 --port 8765 --no-open
```

---

## Getting Started

Open the desktop app and work from the unified Home page:

- Home: orb, chat, terminal, voice, stats, quick actions, notifications.
- Models: configure llama.cpp first, vLLM second, Ollama last, plus cloud providers.
- Souls & Voices: identity, TTS, STT, wake word, voice tests.
- Permissions, Platforms, Workflow, and Settings: tool access, gateway setup, automations, packaging preferences.

📖 **[Full documentation →](https://jarvis-agent.nousresearch.com/docs/)**

## Desktop and Messaging Quick Reference

JARVIS has one primary product surface: the desktop app. Messaging platforms remain available through the gateway and share the same backend memory, model, voice, and permission configuration.

| Action | Desktop | Messaging platforms |
|---------|---------|---------------------|
| Start chatting | Home chat input or terminal panel | Configure the platform in the Platforms page, then send the bot a message |
| Start fresh conversation | `/new` or `/reset` | `/new` or `/reset` |
| Change model | Models page | `/model [provider:model]` |
| Set a personality | Souls & Voices page | `/personality [name]` |
| Retry or undo the last turn | `/retry`, `/undo` | `/retry`, `/undo` |
| Compress context / check usage | `/compress`, `/usage`, `/insights [--days N]` | `/compress`, `/usage`, `/insights [days]` |
| Browse skills | Tools overlay or terminal panel | `/<skill-name>` |
| Interrupt current work | Stop button, terminal interrupt, or new message | `/stop` or send a new message |
| Platform-specific status | Platforms page | `/status`, `/sethome` |

For platform details, see the [Messaging Gateway guide](https://jarvis-agent.nousresearch.com/docs/user-guide/messaging).

---

## Documentation

All documentation lives at **[jarvis-agent.nousresearch.com/docs](https://jarvis-agent.nousresearch.com/docs/)**:

| Section | What's Covered |
|---------|---------------|
| [Quickstart](https://jarvis-agent.nousresearch.com/docs/getting-started/quickstart) | Install → setup → first conversation in 2 minutes |
| Desktop Usage | Home terminal, Models, Souls & Voices, permissions, platforms, workflows |
| [Configuration](https://jarvis-agent.nousresearch.com/docs/user-guide/configuration) | Config file, providers, models, all options |
| [Messaging Gateway](https://jarvis-agent.nousresearch.com/docs/user-guide/messaging) | Telegram, Discord, Slack, WhatsApp, Signal, Home Assistant |
| [Security](https://jarvis-agent.nousresearch.com/docs/user-guide/security) | Command approval, DM pairing, container isolation |
| [Tools & Toolsets](https://jarvis-agent.nousresearch.com/docs/user-guide/features/tools) | 40+ tools, toolset system, terminal backends |
| [Skills System](https://jarvis-agent.nousresearch.com/docs/user-guide/features/skills) | Procedural memory, Skills Hub, creating skills |
| [Memory](https://jarvis-agent.nousresearch.com/docs/user-guide/features/memory) | Persistent memory, user profiles, best practices |
| [MCP Integration](https://jarvis-agent.nousresearch.com/docs/user-guide/features/mcp) | Connect any MCP server for extended capabilities |
| [Cron Scheduling](https://jarvis-agent.nousresearch.com/docs/user-guide/features/cron) | Scheduled tasks with platform delivery |
| [Context Files](https://jarvis-agent.nousresearch.com/docs/user-guide/features/context-files) | Project context that shapes every conversation |
| [Architecture](https://jarvis-agent.nousresearch.com/docs/developer-guide/architecture) | Project structure, agent loop, key classes |
| [Contributing](https://jarvis-agent.nousresearch.com/docs/developer-guide/contributing) | Development setup, PR process, code style |
| Desktop Backend API | Runtime readiness, smoke tests, stats, PTY, shutdown, models, voice |
| [Environment Variables](https://jarvis-agent.nousresearch.com/docs/reference/environment-variables) | Complete env var reference |

---

## Migrating from OpenClaw

If you're coming from OpenClaw, Jarvis can automatically import your settings, memories, skills, and API keys.

**During first-time setup:** The desktop setup flow should detect `~/.openclaw` and offer to migrate before configuration begins.

**Anytime after install:** use the desktop Settings > Data > Import flow. The old CLI migration command is not part of the desktop-first package surface.

What gets imported:
- **SOUL.md** — persona file
- **Memories** — MEMORY.md and USER.md entries
- **Skills** — user-created skills → `~/.jarvis/skills/openclaw-imports/`
- **Command allowlist** — approval patterns
- **Messaging settings** — platform configs, allowed users, working directory
- **API keys** — allowlisted secrets (Telegram, OpenRouter, OpenAI, Anthropic, ElevenLabs)
- **TTS assets** — workspace audio files
- **Workspace instructions** — AGENTS.md (with `--workspace-target`)

The migration UI should provide dry-run previews before writing imported data.

---

## Contributing

We welcome contributions! See the [Contributing Guide](https://jarvis-agent.nousresearch.com/docs/developer-guide/contributing) for development setup, code style, and PR process.

Quick start for contributors:

```bash
git clone https://github.com/NousResearch/jarvis-agent.git
cd jarvis-agent
uv venv .venv --python 3.11
uv pip install -e ".[all,dev]"
jarvis-desktop-backend --host 127.0.0.1 --port 8765 --no-open
```

Run tests:

```bash
scripts/run_tests.sh
```

---

## Community

- 💬 [Discord](https://discord.gg/NousResearch)
- 📚 [Skills Hub](https://agentskills.io)
- 🐛 [Issues](https://github.com/NousResearch/jarvis-agent/issues)
- 🔌 [computer-use-linux](https://github.com/avifenesh/computer-use-linux) — Linux desktop-control MCP server for Jarvis and other MCP hosts, with AT-SPI accessibility trees, Wayland/X11 input, screenshots, and compositor window targeting.
- 🔌 [HermesClaw](https://github.com/AaronWong1999/hermesclaw) — Community WeChat bridge: Run JARVIS and OpenClaw on the same WeChat account.

---

## License

MIT — see [LICENSE](LICENSE).

Built by [Nous Research](https://nousresearch.com).
