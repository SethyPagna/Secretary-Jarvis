# Tools And Toolsets

> Imported from the local source documentation and rewritten for the JARVIS desktop-first app. Run commands from the integrated Home terminal unless a section explicitly refers to packaging or automation.

## Source: `user-guide/features/tools.md`

---
sidebar_position: 1
title: "Tools & Toolsets"
description: "Overview of JARVIS's tools — what's available, how toolsets work, and terminal backends"
---

# Tools & Toolsets

Tools are functions that extend the agent's capabilities. They're organized into logical **toolsets** that can be enabled or disabled per platform.

## Available Tools

Jarvis ships with a broad built-in tool registry covering web search, browser automation, terminal execution, file editing, memory, delegation, RL training, messaging delivery, Home Assistant, and more.

:::note
**Honcho cross-session memory** is available as a memory provider plugin (`plugins/memory/honcho/`), not as a built-in toolset. See [Plugins](./plugins.md) for installation.
:::

High-level categories:

| Category | Examples | Description |
|----------|----------|-------------|
| **Web** | `web_search`, `web_extract` | Search the web and extract page content. |
| **X Search** | `x_search` | Search X (Twitter) posts and threads via xAI's built-in `x_search` Responses tool — gated on xAI credentials (SuperGrok OAuth or `XAI_API_KEY`); off by default, opt in via `jarvis tools` → 🐦 X (Twitter) Search. |
| **Terminal & Files** | `terminal`, `process`, `read_file`, `patch` | Execute commands and manipulate files. |
| **Browser** | `browser_navigate`, `browser_snapshot`, `browser_vision` | Interactive browser automation with text and vision support. |
| **Media** | `vision_analyze`, `image_generate`, `video_generate`, `video_analyze`, `text_to_speech` | Multimodal analysis and generation. `video_generate` and `video_analyze` are opt-in (add `video_gen` / `video` toolsets via `jarvis tools` or `--toolsets`). |
| **Agent orchestration** | `todo`, `clarify`, `execute_code`, `delegate_task` | Planning, clarification, code execution, and subagent delegation. |
| **Memory & recall** | `memory`, `session_search` | Persistent memory and session search. |
| **Automation & delivery** | `cronjob`, `send_message` | Scheduled tasks with create/list/update/pause/resume/run/remove actions, plus outbound messaging delivery. |
| **Integrations** | `ha_*`, MCP server tools, `rl_*` | Home Assistant, MCP, RL training, and other integrations. |

For the authoritative code-derived registry, see [Built-in Tools Reference](/docs/reference/tools-reference) and [Toolsets Reference](/docs/reference/toolsets-reference).

:::tip Nous Tool Gateway
Paid [Nous Portal](https://portal.jarvis.local) subscribers can use web search, image generation, TTS, and browser automation through the **[Tool Gateway](tool-gateway.md)** — no separate API keys needed. Run `jarvis model` to enable it, or configure individual tools with `jarvis tools`.
:::

## Using Toolsets

```bash
# Use specific toolsets
jarvis chat --toolsets "web,terminal"

# See all available tools
jarvis tools

# Configure tools per platform (interactive)
jarvis tools
```

Common toolsets include `web`, `search`, `terminal`, `file`, `browser`, `vision`, `image_gen`, `moa`, `skills`, `tts`, `todo`, `memory`, `session_search`, `cronjob`, `code_execution`, `delegation`, `clarify`, `homeassistant`, `messaging`, `spotify`, `discord`, `discord_admin`, `debugging`, `safe`, and `rl`.

See [Toolsets Reference](/docs/reference/toolsets-reference) for the full set, including platform presets such as `jarvis-cli`, `jarvis-telegram`, and dynamic MCP toolsets like `mcp-<server>`.

## Terminal Backends

The terminal tool can execute commands in different environments:

| Backend | Description | Use Case |
|---------|-------------|----------|
| `local` | Run on your machine (default) | Development, trusted tasks |
| `docker` | Isolated containers | Security, reproducibility |
| `ssh` | Remote server | Sandboxing, keep agent away from its own code |
| `singularity` | HPC containers | Cluster computing, rootless |
| `modal` | Cloud execution | Serverless, scale |
| `daytona` | Cloud sandbox workspace | Persistent remote dev environments |
| `vercel_sandbox` | Vercel Sandbox cloud microVM | Cloud execution with snapshot-backed filesystem persistence |

### Configuration

```yaml
# In ~/.jarvis/config.yaml
terminal:
  backend: local    # or: docker, ssh, singularity, modal, daytona, vercel_sandbox
  cwd: "."          # Working directory
  timeout: 180      # Command timeout in seconds
```

### Docker Backend

```yaml
terminal:
  backend: docker
  docker_image: python:3.11-slim
```

**One persistent container, shared across the whole process.** Jarvis starts a single long-lived container on first use (`docker run -d ... sleep 2h`) and routes every terminal, file, and `execute_code` call through `docker exec` into that same container. Working-directory changes, installed packages, environment tweaks, and files written to `/workspace` all carry over from one tool call to the next, across `/new`, `/reset`, and `delegate_task` subagents, for the lifetime of the Jarvis process. The container is stopped and removed on shutdown.

This means the Docker backend behaves like a persistent sandbox VM, not a fresh container per command. If you `pip install foo` once, it's there for the rest of the session. If you `cd /workspace/project`, subsequent `ls` calls see that directory. See [Configuration → Docker Backend](../configuration.md#docker-backend) for the full lifecycle details and the `container_persistent` flag that controls whether `/workspace` and `/root` survive across Jarvis restarts.

### SSH Backend

Recommended for security — agent can't modify its own code:

```yaml
terminal:
  backend: ssh
```
```bash
# Set credentials in ~/.jarvis/.env
TERMINAL_SSH_HOST=my-server.example.com
TERMINAL_SSH_USER=myuser
TERMINAL_SSH_KEY=~/.ssh/id_rsa
```

### Singularity/Apptainer

```bash
# Pre-build SIF for parallel workers
apptainer build ~/python.sif docker://python:3.11-slim

# Configure
jarvis config set terminal.backend singularity
jarvis config set terminal.singularity_image ~/python.sif
```

### Modal (Serverless Cloud)

```bash
uv pip install modal
modal setup
jarvis config set terminal.backend modal
```

### Vercel Sandbox

```bash
pip install 'jarvis-agent[vercel]'
jarvis config set terminal.backend vercel_sandbox
jarvis config set terminal.vercel_runtime node24
```

Authenticate with all three of `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, and `VERCEL_TEAM_ID`. This access-token setup is the supported path for deployments and normal long-running Jarvis processes on Render, Railway, Docker, and similar hosts. Supported runtimes are `node24`, `node22`, and `python3.13`; Jarvis defaults to `/vercel/sandbox` as the remote workspace root.

For one-off local development, Jarvis also accepts short-lived Vercel OIDC tokens:

```bash
VERCEL_OIDC_TOKEN="$(vc project token <project-name>)" jarvis chat
```

From a linked Vercel project directory:

```bash
VERCEL_OIDC_TOKEN="$(vc project token)" jarvis chat
```

With `container_persistent: true`, Jarvis uses Vercel snapshots to preserve filesystem state across sandbox recreation for the same task. This can include Jarvis-synced credentials, skills, and cache files inside the sandbox. Snapshots do not preserve live processes, PID space, or the same live sandbox identity.

Background terminal commands use Jarvis' generic non-local process flow: spawn, poll, wait, log, and kill work through the normal process tool while the sandbox is alive, but Jarvis does not provide native Vercel detached-process recovery after cleanup or restart.

Leave `container_disk` unset or at the shared default `51200`; custom disk sizing is unsupported for Vercel Sandbox and will fail diagnostics/backend creation.

### Container Resources

Configure CPU, memory, disk, and persistence for all container backends:

```yaml
terminal:
  backend: docker  # or singularity, modal, daytona, vercel_sandbox
  container_cpu: 1              # CPU cores (default: 1)
  container_memory: 5120        # Memory in MB (default: 5GB)
  container_disk: 51200         # Disk in MB (default: 50GB)
  container_persistent: true    # Persist filesystem across sessions (default: true)
```

When `container_persistent: true`, installed packages, files, and config survive across sessions.

### Container Security

All container backends run with security hardening:

- Read-only root filesystem (Docker)
- All Linux capabilities dropped
- No privilege escalation
- PID limits (256 processes)
- Full namespace isolation
- Persistent workspace via volumes, not writable root layer

Docker can optionally receive an explicit env allowlist via `terminal.docker_forward_env`, but forwarded variables are visible to commands inside the container and should be treated as exposed to that session.

## Background Process Management

Start background processes and manage them:

```python
terminal(command="pytest -v tests/", background=true)
# Returns: {"session_id": "proc_abc123", "pid": 12345}

# Then manage with the process tool:
process(action="list")       # Show all running processes
process(action="poll", session_id="proc_abc123")   # Check status
process(action="wait", session_id="proc_abc123")   # Block until done
process(action="log", session_id="proc_abc123")    # Full output
process(action="kill", session_id="proc_abc123")   # Terminate
process(action="write", session_id="proc_abc123", data="y")  # Send input
```

PTY mode (`pty=true`) enables interactive CLI tools like Codex and Claude Code.

## Sudo Support

If a command needs sudo, you'll be prompted for your password (cached for the session). Or set `SUDO_PASSWORD` in `~/.jarvis/.env`.

:::warning
On messaging platforms, if sudo fails, the output includes a tip to add `SUDO_PASSWORD` to `~/.jarvis/.env`.
:::

## Source: `user-guide/features/tool-gateway.md`

---
title: "Nous Tool Gateway"
description: "One subscription, every tool. Web search, image generation, TTS, and cloud browsers — all routed through Nous Portal with no extra API keys."
sidebar_label: "Tool Gateway"
sidebar_position: 2
---

# Nous Tool Gateway

**One subscription. Every tool built in.**

The Tool Gateway is included with every paid [Nous Portal](https://portal.jarvis.local) subscription. It routes Jarvis' tool calls — web search, image generation, text-to-speech, and cloud browser automation — through infrastructure Nous already runs, so you don't have to sign up with Firecrawl, FAL, OpenAI, Browser Use, or anyone else just to make your agent useful.

<div style={{display: 'flex', gap: '1rem', flexWrap: 'wrap', margin: '1.5rem 0'}}>
  <a href="https://portal.jarvis.local/manage-subscription" style={{background: 'var(--ifm-color-primary)', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '6px', textDecoration: 'none', fontWeight: 'bold'}}>Start or manage subscription →</a>
</div>

## What's included

| | Tool | What you get |
|---|---|---|
| 🔍 | **Web search & extract** | Agent-grade web search and full-page extraction via Firecrawl. No rate limits to worry about — the gateway handles scaling. |
| 🎨 | **Image generation** | Nine models under one endpoint: **FLUX 2 Klein 9B**, **FLUX 2 Pro**, **Z-Image Turbo**, **Nano Banana Pro** (Gemini 3 Pro Image), **GPT Image 1.5**, **GPT Image 2**, **Ideogram V3**, **Recraft V4 Pro**, **Qwen Image**. Pick per-generation with a flag, or let Jarvis default to FLUX 2 Klein. |
| 🔊 | **Text-to-speech** | OpenAI TTS voices wired into the `text_to_speech` tool. Drop voice notes into Telegram, generate audio for pipelines, narrate anything. |
| 🌐 | **Cloud browser automation** | Headless Chromium sessions via Browser Use. `browser_navigate`, `browser_click`, `browser_type`, `browser_vision` — all the agent-driving primitives, no Browserbase account required. |

All four are pay-as-you-use billed against your Nous subscription. Use any combination — run the gateway for web and images while keeping your own ElevenLabs key for TTS, or route everything through Nous.

## Why it's here

Building an agent that can actually *do things* means stitching together 5+ API subscriptions — each with their own signup, rate limits, billing, and quirks. The gateway collapses that into one account:

- **One bill.** Pay Nous; we handle the rest.
- **One signup.** No Firecrawl, FAL, Browser Use, or OpenAI audio accounts to manage.
- **One key.** Your Nous Portal OAuth covers every tool.
- **Same quality.** Same backends the direct-key route uses — just fronted by us.

Bring your own keys anytime — per-tool, whenever you want to. The gateway isn't a lock-in, it's a shortcut.

## Get started

```bash
jarvis model          # Pick Nous Portal as your provider
```

When you select Nous Portal, Jarvis offers to turn on the Tool Gateway. Accept, and you're done — every supported tool is live on the next run.

Check what's active at any time:

```bash
jarvis status
```

You'll see a section like:

```
◆ Nous Tool Gateway
  Nous Portal     ✓ managed tools available
  Web tools       ✓ active via Nous subscription
  Image gen       ✓ active via Nous subscription
  TTS             ✓ active via Nous subscription
  Browser         ○ active via Browser Use key
```

Tools marked "active via Nous subscription" are going through the gateway. Anything else is using your own keys.

## Eligibility

The Tool Gateway is a **paid-subscription** feature. Free-tier Nous accounts can use Portal for inference but don't include managed tools — [upgrade your plan](https://portal.jarvis.local/manage-subscription) to unlock the gateway.

## Mix and match

The gateway is per-tool. Turn it on for just what you want:

- **All tools through Nous** — easiest; one subscription, done.
- **Gateway for web + images, bring your own TTS** — keep your ElevenLabs voice, let Nous handle the rest.
- **Gateway only for things you don't have keys for** — "I already pay for Browserbase, but I don't want a Firecrawl account" works fine.

Switch any tool at any time via:

```bash
jarvis tools          # Interactive picker for each tool category
```

Select the tool, pick **Nous Subscription** as the provider (or any direct provider you prefer). No config editing required.

## Using individual image models

Image generation defaults to FLUX 2 Klein 9B for speed. Override per-call by passing the model ID to the `image_generate` tool:

| Model | ID | Best for |
|---|---|---|
| FLUX 2 Klein 9B | `fal-ai/flux-2/klein/9b` | Fast, good default |
| FLUX 2 Pro | `fal-ai/flux-2/pro` | Higher fidelity FLUX |
| Z-Image Turbo | `fal-ai/z-image/turbo` | Stylized, fast |
| Nano Banana Pro | `fal-ai/gemini-3-pro-image` | Google Gemini 3 Pro Image |
| GPT Image 1.5 | `fal-ai/gpt-image-1/5` | OpenAI image gen, text+image |
| GPT Image 2 | `fal-ai/gpt-image-2` | OpenAI latest |
| Ideogram V3 | `fal-ai/ideogram/v3` | Strong prompt adherence + typography |
| Recraft V4 Pro | `fal-ai/recraft/v4/pro` | Vector-style, graphic design |
| Qwen Image | `fal-ai/qwen-image` | Alibaba multimodal |

The set evolves — `jarvis tools` → Image Generation shows the current live list.

---

## Configuration reference

Most users never need to touch this — `jarvis model` and `jarvis tools` cover every workflow interactively. This section is for writing config.yaml directly or scripting setups.

### Per-tool `use_gateway` flag

Each tool's config block takes a `use_gateway` boolean:

```yaml
web:
  backend: firecrawl
  use_gateway: true

image_gen:
  use_gateway: true

tts:
  provider: openai
  use_gateway: true

browser:
  cloud_provider: browser-use
  use_gateway: true
```

Precedence: `use_gateway: true` routes through Nous regardless of any direct keys in `.env`. `use_gateway: false` (or absent) uses direct keys if available and only falls back to the gateway when none exist.

### Disabling the gateway

```yaml
web:
  use_gateway: false   # Jarvis now uses FIRECRAWL_API_KEY from .env
```

`jarvis tools` automatically clears the flag when you pick a non-gateway provider, so this usually happens for you.

### Self-hosted gateway (advanced)

Running your own Nous-compatible gateway? Override endpoints in `~/.jarvis/.env`:

```bash
TOOL_GATEWAY_DOMAIN=your-domain.example.com
TOOL_GATEWAY_SCHEME=https
TOOL_GATEWAY_USER_TOKEN=your-token        # normally auto-populated from Portal login
FIRECRAWL_GATEWAY_URL=https://...         # override one endpoint specifically
```

These knobs exist for custom infrastructure setups (enterprise deployments, dev environments). Regular subscribers never set them.

## FAQ

### Does it work with Telegram / Discord / the other messaging gateways?

Yes. Tool Gateway operates at the tool-execution layer, not the CLI. Every interface that can call a tool — CLI, Telegram, Discord, Slack, IRC, Teams, the API server, anything — benefits from it transparently.

### What happens if my subscription expires?

Tools routed through the gateway stop working until you renew or swap in direct API keys via `jarvis tools`. Jarvis shows a clear error pointing at the portal.

### Can I see usage or costs per tool?

Yes — the [Nous Portal dashboard](https://portal.jarvis.local) breaks usage down by tool so you can see what's driving your bill.

### Is Modal (serverless terminal) included?

Modal is available as an **optional add-on** through the Nous subscription, not part of the default Tool Gateway bundle. Configure it via `jarvis setup terminal` or directly in `config.yaml` when you want a remote sandbox for shell execution.

### Do I need to delete my existing API keys when I enable the gateway?

No — keep them in `.env`. When `use_gateway: true`, Jarvis skips direct keys and uses the gateway. Flip the flag back to `false` and your keys become the source again. The gateway isn't a lock-in.

## Source: `reference/tools-reference.md`

---
sidebar_position: 3
title: "Built-in Tools Reference"
description: "Authoritative reference for Jarvis built-in tools, grouped by toolset"
---

# Built-in Tools Reference

This page documents Jarvis' built-in tools, grouped by toolset. Availability varies by platform, credentials, and enabled toolsets.

**Quick counts (current registry):** ~70 tools — 10 browser tools (core) + 2 CDP-gated browser tools, 4 file tools, 10 RL tools, 4 Home Assistant tools, 2 terminal tools, 2 web tools, 5 Feishu tools, 7 Spotify tools (registered by the bundled `spotify` plugin), 5 Yuanbao tools, 7 kanban tools (registered when the kanban dispatcher spawns the agent), 2 Discord tools, and a handful of standalone tools (`memory`, `clarify`, `delegate_task`, `execute_code`, `cronjob`, `session_search`, `skill_view`/`skill_manage`/`skills_list`, `text_to_speech`, `image_generate`, `video_generate`, `vision_analyze`, `video_analyze`, `mixture_of_agents`, `send_message`, `todo`, `computer_use`, `process`).

:::tip MCP Tools
In addition to built-in tools, Jarvis can load tools dynamically from MCP servers. MCP tools appear with the prefix `mcp_<server>_` (e.g., `mcp_github_create_issue` for the `github` MCP server). See [MCP Integration](/docs/user-guide/features/mcp) for configuration.
:::

## `browser` toolset

| Tool | Description | Requires environment |
|------|-------------|----------------------|
| `browser_back` | Navigate back to the previous page in browser history. Requires browser_navigate to be called first. | — |
| `browser_click` | Click on an element identified by its ref ID from the snapshot (e.g., '@e5'). The ref IDs are shown in square brackets in the snapshot output. Requires browser_navigate and browser_snapshot to be called first. | — |
| `browser_console` | Get browser console output and JavaScript errors from the current page. Returns console.log/warn/error/info messages and uncaught JS exceptions. Use this to detect silent JavaScript errors, failed API calls, and application warnings. Requi… | — |
| `browser_get_images` | Get a list of all images on the current page with their URLs and alt text. Useful for finding images to analyze with the vision tool. Requires browser_navigate to be called first. | — |
| `browser_navigate` | Navigate to a URL in the browser. Initializes the session and loads the page. Must be called before other browser tools. For simple information retrieval, prefer web_search or web_extract (faster, cheaper). Use browser tools when you need… | — |
| `browser_press` | Press a keyboard key. Useful for submitting forms (Enter), navigating (Tab), or keyboard shortcuts. Requires browser_navigate to be called first. | — |
| `browser_scroll` | Scroll the page in a direction. Use this to reveal more content that may be below or above the current viewport. Requires browser_navigate to be called first. | — |
| `browser_snapshot` | Get a text-based snapshot of the current page's accessibility tree. Returns interactive elements with ref IDs (like @e1, @e2) for browser_click and browser_type. full=false (default): compact view with interactive elements. full=true: comp… | — |
| `browser_type` | Type text into an input field identified by its ref ID. Clears the field first, then types the new text. Requires browser_navigate and browser_snapshot to be called first. | — |
| `browser_vision` | Take a screenshot of the current page and analyze it with vision AI. Use this when you need to visually understand what's on the page - especially useful for CAPTCHAs, visual verification challenges, complex layouts, or when the text snaps… | — |

## `browser` toolset (CDP-gated tools)

These two tools live in the `browser` toolset but only register when a Chrome DevTools Protocol endpoint is reachable at session start — via `/browser connect`, `browser.cdp_url` config, a Browserbase session, or Camofox.

| Tool | Description | Requires environment |
|------|-------------|----------------------|
| `browser_cdp` | Send a raw Chrome DevTools Protocol command. Escape hatch for browser operations not covered by the higher-level `browser_*` tools. See https://chromedevtools.github.io/devtools-protocol/ | CDP endpoint |
| `browser_dialog` | Respond to a native JavaScript dialog (alert / confirm / prompt / beforeunload). Call `browser_snapshot` first — pending dialogs appear in its `pending_dialogs` field. Then call `browser_dialog(action='accept'\|'dismiss')`. | CDP endpoint |

## `clarify` toolset

| Tool | Description | Requires environment |
|------|-------------|----------------------|
| `clarify` | Ask the user a question when you need clarification, feedback, or a decision before proceeding. Supports two modes: 1. **Multiple choice** — provide up to 4 choices. The user picks one or types their own answer via a 5th 'Other' option. 2.… | — |

## `code_execution` toolset

| Tool | Description | Requires environment |
|------|-------------|----------------------|
| `execute_code` | Run a Python script that can call Jarvis tools programmatically. Use this when you need 3+ tool calls with processing logic between them, need to filter/reduce large tool outputs before they enter your context, need conditional branching (… | — |

## `cronjob` toolset

| Tool | Description | Requires environment |
|------|-------------|----------------------|
| `cronjob` | Unified scheduled-task manager. Use `action="create"`, `"list"`, `"update"`, `"pause"`, `"resume"`, `"run"`, or `"remove"` to manage jobs. Supports skill-backed jobs with one or more attached skills, and `skills=[]` on update clears attached skills. Cron runs happen in fresh sessions with no current-chat context. | — |

## `delegation` toolset

| Tool | Description | Requires environment |
|------|-------------|----------------------|
| `delegate_task` | Spawn one or more subagents to work on tasks in isolated contexts. Each subagent gets its own conversation, terminal session, and toolset. Only the final summary is returned -- intermediate tool results never enter your context window. TWO… | — |

## `feishu_doc` toolset

Scoped to the Feishu document-comment intelligent-reply handler (`gateway/platforms/feishu_comment.py`). Not exposed on `jarvis-cli` or the regular Feishu chat adapter.

| Tool | Description | Requires environment |
|------|-------------|----------------------|
| `feishu_doc_read` | Read the full text content of a Feishu/Lark document (Docx, Doc, or Sheet) given its file_type and token. | Feishu app credentials |

## `feishu_drive` toolset

Scoped to the Feishu document-comment handler. Drives comment read/write operations on drive files.

| Tool | Description | Requires environment |
|------|-------------|----------------------|
| `feishu_drive_add_comment` | Add a top-level comment on a Feishu/Lark document or file. | Feishu app credentials |
| `feishu_drive_list_comments` | List whole-document comments on a Feishu/Lark file, most recent first. | Feishu app credentials |
| `feishu_drive_list_comment_replies` | List replies on a specific Feishu comment thread (whole-doc or local-selection). | Feishu app credentials |
| `feishu_drive_reply_comment` | Post a reply on a Feishu comment thread, with optional `@`-mention. | Feishu app credentials |

## `file` toolset

| Tool | Description | Requires environment |
|------|-------------|----------------------|
| `patch` | Targeted find-and-replace edits in files. Use this instead of sed/awk in terminal. Uses fuzzy matching (9 strategies) so minor whitespace/indentation differences won't break it. Returns a unified diff. Auto-runs syntax checks after editing… | — |
| `read_file` | Read a text file with line numbers and pagination. Use this instead of cat/head/tail in terminal. Output format: 'LINE_NUM\|CONTENT'. Suggests similar filenames if not found. Use offset and limit for large files. NOTE: Cannot read images o… | — |
| `search_files` | Search file contents or find files by name. Use this instead of grep/rg/find/ls in terminal. Ripgrep-backed, faster than shell equivalents. Content search (target='content'): Regex search inside files. Output modes: full matches with line… | — |
| `write_file` | Write content to a file, completely replacing existing content. Use this instead of echo/cat heredoc in terminal. Creates parent directories automatically. OVERWRITES the entire file — use 'patch' for targeted edits. | — |

## `homeassistant` toolset

| Tool | Description | Requires environment |
|------|-------------|----------------------|
| `ha_call_service` | Call a Home Assistant service to control a device. Use ha_list_services to discover available services and their parameters for each domain. | — |
| `ha_get_state` | Get the detailed state of a single Home Assistant entity, including all attributes (brightness, color, temperature setpoint, sensor readings, etc.). | — |
| `ha_list_entities` | List Home Assistant entities. Optionally filter by domain (light, switch, climate, sensor, binary_sensor, cover, fan, etc.) or by area name (living room, kitchen, bedroom, etc.). | — |
| `ha_list_services` | List available Home Assistant services (actions) for device control. Shows what actions can be performed on each device type and what parameters they accept. Use this to discover how to control devices found via ha_list_entities. | — |

## `computer_use` toolset

| Tool | Description | Requires environment |
|------|-------------|----------------------|
| `computer_use` | Background macOS desktop control via cua-driver — screenshots (SOM / vision / AX), click / drag / scroll / type / key / wait, list_apps, focus_app. Does NOT steal the user's cursor or keyboard focus. Works with any tool-capable model. macOS only. | `cua-driver` on `$PATH` (install via `jarvis tools`). |


:::note
**Honcho tools** (`honcho_profile`, `honcho_search`, `honcho_context`, `honcho_reasoning`, `honcho_conclude`) are no longer built-in. They are available via the Honcho memory provider plugin at `plugins/memory/honcho/`. See [Memory Providers](../user-guide/features/memory-providers.md) for installation and usage.
:::

## `image_gen` toolset

| Tool | Description | Requires environment |
|------|-------------|----------------------|
| `image_generate` | Generate high-quality images from text prompts using FAL.ai. The underlying model is user-configured (default: FLUX 2 Klein 9B, sub-1s generation) and is not selectable by the agent. Returns a single image URL. Display it using… | FAL_KEY |

## `kanban` toolset

Registered when the agent is either (a) spawned by the kanban dispatcher (`JARVIS_KANBAN_TASK` env set) or (b) running in a profile that explicitly enables the `kanban` toolset. Task-scoped workers use lifecycle tools for their assigned task; orchestrator profiles additionally get board-routing tools like `kanban_list` and `kanban_unblock`. See [Kanban Multi-Agent](/docs/user-guide/features/kanban) for the full workflow.

| Tool | Description | Requires environment |
|------|-------------|----------------------|
| `kanban_show` | Show the active kanban task assigned to this worker (title, description, comments, dependencies). | `JARVIS_KANBAN_TASK` or `kanban` toolset |
| `kanban_list` | List board tasks with filters. Orchestrator-only; hidden from dispatcher-spawned task workers. | profile with `kanban` toolset |
| `kanban_complete` | Mark the current task done with a structured handoff payload (results, artifacts, follow-ups). | `JARVIS_KANBAN_TASK` or `kanban` toolset |
| `kanban_block` | Block the current task on a question for the user — the dispatcher pauses, surfaces the question, and resumes once a human replies. | `JARVIS_KANBAN_TASK` or `kanban` toolset |
| `kanban_heartbeat` | Send a progress heartbeat during a long-running operation so the dispatcher knows the worker is still alive. | `JARVIS_KANBAN_TASK` or `kanban` toolset |
| `kanban_comment` | Add a comment to the task thread without changing its state — useful for surfacing intermediate findings. | `JARVIS_KANBAN_TASK` or `kanban` toolset |
| `kanban_create` | Fan out child tasks from the current task. Used by orchestrators and follow-up-spawning workers. | `JARVIS_KANBAN_TASK` or `kanban` toolset |
| `kanban_link` | Link tasks with a parent → child dependency edge. | `JARVIS_KANBAN_TASK` or `kanban` toolset |
| `kanban_unblock` | Return a blocked task to `ready`. Orchestrator-only; hidden from dispatcher-spawned task workers. | profile with `kanban` toolset |

## `memory` toolset

| Tool | Description | Requires environment |
|------|-------------|----------------------|
| `memory` | Save important information to persistent memory that survives across sessions. Your memory appears in your system prompt at session start -- it's how you remember things about the user and your environment between conversations. WHEN TO SA… | — |

## `messaging` toolset

| Tool | Description | Requires environment |
|------|-------------|----------------------|
| `send_message` | Send a message to a connected messaging platform, or list available targets. IMPORTANT: When the user asks to send to a specific channel or person (not just a bare platform name), call send_message(action='list') FIRST to see available tar… | — |

## `moa` toolset

| Tool | Description | Requires environment |
|------|-------------|----------------------|
| `mixture_of_agents` | Route a hard problem through multiple frontier LLMs collaboratively. Makes 5 API calls (4 reference models + 1 aggregator) with maximum reasoning effort — use sparingly for genuinely difficult problems. Best for: complex math, advanced alg… | OPENROUTER_API_KEY |

## `session_search` toolset

| Tool | Description | Requires environment |
|------|-------------|----------------------|
| `session_search` | Search past sessions stored in the local session DB, or scroll inside one. FTS5-backed retrieval; returns actual messages from the DB (no LLM calls). Three shapes: discovery (pass `query`), scroll (pass `session_id` + `around_message_id`), browse (no args). | — |

## `skills` toolset

| Tool | Description | Requires environment |
|------|-------------|----------------------|
| `skill_manage` | Manage skills (create, update, delete). Skills are your procedural memory — reusable approaches for recurring task types. New skills go to ~/.jarvis/skills/; existing skills can be modified wherever they live. Actions: create (full SKILL.m… | — |
| `skill_view` | Skills allow for loading information about specific tasks and workflows, as well as scripts and templates. Load a skill's full content or access its linked files (references, templates, scripts). First call returns SKILL.md content plus a… | — |
| `skills_list` | List available skills (name + description). Use skill_view(name) to load full content. | — |

## `terminal` toolset

| Tool | Description | Requires environment |
|------|-------------|----------------------|
| `process` | Manage background processes started with terminal(background=true). Actions: 'list' (show all), 'poll' (check status + new output), 'log' (full output with pagination), 'wait' (block until done or timeout), 'kill' (terminate), 'write' (sen… | — |
| `terminal` | Execute shell commands on a Linux environment. Filesystem persists between calls. Set `background=true` for long-running servers. Set `notify_on_complete=true` (with `background=true`) to get an automatic notification when the process finishes — no polling needed. Do NOT use cat/head/tail — use read_file. Do NOT use grep/rg/find — use search_files. | — |

## `todo` toolset

| Tool | Description | Requires environment |
|------|-------------|----------------------|
| `todo` | Manage your task list for the current session. Use for complex tasks with 3+ steps or when the user provides multiple tasks. Call with no parameters to read the current list. Writing: - Provide 'todos' array to create/update items - merge=… | — |

## `vision` toolset

| Tool | Description | Requires environment |
|------|-------------|----------------------|
| `vision_analyze` | Analyze images using AI vision. On vision-capable main models, returns the raw image pixels as a multimodal tool result so the model sees them natively on its next turn. On text-only main models, falls back to an auxiliary vision model that describes the image and returns the description as text. Tool signature is identical either way. | — |

## `video` toolset

Opt-in toolset (not loaded in the default `jarvis-cli` set). Add via `--toolsets video` or include `video` in your `toolsets:` config.

| Tool | Description | Requires environment |
|------|-------------|----------------------|
| `video_analyze` | Analyze video content from a URL or file path — captions, scene breakdowns, key timestamps, and visual descriptions. | — |

## `video_gen` toolset

Opt-in toolset (not loaded in the default `jarvis-cli` set). Add via `--toolsets video_gen` or enable it in `jarvis tools` → Video Generation, which also walks you through picking a backend.

Backends ship as plugins under `plugins/video_gen/<name>/`:

- **xAI Grok-Imagine** — text-to-video and image-to-video (SuperGrok OAuth or `XAI_API_KEY`).
- **FAL.ai** — Veo 3.1, Pixverse v6, Kling O3 (requires `FAL_KEY`).

The single `video_generate` tool covers both modalities — pass `image_url` to animate a still, omit it to generate from text alone. The active backend auto-routes to the right endpoint. The tool's description is rebuilt at session start to reflect the active backend's actual capabilities (modalities, aspect ratios, resolutions, duration range, max reference images, audio support). See [Video Generation Provider Plugins](/docs/developer-guide/video-gen-provider-plugin) for backend authoring.

| Tool | Description | Requires environment |
|------|-------------|----------------------|
| `video_generate` | Generate a video from a text prompt (text-to-video) or animate a still image (image-to-video) using the user's configured video generation backend. Pass `image_url` to animate that image; omit it to generate from text alone. The backend auto-routes to the right endpoint. Returns either an HTTP URL or an absolute file path in the `video` field. | Active `video_gen` plugin + its credential (e.g. `XAI_API_KEY`, `FAL_KEY`) |

## `web` toolset

| Tool | Description | Requires environment |
|------|-------------|----------------------|
| `web_search` | Search the web for information. Returns up to 5 results by default with titles, URLs, and descriptions. Accepts an optional `limit` (1-100, default 5). The query is passed through to the configured backend, so operators such as `site:domain`, `filetype:pdf`, `intitle:word`, `-term`, and `"exact phrase"` may work when the backend supports them. | EXA_API_KEY or PARALLEL_API_KEY or FIRECRAWL_API_KEY or TAVILY_API_KEY |
| `web_extract` | Extract content from web page URLs. Returns page content in markdown format. Also works with PDF URLs — pass the PDF link directly and it converts to markdown text. Pages under 5000 chars return full markdown; larger pages are LLM-summarized. | EXA_API_KEY or PARALLEL_API_KEY or FIRECRAWL_API_KEY or TAVILY_API_KEY |

## `x_search` toolset

| Tool | Description | Requires environment |
|------|-------------|----------------------|
| `x_search` | Search X (Twitter) posts, profiles, and threads using xAI's built-in `x_search` Responses tool. Use this for current discussion, reactions, or claims on X rather than general web pages. Off by default — opt in via `jarvis tools` → 🐦 X (Twitter) Search. Schema is only registered when xAI credentials are configured (check_fn-gated). | XAI_API_KEY **or** xAI Grok OAuth (SuperGrok Subscription) login |

## `tts` toolset

| Tool | Description | Requires environment |
|------|-------------|----------------------|
| `text_to_speech` | Convert text to speech audio. Returns a MEDIA: path that the platform delivers as a voice message. On Telegram it plays as a voice bubble, on Discord/WhatsApp as an audio attachment. In CLI mode, saves to ~/voice-memos/. Voice and provider… | — |

## `discord` toolset

Registered on the `jarvis-discord` platform toolset (gateway only). Uses the same bot token as the messaging adapter.

| Tool | Description | Requires environment |
|------|-------------|----------------------|
| `discord` | Read and participate in a Discord server. Actions include `search_members`, `fetch_messages`, `send_message`, `react`, `fetch_channel`, `list_channels`, and more. | `DISCORD_BOT_TOKEN` |

## `discord_admin` toolset

Registered on the `jarvis-discord` platform toolset. Moderation actions require the bot to hold the matching Discord permissions.

| Tool | Description | Requires environment |
|------|-------------|----------------------|
| `discord_admin` | Manage a Discord server via the REST API: list guilds/channels/roles, create/edit/delete channels, manage role grants, timeouts, kicks, and bans. | `DISCORD_BOT_TOKEN` + bot permissions |

## `spotify` toolset

Registered by the bundled `spotify` plugin. Requires an OAuth token — run `jarvis spotify setup` once to authorize.

| Tool | Description | Requires environment |
|------|-------------|----------------------|
| `spotify_playback` | Control Spotify playback, inspect the active playback state, or fetch recently played tracks. | Spotify OAuth |
| `spotify_devices` | List Spotify Connect devices or transfer playback to a different device. | Spotify OAuth |
| `spotify_queue` | Inspect the user's Spotify queue or add an item to it. | Spotify OAuth |
| `spotify_search` | Search the Spotify catalog for tracks, albums, artists, playlists, shows, or episodes. | Spotify OAuth |
| `spotify_playlists` | List, inspect, create, update, and modify Spotify playlists. | Spotify OAuth |
| `spotify_albums` | Fetch Spotify album metadata or album tracks. | Spotify OAuth |
| `spotify_library` | List, save, or remove the user's saved Spotify tracks or albums. | Spotify OAuth |

## `jarvis-yuanbao` toolset

Registered only on the `jarvis-yuanbao` platform toolset. Yuanbao is Tencent's chat app; these tools drive its DM/group/sticker APIs.

| Tool | Description | Requires environment |
|------|-------------|----------------------|
| `yb_query_group_info` | Query basic info about a group (called "派/Pai" in the app): name, owner, member count. | Yuanbao credentials |
| `yb_query_group_members` | Query members of a group (for `@`-mentions, finding a user by name, listing bots). | Yuanbao credentials |
| `yb_send_dm` | Send a private/direct message to a user in a group, with optional media files. | Yuanbao credentials |
| `yb_search_sticker` | Search the built-in Yuanbao sticker (TIM face) catalogue by keyword. | Yuanbao credentials |
| `yb_send_sticker` | Send a built-in sticker to the current Yuanbao chat. | Yuanbao credentials |

## Source: `reference/toolsets-reference.md`

---
sidebar_position: 4
title: "Toolsets Reference"
description: "Reference for Jarvis core, composite, platform, and dynamic toolsets"
---

# Toolsets Reference

Toolsets are named bundles of tools that control what the agent can do. They're the primary mechanism for configuring tool availability per platform, per session, or per task.

## How Toolsets Work

Every tool belongs to exactly one toolset. When you enable a toolset, all tools in that bundle become available to the agent. Toolsets come in three kinds:

- **Core** — A single logical group of related tools (e.g., `file` bundles `read_file`, `write_file`, `patch`, `search_files`)
- **Composite** — Combines multiple core toolsets for a common scenario (e.g., `debugging` bundles file, terminal, and web tools)
- **Platform** — A complete tool configuration for a specific deployment context (e.g., `jarvis-cli` is the default for interactive CLI sessions)

## Configuring Toolsets

### Per-session (CLI)

```bash
jarvis chat --toolsets web,file,terminal
jarvis chat --toolsets debugging        # composite — expands to file + terminal + web
jarvis chat --toolsets all              # everything
```

### Per-platform (config.yaml)

```yaml
toolsets:
  - jarvis-cli          # default for CLI
  # - jarvis-telegram   # override for Telegram gateway
```

### Interactive management

```bash
jarvis tools                            # curses UI to enable/disable per platform
```

Or in-session:

```
/tools list
/tools disable browser
/tools enable homeassistant
```

## Core Toolsets

| Toolset | Tools | Purpose |
|---------|-------|---------|
| `browser` | `browser_back`, `browser_cdp`, `browser_click`, `browser_console`, `browser_dialog`, `browser_get_images`, `browser_navigate`, `browser_press`, `browser_scroll`, `browser_snapshot`, `browser_type`, `browser_vision`, `web_search` | Core browser automation. Includes `web_search` as a fallback for quick lookups. `browser_cdp` and `browser_dialog` are gated at runtime — registered only when a CDP endpoint is reachable at session start (via `/browser connect`, `browser.cdp_url` config, Browserbase, or Camofox). `browser_dialog` works together with the `pending_dialogs` and `frame_tree` fields that `browser_snapshot` adds when a CDP supervisor is attached. |
| `clarify` | `clarify` | Ask the user a question when the agent needs clarification. |
| `code_execution` | `execute_code` | Run Python scripts that call Jarvis tools programmatically. |
| `cronjob` | `cronjob` | Schedule and manage recurring tasks. |
| `debugging` | composite (`file` + `terminal` + `web`) | Debug bundle — file, process/terminal, web extract/search. |
| `delegation` | `delegate_task` | Spawn isolated subagent instances for parallel work. |
| `discord` | `discord` | Core Discord text/embed/DM actions (gateway-only). Active on the `jarvis-discord` toolset. |
| `discord_admin` | `discord_admin` | Discord moderation (bans, role changes, channel management). Active on the `jarvis-discord` toolset; requires the bot to hold the relevant Discord permissions. |
| `feishu_doc` | `feishu_doc_read` | Read Feishu/Lark document content. Used by the Feishu document-comment intelligent-reply handler. |
| `feishu_drive` | `feishu_drive_add_comment`, `feishu_drive_list_comments`, `feishu_drive_list_comment_replies`, `feishu_drive_reply_comment` | Feishu/Lark drive comment operations. Scoped to the comment agent; not exposed on `jarvis-cli` or other messaging toolsets. |
| `file` | `patch`, `read_file`, `search_files`, `write_file` | File reading, writing, searching, and editing. |
| `homeassistant` | `ha_call_service`, `ha_get_state`, `ha_list_entities`, `ha_list_services` | Smart home control via Home Assistant. Only available when `HASS_TOKEN` is set. |
| `computer_use` | `computer_use` | Background macOS desktop control via cua-driver — does not steal cursor/focus. Works with any tool-capable model. macOS only; requires `cua-driver` on `$PATH`. |
| `image_gen` | `image_generate` | Text-to-image generation via FAL.ai (with opt-in OpenAI / xAI backends). |
| `video_gen` | `video_generate` | Text-to-video and image-to-video via plugin-registered backends (xAI Grok-Imagine, FAL.ai Veo 3.1 / Pixverse v6 / Kling O3). Pass `image_url` to animate an image; omit it for text-to-video. |
| `kanban` | `kanban_block`, `kanban_comment`, `kanban_complete`, `kanban_create`, `kanban_heartbeat`, `kanban_link`, `kanban_list`, `kanban_show`, `kanban_unblock` | Multi-agent coordination tools. Registered for dispatcher-spawned task workers (`JARVIS_KANBAN_TASK`) and for profiles that explicitly enable the `kanban` toolset. Workers mark tasks done, block, heartbeat, comment, and create/link follow-up tasks; orchestrator profiles additionally get board-routing tools like list/unblock. |
| `memory` | `memory` | Persistent cross-session memory management. |
| `messaging` | `send_message` | Send messages to other platforms (Telegram, Discord, etc.) from within a session. |
| `moa` | `mixture_of_agents` | Multi-model consensus via Mixture of Agents. |
| `safe` | `image_generate`, `vision_analyze`, `web_extract`, `web_search` (via `includes`) | Read-only research + media generation. No file writes, no terminal, no code execution. |
| `search` | `web_search` | Web search only (without extract). |
| `session_search` | `session_search` | Search past conversation sessions. |
| `skills` | `skill_manage`, `skill_view`, `skills_list` | Skill CRUD and browsing. |
| `spotify` | `spotify_albums`, `spotify_devices`, `spotify_library`, `spotify_playback`, `spotify_playlists`, `spotify_queue`, `spotify_search` | Native Spotify control (playback, queue, search, playlists, albums, library). Registered by the bundled `spotify` plugin. |
| `terminal` | `process`, `terminal` | Shell command execution and background process management. |
| `todo` | `todo` | Task list management within a session. |
| `tts` | `text_to_speech` | Text-to-speech audio generation. |
| `vision` | `vision_analyze` | Image analysis via vision-capable models. |
| `video` | `video_analyze` | Video analysis and understanding tools (opt-in, not in the default toolset — add explicitly via `--toolsets`). |
| `web` | `web_extract`, `web_search` | Web search and page content extraction. |
| `x_search` | `x_search` | Search X (Twitter) posts and threads via xAI's built-in `x_search` Responses tool. Off by default; opt in via `jarvis tools`. Schema only registered when xAI credentials (SuperGrok OAuth or `XAI_API_KEY`) are configured. |
| `yuanbao` | `yb_query_group_info`, `yb_query_group_members`, `yb_search_sticker`, `yb_send_dm`, `yb_send_sticker` | Yuanbao DM/group actions and sticker search. Registered only on `jarvis-yuanbao`. |

## Platform Toolsets

Platform toolsets define the complete tool configuration for a deployment target. Most messaging platforms use the same set as `jarvis-cli`:

| Toolset | Differences from `jarvis-cli` |
|---------|-------------------------------|
| `jarvis-cli` | Full toolset — the default for interactive CLI sessions. Includes file, terminal, web, browser, memory, skills, vision, image_gen, todo, tts, delegation, code_execution, cronjob, session_search, clarify, and `safe` (read-only) bundles plus the standard messaging tools. |
| `jarvis-acp` | Drops `clarify`, `cronjob`, `image_generate`, `send_message`, `text_to_speech`, and all four Home Assistant tools. Focused on coding tasks in IDE context. |
| `jarvis-api-server` | Drops `clarify`, `send_message`, and `text_to_speech`. Keeps everything else — suitable for programmatic access where user interaction isn't possible. |
| `jarvis-cron` | Same as `jarvis-cli`. |
| `jarvis-telegram` | Same as `jarvis-cli`. |
| `jarvis-discord` | Adds `discord` and `discord_admin` on top of `jarvis-cli`. |
| `jarvis-slack` | Same as `jarvis-cli`. |
| `jarvis-whatsapp` | Same as `jarvis-cli`. |
| `jarvis-signal` | Same as `jarvis-cli`. |
| `jarvis-matrix` | Same as `jarvis-cli`. |
| `jarvis-mattermost` | Same as `jarvis-cli`. |
| `jarvis-email` | Same as `jarvis-cli`. |
| `jarvis-sms` | Same as `jarvis-cli`. |
| `jarvis-bluebubbles` | Same as `jarvis-cli`. |
| `jarvis-dingtalk` | Same as `jarvis-cli`. |
| `jarvis-feishu` | Adds the five `feishu_doc_*` / `feishu_drive_*` tools (only used by the document-comment handler, not the regular chat adapter). |
| `jarvis-qqbot` | Same as `jarvis-cli`. |
| `jarvis-wecom` | Same as `jarvis-cli`. |
| `jarvis-wecom-callback` | Same as `jarvis-cli`. |
| `jarvis-weixin` | Same as `jarvis-cli`. |
| `jarvis-yuanbao` | Adds the five `yb_*` tools (DM/group/sticker) on top of `jarvis-cli`. |
| `jarvis-homeassistant` | Same as `jarvis-cli` (the Home Assistant tools are already present by default and activate when `HASS_TOKEN` is set). |
| `jarvis-webhook` | Same as `jarvis-cli`. |
| `jarvis-gateway` | Internal gateway orchestrator toolset — union of every `jarvis-<platform>` toolset; used when the gateway needs to accept any message source. |

## Dynamic Toolsets

### MCP server toolsets

Each configured MCP server generates a `mcp-<server>` toolset at runtime. For example, if you configure a `github` MCP server, a `mcp-github` toolset is created containing all tools that server exposes.

```yaml
# config.yaml
mcp_servers:
  github:
    command: npx
    args: ["-y", "@modelcontextprotocol/server-github"]
```

This creates a `mcp-github` toolset you can reference in `--toolsets` or platform configs.

### Plugin toolsets

Plugins can register their own toolsets via `ctx.register_tool()` during plugin initialization. These appear alongside built-in toolsets and can be enabled/disabled the same way.

### Custom toolsets

Define custom toolsets in `config.yaml` to create project-specific bundles:

```yaml
toolsets:
  - jarvis-cli
custom_toolsets:
  data-science:
    - file
    - terminal
    - code_execution
    - web
    - vision
```

### Wildcards

- `all` or `*` — expands to every registered toolset (built-in + dynamic + plugin)

## Relationship to `jarvis tools`

The `jarvis tools` command provides a curses-based UI for toggling individual tools on or off per platform. This operates at the tool level (finer than toolsets) and persists to `config.yaml`. Disabled tools are filtered out even if their toolset is enabled.

See also: [Tools Reference](./tools-reference.md) for the complete list of individual tools and their parameters.

## Source: `developer-guide/adding-tools.md`

---
sidebar_position: 2
title: "Adding Tools"
description: "How to add a new tool to JARVIS — schemas, handlers, registration, and toolsets"
---

# Adding Tools

Before writing a tool, ask yourself: **should this be a [skill](creating-skills.md) instead?**

:::warning Built-in Core Tools Only
This page is for adding a **built-in Jarvis tool** to the repository itself.
If you want a personal, project-local, or otherwise custom tool without
modifying Jarvis core, use the plugin route instead:

- [Plugins](/docs/user-guide/features/plugins)
- [Build a Jarvis Plugin](/docs/guides/build-a-jarvis-plugin)

Default to plugins for most custom tool creation. Only follow this page when
you explicitly want to ship a new built-in tool in `tools/` and `toolsets.py`.
:::

Make it a **Skill** when the capability can be expressed as instructions + shell commands + existing tools (arXiv search, git workflows, Docker management, PDF processing).

Make it a **Tool** when it requires end-to-end integration with API keys, custom processing logic, binary data handling, or streaming (browser automation, TTS, vision analysis).

## Overview

Adding a tool touches **2 files**:

1. **`tools/your_tool.py`** — handler, schema, check function, `registry.register()` call
2. **`toolsets.py`** — add tool name to `_JARVIS_CORE_TOOLS` (or a specific toolset)

Any `tools/*.py` file with a top-level `registry.register()` call is auto-discovered at startup — no manual import list required.

## Step 1: Create the Built-in Tool File

Every tool file follows the same structure:

```python
# tools/weather_tool.py
"""Weather Tool -- look up current weather for a location."""

import json
import os
import logging

logger = logging.getLogger(__name__)


# --- Availability check ---

def check_weather_requirements() -> bool:
    """Return True if the tool's dependencies are available."""
    return bool(os.getenv("WEATHER_API_KEY"))


# --- Handler ---

def weather_tool(location: str, units: str = "metric") -> str:
    """Fetch weather for a location. Returns JSON string."""
    api_key = os.getenv("WEATHER_API_KEY")
    if not api_key:
        return json.dumps({"error": "WEATHER_API_KEY not configured"})
    try:
        # ... call weather API ...
        return json.dumps({"location": location, "temp": 22, "units": units})
    except Exception as e:
        return json.dumps({"error": str(e)})


# --- Schema ---

WEATHER_SCHEMA = {
    "name": "weather",
    "description": "Get current weather for a location.",
    "parameters": {
        "type": "object",
        "properties": {
            "location": {
                "type": "string",
                "description": "City name or coordinates (e.g. 'London' or '51.5,-0.1')"
            },
            "units": {
                "type": "string",
                "enum": ["metric", "imperial"],
                "description": "Temperature units (default: metric)",
                "default": "metric"
            }
        },
        "required": ["location"]
    }
}


# --- Registration ---

from tools.registry import registry

registry.register(
    name="weather",
    toolset="weather",
    schema=WEATHER_SCHEMA,
    handler=lambda args, **kw: weather_tool(
        location=args.get("location", ""),
        units=args.get("units", "metric")),
    check_fn=check_weather_requirements,
    requires_env=["WEATHER_API_KEY"],
)
```

### Key Rules

:::danger Important
- Handlers **MUST** return a JSON string (via `json.dumps()`), never raw dicts
- Errors **MUST** be returned as `{"error": "message"}`, never raised as exceptions
- The `check_fn` is called when building tool definitions — if it returns `False`, the tool is silently excluded
- The `handler` receives `(args: dict, **kwargs)` where `args` is the LLM's tool call arguments
:::

## Step 2: Add the Built-in Tool to a Toolset

In `toolsets.py`, add the tool name:

```python
# If it should be available on all platforms (CLI + messaging):
_JARVIS_CORE_TOOLS = [
    ...
    "weather",  # <-- add here
]

# Or create a new standalone toolset:
"weather": {
    "description": "Weather lookup tools",
    "tools": ["weather"],
    "includes": []
},
```

## ~~Step 3: Add Discovery Import~~ (No longer needed)

Tool modules with a top-level `registry.register()` call are auto-discovered by `discover_builtin_tools()` in `tools/registry.py`. No manual import list to maintain — just create your file in `tools/` and it's picked up at startup.

## Async Handlers

If your handler needs async code, mark it with `is_async=True`:

```python
async def weather_tool_async(location: str) -> str:
    async with aiohttp.ClientSession() as session:
        ...
    return json.dumps(result)

registry.register(
    name="weather",
    toolset="weather",
    schema=WEATHER_SCHEMA,
    handler=lambda args, **kw: weather_tool_async(args.get("location", "")),
    check_fn=check_weather_requirements,
    is_async=True,  # registry calls _run_async() automatically
)
```

The registry handles async bridging transparently — you never call `asyncio.run()` yourself.

## Handlers That Need task_id

Tools that manage per-session state receive `task_id` via `**kwargs`:

```python
def _handle_weather(args, **kw):
    task_id = kw.get("task_id")
    return weather_tool(args.get("location", ""), task_id=task_id)

registry.register(
    name="weather",
    ...
    handler=_handle_weather,
)
```

## Agent-Loop Intercepted Tools

Some tools (`todo`, `memory`, `session_search`, `delegate_task`) need access to per-session agent state. These are intercepted by `run_agent.py` before reaching the registry. The registry still holds their schemas, but `dispatch()` returns a fallback error if the intercept is bypassed.

## Optional: Setup Wizard Integration

If your tool requires an API key, add it to `jarvis_cli/config.py`:

```python
OPTIONAL_ENV_VARS = {
    ...
    "WEATHER_API_KEY": {
        "description": "Weather API key for weather lookup",
        "prompt": "Weather API key",
        "url": "https://weatherapi.com/",
        "tools": ["weather"],
        "password": True,
    },
}
```

## Checklist

- [ ] Tool file created with handler, schema, check function, and registration
- [ ] Added to appropriate toolset in `toolsets.py`
- [ ] Confirmed this really should be a built-in/core tool and not a plugin
- [ ] Handler returns JSON strings, errors returned as `{"error": "..."}`
- [ ] Optional: API key added to `OPTIONAL_ENV_VARS` in `jarvis_cli/config.py`
- [ ] Optional: Added to `toolset_distributions.py` for batch processing
- [ ] Tested with `jarvis chat -q "Use the weather tool for London"`
