# Architecture

> Imported from the local source documentation and rewritten for the JARVIS desktop-first app. Run commands from the integrated Home terminal unless a section explicitly refers to packaging or automation.

## Source: `developer-guide/architecture.md`

---
sidebar_position: 1
title: "Architecture"
description: "JARVIS internals — major subsystems, execution paths, data flow, and where to read next"
---

# Architecture

This page is the top-level map of JARVIS internals. Use it to orient yourself in the codebase, then dive into subsystem-specific docs for implementation details.

## System Overview

```text
┌─────────────────────────────────────────────────────────────────────┐
│                        Entry Points                                  │
│                                                                      │
│  CLI (cli.py)    Gateway (gateway/run.py)    ACP (acp_adapter/)     │
│  Batch Runner    API Server                  Python Library          │
└──────────┬──────────────┬───────────────────────┬───────────────────┘
           │              │                       │
           ▼              ▼                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     AIAgent (run_agent.py)                          │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │ Prompt       │  │ Provider     │  │ Tool         │               │
│  │ Builder      │  │ Resolution   │  │ Dispatch     │               │
│  │ (prompt_     │  │ (runtime_    │  │ (model_      │               │
│  │  builder.py) │  │  provider.py)│  │  tools.py)   │               │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘               │
│         │                 │                 │                       │
│  ┌──────┴───────┐  ┌──────┴───────┐  ┌──────┴───────┐               │
│  │ Compression  │  │ 3 API Modes  │  │ Tool Registry│               │
│  │ & Caching    │  │ chat_compl.  │  │ (registry.py)│               │
│  │              │  │ codex_resp.  │  │ 70+ tools    │               │
│  │              │  │ anthropic    │  │ 28 toolsets  │               │
│  └──────────────┘  └──────────────┘  └──────────────┘               │
└─────────┴─────────────────┴─────────────────┴───────────────────────┘
           │                                    │
           ▼                                    ▼
┌───────────────────┐              ┌──────────────────────┐
│ Session Storage   │              │ Tool Backends         │
│ (SQLite + FTS5)   │              │ Terminal (7 backends) │
│ session_state.py   │              │ Browser (5 backends)  │
│ gateway/session.py│              │ Web (4 backends)      │
└───────────────────┘              │ MCP (dynamic)         │
                                   │ File, Vision, etc.    │
                                   └──────────────────────┘
```

## Directory Structure

```text
jarvis-agent/
├── run_agent.py              # AIAgent — core conversation loop (large file)
├── cli.py                    # JarvisDesktopRuntime — interactive terminal UI (large file)
├── tools/model_tools.py            # Tool discovery, schema collection, dispatch
├── tools/toolsets.py               # Tool groupings and platform presets
├── session_state.py           # SQLite session/state database with FTS5
├── jarvis_cli/constants.py       # JARVIS_HOME, profile-aware paths
├── tools/batch_runner.py           # Batch trajectory generation
│
├── agent/                    # Agent internals
│   ├── prompt_builder.py     # System prompt assembly
│   ├── context_engine.py     # ContextEngine ABC (pluggable)
│   ├── context_compressor.py # Default engine — lossy summarization
│   ├── prompt_caching.py     # Anthropic prompt caching
│   ├── auxiliary_client.py   # Auxiliary LLM for side tasks (vision, summarization)
│   ├── model_metadata.py     # Model context lengths, token estimation
│   ├── models_dev.py         # models.dev registry integration
│   ├── anthropic_adapter.py  # Anthropic Messages API format conversion
│   ├── display.py            # KawaiiSpinner, tool preview formatting
│   ├── skill_commands.py     # Skill slash commands
│   ├── memory_manager.py    # Memory manager orchestration
│   ├── memory_provider.py   # Memory provider ABC
│   └── trajectory.py         # Trajectory saving helpers
│
├── jarvis_cli/               # CLI subcommands and setup
│   ├── main.py               # Entry point — all `jarvis` subcommands (large file)
│   ├── config.py             # DEFAULT_CONFIG, OPTIONAL_ENV_VARS, migration
│   ├── commands.py           # COMMAND_REGISTRY — central slash command definitions
│   ├── auth.py               # PROVIDER_REGISTRY, credential resolution
│   ├── runtime_provider.py   # Provider → api_mode + credentials
│   ├── models.py             # Model catalog, provider model lists
│   ├── model_switch.py       # /model command logic (CLI + gateway shared)
│   ├── setup.py              # Interactive setup wizard (large file)
│   ├── skin_engine.py        # CLI theming engine
│   ├── skills_config.py      # jarvis skills — enable/disable per platform
│   ├── skills_hub.py         # /skills slash command
│   ├── tools_config.py       # jarvis tools — enable/disable per platform
│   ├── plugins.py            # PluginManager — discovery, loading, hooks
│   ├── callbacks.py          # Terminal callbacks (clarify, sudo, approval)
│   └── gateway.py            # jarvis gateway start/stop
│
├── tools/                    # Tool implementations (one file per tool)
│   ├── registry.py           # Central tool registry
│   ├── approval.py           # Dangerous command detection
│   ├── terminal_tool.py      # Terminal orchestration
│   ├── process_registry.py   # Background process management
│   ├── file_tools.py         # read_file, write_file, patch, search_files
│   ├── web_tools.py          # web_search, web_extract
│   ├── browser_tool.py       # 10 browser automation tools
│   ├── code_execution_tool.py # execute_code sandbox
│   ├── delegate_tool.py      # Subagent delegation
│   ├── mcp_tool.py           # MCP client (large file)
│   ├── credential_files.py   # File-based credential passthrough
│   ├── env_passthrough.py    # Env var passthrough for sandboxes
│   ├── ansi_strip.py         # ANSI escape stripping
│   └── environments/         # Terminal backends (local, docker, ssh, modal, daytona, singularity)
│
├── gateway/                  # Messaging platform gateway
│   ├── run.py                # GatewayRunner — message dispatch (large file)
│   ├── session.py            # SessionStore — conversation persistence
│   ├── delivery.py           # Outbound message delivery
│   ├── pairing.py            # DM pairing authorization
│   ├── hooks.py              # Hook discovery and lifecycle events
│   ├── mirror.py             # Cross-session message mirroring
│   ├── status.py             # Token locks, profile-scoped process tracking
│   ├── builtin_hooks/        # Extension point for always-registered hooks (none shipped)
│   └── platforms/            # 20 adapters: telegram, discord, slack, whatsapp,
│                             #   signal, matrix, mattermost, email, sms,
│                             #   dingtalk, feishu, wecom, wecom_callback, weixin,
│                             #   bluebubbles, qqbot, homeassistant, webhook, api_server,
│                             #   yuanbao
│
├── acp_adapter/              # ACP server (VS Code / Zed / JetBrains)
├── cron/                     # Scheduler (jobs.py, scheduler.py)
├── plugins/memory/           # Memory provider plugins
├── plugins/context_engine/   # Context engine plugins
├── capabilities/skills/      # Bundled skills (always available)
├── capabilities/optional-skills/  # Official optional skills (install explicitly)
└── tests/                    # Pytest suite (~3,000+ tests)
```

## Data Flow

### CLI Session

```text
User input → JarvisDesktopRuntime.process_input()
  → AIAgent.run_conversation()
    → prompt_builder.build_system_prompt()
    → runtime_provider.resolve_runtime_provider()
    → API call (chat_completions / codex_responses / anthropic_messages)
    → tool_calls? → model_tools.handle_function_call() → loop
    → final response → display → save to SessionDB
```

### Gateway Message

```text
Platform event → Adapter.on_message() → MessageEvent
  → GatewayRunner._handle_message()
    → authorize user
    → resolve session key
    → create AIAgent with session history
    → AIAgent.run_conversation()
    → deliver response back through adapter
```

### Cron Job

```text
Scheduler tick → load due jobs from jobs.json
  → create fresh AIAgent (no history)
  → inject attached skills as context
  → run job prompt
  → deliver response to target platform
  → update job state and next_run
```

## Recommended Reading Order

If you are new to the codebase:

1. **This page** — orient yourself
2. **[Agent Loop Internals](./agent-loop.md)** — how AIAgent works
3. **[Prompt Assembly](./prompt-assembly.md)** — system prompt construction
4. **[Provider Runtime Resolution](./provider-runtime.md)** — how providers are selected
5. **[Adding Providers](./adding-providers.md)** — practical guide to adding a new provider
6. **[Tools Runtime](./tools-runtime.md)** — tool registry, dispatch, environments
7. **[Session Storage](./session-storage.md)** — SQLite schema, FTS5, session lineage
8. **[Gateway Internals](./gateway-internals.md)** — messaging platform gateway
9. **[Context Compression & Prompt Caching](./context-compression-and-caching.md)** — compression and caching
10. **[ACP Internals](./acp-internals.md)** — IDE integration

## Major Subsystems

### Agent Loop

The synchronous orchestration engine (`AIAgent` in `run_agent.py`). Handles provider selection, prompt construction, tool execution, retries, fallback, callbacks, compression, and persistence. Supports three API modes for different provider backends.

→ [Agent Loop Internals](./agent-loop.md)

### Prompt System

Prompt construction and maintenance across the conversation lifecycle:

- **`prompt_builder.py`** — Assembles the system prompt from: personality (SOUL.md), memory (MEMORY.md, USER.md), skills, context files (AGENTS.md, .jarvis.md), tool-use guidance, and model-specific instructions
- **`prompt_caching.py`** — Applies Anthropic cache breakpoints for prefix caching
- **`context_compressor.py`** — Summarizes middle conversation turns when context exceeds thresholds

→ [Prompt Assembly](./prompt-assembly.md), [Context Compression & Prompt Caching](./context-compression-and-caching.md)

### Provider Resolution

A shared runtime resolver used by CLI, gateway, cron, ACP, and auxiliary calls. Maps `(provider, model)` tuples to `(api_mode, api_key, base_url)`. Handles 18+ providers, OAuth flows, credential pools, and alias resolution.

→ [Provider Runtime Resolution](./provider-runtime.md)

### Tool System

Central tool registry (`tools/registry.py`) with 70+ registered tools across ~28 toolsets. Each tool file self-registers at import time. The registry handles schema collection, dispatch, availability checking, and error wrapping. Terminal tools support 7 backends (local, Docker, SSH, Daytona, Modal, Singularity, Vercel Sandbox).

→ [Tools Runtime](./tools-runtime.md)

### Session Persistence

SQLite-based session storage with FTS5 full-text search. Sessions have lineage tracking (parent/child across compressions), per-platform isolation, and atomic writes with contention handling.

→ [Session Storage](./session-storage.md)

### Messaging Gateway

Long-running process with 20 platform adapters, unified session routing, user authorization (allowlists + DM pairing), slash command dispatch, hook system, cron ticking, and background maintenance.

→ [Gateway Internals](./gateway-internals.md)

### Plugin System

Three discovery sources: `~/.jarvis/plugins/` (user), `.jarvis/plugins/` (project), and pip entry points. Plugins register tools, hooks, and CLI commands through a context API. Two specialized plugin types exist: memory providers (`plugins/memory/`) and context engines (`plugins/context_engine/`). Both are single-select — only one of each can be active at a time, configured via `jarvis plugins` or `config.yaml`.

→ [Plugin Guide](/docs/guides/build-a-jarvis-plugin), [Memory Provider Plugin](./memory-provider-plugin.md)

### Cron

First-class agent tasks (not shell tasks). Jobs store in JSON, support multiple schedule formats, can attach skills and scripts, and deliver to any platform.

→ [Cron Internals](./cron-internals.md)

### ACP Integration

Exposes Jarvis as an editor-native agent over stdio/JSON-RPC for VS Code, Zed, and JetBrains.

→ [ACP Internals](./acp-internals.md)

### Trajectories

Generates ShareGPT-format trajectories from agent sessions for training data generation.

→ [Trajectories & Training Format](./trajectory-format.md)

## Design Principles

| Principle | What it means in practice |
|-----------|--------------------------|
| **Prompt stability** | System prompt doesn't change mid-conversation. No cache-breaking mutations except explicit user actions (`/model`). |
| **Observable execution** | Every tool call is visible to the user via callbacks. Progress updates in CLI (spinner) and gateway (chat messages). |
| **Interruptible** | API calls and tool execution can be cancelled mid-flight by user input or signals. |
| **Platform-agnostic core** | One AIAgent class serves CLI, gateway, ACP, batch, and API server. Platform differences live in the entry point, not the agent. |
| **Loose coupling** | Optional subsystems (MCP, plugins, memory providers, RL environments) use registry patterns and check_fn gating, not hard dependencies. |
| **Profile isolation** | Each profile (`jarvis -p <name>`) gets its own JARVIS_HOME, config, memory, sessions, and gateway PID. Multiple profiles run concurrently. |

## File Dependency Chain

```text
tools/registry.py  (no deps — imported by all tool files)
       ↑
tools/*.py  (each calls registry.register() at import time)
       ↑
tools/model_tools.py  (imports tools/registry + triggers tool discovery)
       ↑
run_agent.py, cli.py, tools/batch_runner.py, environments/
```

This chain means tool registration happens at import time, before any agent instance is created. Any `tools/*.py` file with a top-level `registry.register()` call is auto-discovered — no manual import list needed.

## Source: `developer-guide/agent-loop.md`

---
sidebar_position: 3
title: "Agent Loop Internals"
description: "Detailed walkthrough of AIAgent execution, API modes, tools, callbacks, and fallback behavior"
---

# Agent Loop Internals

The core orchestration engine is `run_agent.py`'s `AIAgent` class — a large file (15k+ lines) that handles everything from prompt assembly to tool dispatch to provider failover.

## Core Responsibilities

`AIAgent` is responsible for:

- Assembling the effective system prompt and tool schemas via `prompt_builder.py`
- Selecting the correct provider/API mode (chat_completions, codex_responses, anthropic_messages)
- Making interruptible model calls with cancellation support
- Executing tool calls (sequentially or concurrently via thread pool)
- Maintaining conversation history in OpenAI message format
- Handling compression, retries, and fallback model switching
- Tracking iteration budgets across parent and child agents
- Flushing persistent memory before context is lost

## Two Entry Points

```python
# Simple interface — returns final response string
response = agent.chat("Fix the bug in main.py")

# Full interface — returns dict with messages, metadata, usage stats
result = agent.run_conversation(
    user_message="Fix the bug in main.py",
    system_message=None,           # auto-built if omitted
    conversation_history=None,      # auto-loaded from session if omitted
    task_id="task_abc123"
)
```

`chat()` is a thin wrapper around `run_conversation()` that extracts the `final_response` field from the result dict.

## API Modes

Jarvis supports three API execution modes, resolved from provider selection, explicit args, and base URL heuristics:

| API mode | Used for | Client type |
|----------|----------|-------------|
| `chat_completions` | OpenAI-compatible endpoints (OpenRouter, custom, most providers) | `openai.OpenAI` |
| `codex_responses` | OpenAI Codex / Responses API | `openai.OpenAI` with Responses format |
| `anthropic_messages` | Native Anthropic Messages API | `anthropic.Anthropic` via adapter |

The mode determines how messages are formatted, how tool calls are structured, how responses are parsed, and how caching/streaming works. All three converge on the same internal message format (OpenAI-style `role`/`content`/`tool_calls` dicts) before and after API calls.

**Mode resolution order:**
1. Explicit `api_mode` constructor arg (highest priority)
2. Provider-specific detection (e.g., `anthropic` provider → `anthropic_messages`)
3. Base URL heuristics (e.g., `api.anthropic.com` → `anthropic_messages`)
4. Default: `chat_completions`

## Turn Lifecycle

Each iteration of the agent loop follows this sequence:

```text
run_conversation()
  1. Generate task_id if not provided
  2. Append user message to conversation history
  3. Build or reuse cached system prompt (prompt_builder.py)
  4. Check if preflight compression is needed (>50% context)
  5. Build API messages from conversation history
     - chat_completions: OpenAI format as-is
     - codex_responses: convert to Responses API input items
     - anthropic_messages: convert via anthropic_adapter.py
  6. Inject ephemeral prompt layers (budget warnings, context pressure)
  7. Apply prompt caching markers if on Anthropic
  8. Make interruptible API call (_interruptible_api_call)
  9. Parse response:
     - If tool_calls: execute them, append results, loop back to step 5
     - If text response: persist session, flush memory if needed, return
```

### Message Format

All messages use OpenAI-compatible format internally:

```python
{"role": "system", "content": "..."}
{"role": "user", "content": "..."}
{"role": "assistant", "content": "...", "tool_calls": [...]}
{"role": "tool", "tool_call_id": "...", "content": "..."}
```

Reasoning content (from models that support extended thinking) is stored in `assistant_msg["reasoning"]` and optionally displayed via the `reasoning_callback`.

### Message Alternation Rules

The agent loop enforces strict message role alternation:

- After the system message: `User → Assistant → User → Assistant → ...`
- During tool calling: `Assistant (with tool_calls) → Tool → Tool → ... → Assistant`
- **Never** two assistant messages in a row
- **Never** two user messages in a row
- **Only** `tool` role can have consecutive entries (parallel tool results)

Providers validate these sequences and will reject malformed histories.

## Interruptible API Calls

API requests are wrapped in `_interruptible_api_call()` which runs the actual HTTP call in a background thread while monitoring an interrupt event:

```text
┌────────────────────────────────────────────────────┐
│  Main thread                  API thread           │
│                                                    │
│   wait on:                     HTTP POST           │
│    - response ready     ───▶   to provider         │
│    - interrupt event                               │
│    - timeout                                       │
└────────────────────────────────────────────────────┘
```

When interrupted (user sends new message, `/stop` command, or signal):
- The API thread is abandoned (response discarded)
- The agent can process the new input or shut down cleanly
- No partial response is injected into conversation history

## Tool Execution

### Sequential vs Concurrent

When the model returns tool calls:

- **Single tool call** → executed directly in the main thread
- **Multiple tool calls** → executed concurrently via `ThreadPoolExecutor`
  - Exception: tools marked as interactive (e.g., `clarify`) force sequential execution
  - Results are reinserted in the original tool call order regardless of completion order

### Execution Flow

```text
for each tool_call in response.tool_calls:
    1. Resolve handler from tools/registry.py
    2. Fire pre_tool_call plugin hook
    3. Check if dangerous command (tools/approval.py)
       - If dangerous: invoke approval_callback, wait for user
    4. Execute handler with args + task_id
    5. Fire post_tool_call plugin hook
    6. Append {"role": "tool", "content": result} to history
```

### Agent-Level Tools

Some tools are intercepted by `run_agent.py` *before* reaching `handle_function_call()`:

| Tool | Why intercepted |
|------|--------------------|
| `todo` | Reads/writes agent-local task state |
| `memory` | Writes to persistent memory files with character limits |
| `session_search` | Queries session history via the agent's session DB |
| `delegate_task` | Spawns subagent(s) with isolated context |

These tools modify agent state directly and return synthetic tool results without going through the registry.

## Callback Surfaces

`AIAgent` supports platform-specific callbacks that enable real-time progress in the CLI, gateway, and ACP integrations:

| Callback | When fired | Used by |
|----------|-----------|---------|
| `tool_progress_callback` | Before/after each tool execution | CLI spinner, gateway progress messages |
| `thinking_callback` | When model starts/stops thinking | CLI "thinking..." indicator |
| `reasoning_callback` | When model returns reasoning content | CLI reasoning display, gateway reasoning blocks |
| `clarify_callback` | When `clarify` tool is called | CLI input prompt, gateway interactive message |
| `step_callback` | After each complete agent turn | Gateway step tracking, ACP progress |
| `stream_delta_callback` | Each streaming token (when enabled) | CLI streaming display |
| `tool_gen_callback` | When tool call is parsed from stream | CLI tool preview in spinner |
| `status_callback` | State changes (thinking, executing, etc.) | ACP status updates |

## Budget and Fallback Behavior

### Iteration Budget

The agent tracks iterations via `IterationBudget`:

- Default: 90 iterations (configurable via `agent.max_turns`)
- Each agent gets its own budget. Subagents get independent budgets capped at `delegation.max_iterations` (default 50) — total iterations across parent + subagents can exceed the parent's cap
- At 100%, the agent stops and returns a summary of work done

### Fallback Model

When the primary model fails (429 rate limit, 5xx server error, 401/403 auth error):

1. Check `fallback_providers` list in config
2. Try each fallback in order
3. On success, continue the conversation with the new provider
4. On 401/403, attempt credential refresh before failing over

The fallback system also covers auxiliary tasks independently — vision, compression, and web extraction each have their own fallback chain configurable via the `auxiliary.*` config section.

## Compression and Persistence

### When Compression Triggers

- **Preflight** (before API call): If conversation exceeds 50% of model's context window
- **Gateway auto-compression**: If conversation exceeds 85% (more aggressive, runs between turns)

### What Happens During Compression

1. Memory is flushed to disk first (preventing data loss)
2. Middle conversation turns are summarized into a compact summary
3. The last N messages are preserved intact (`compression.protect_last_n`, default: 20)
4. Tool call/result message pairs are kept together (never split)
5. A new session lineage ID is generated (compression creates a "child" session)

### Session Persistence

After each turn:
- Messages are saved to the session store (SQLite via `session_state.py`)
- Memory changes are flushed to `MEMORY.md` / `USER.md`
- The session can be resumed later via `/resume` or `jarvis chat --resume`

## Key Source Files

| File | Purpose |
|------|---------|
| `run_agent.py` | AIAgent class — the complete agent loop |
| `agent/prompt_builder.py` | System prompt assembly from memory, skills, context files, personality |
| `agent/context_engine.py` | ContextEngine ABC — pluggable context management |
| `agent/context_compressor.py` | Default engine — lossy summarization algorithm |
| `agent/prompt_caching.py` | Anthropic prompt caching markers and cache metrics |
| `agent/auxiliary_client.py` | Auxiliary LLM client for side tasks (vision, summarization) |
| `tools/model_tools.py` | Tool schema collection, `handle_function_call()` dispatch |

## Related Docs

- [Provider Runtime Resolution](./provider-runtime.md)
- [Prompt Assembly](./prompt-assembly.md)
- [Context Compression & Prompt Caching](./context-compression-and-caching.md)
- [Tools Runtime](./tools-runtime.md)
- [Architecture Overview](./architecture.md)

## Source: `developer-guide/gateway-internals.md`

---
sidebar_position: 7
title: "Gateway Internals"
description: "How the messaging gateway boots, authorizes users, routes sessions, and delivers messages"
---

# Gateway Internals

The messaging gateway is the long-running process that connects Jarvis to 20+ external messaging platforms through a unified architecture.

## Key Files

| File | Purpose |
|------|---------|
| `gateway/run.py` | `GatewayRunner` — main loop, slash commands, message dispatch (large file; check git for current LOC) |
| `gateway/session.py` | `SessionStore` — conversation persistence and session key construction |
| `gateway/delivery.py` | Outbound message delivery to target platforms/channels |
| `gateway/pairing.py` | DM pairing flow for user authorization |
| `gateway/channel_directory.py` | Maps chat IDs to human-readable names for cron delivery |
| `gateway/hooks.py` | Hook discovery, loading, and lifecycle event dispatch |
| `gateway/mirror.py` | Cross-session message mirroring for `send_message` |
| `gateway/status.py` | Token lock management for profile-scoped gateway instances |
| `gateway/builtin_hooks/` | Extension point for always-registered hooks (none shipped) |
| `gateway/platforms/` | Platform adapters (one per messaging platform) |

## Architecture Overview

```text
┌─────────────────────────────────────────────────┐
│                  GatewayRunner                  │
│                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ Telegram │  │ Discord  │  │  Slack   │       │
│  │ Adapter  │  │ Adapter  │  │ Adapter  │       │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘       │
│       │             │             │             │
│       └─────────────┼─────────────┘             │
│                     ▼                           │
│              _handle_message()                  │
│                     │                           │
│         ┌───────────┼───────────┐               │
│         ▼           ▼           ▼               │
│  Slash command   AIAgent    Queue/BG            │
│    dispatch      creation   sessions            │
│                     │                           │
│                     ▼                           │
│                 SessionStore                    │
│              (SQLite persistence)               │
└───────┴─────────────┴─────────────┴─────────────┘
```

## Message Flow

When a message arrives from any platform:

1. **Platform adapter** receives raw event, normalizes it into a `MessageEvent`
2. **Base adapter** checks active session guard:
   - If agent is running for this session → queue message, set interrupt event
   - If `/approve`, `/deny`, `/stop` → bypass guard (dispatched inline)
3. **GatewayRunner._handle_message()** receives the event:
   - Resolve session key via `_session_key_for_source()` (format: `agent:main:{platform}:{chat_type}:{chat_id}`)
   - Check authorization (see Authorization below)
   - Check if it's a slash command → dispatch to command handler
   - Check if agent is already running → intercept commands like `/stop`, `/status`
   - Otherwise → create `AIAgent` instance and run conversation
4. **Response** is sent back through the platform adapter

### Session Key Format

Session keys encode the full routing context:

```
agent:main:{platform}:{chat_type}:{chat_id}
```

For example: `agent:main:telegram:private:123456789`

Thread-aware platforms (Telegram forum topics, Discord threads, Slack threads) may include thread IDs in the chat_id portion. **Never construct session keys manually** — always use `build_session_key()` from `gateway/session.py`.

### Two-Level Message Guard

When an agent is actively running, incoming messages pass through two sequential guards:

1. **Level 1 — Base adapter** (`gateway/platforms/base.py`): Checks `_active_sessions`. If the session is active, queues the message in `_pending_messages` and sets an interrupt event. This catches messages *before* they reach the gateway runner.

2. **Level 2 — Gateway runner** (`gateway/run.py`): Checks `_running_agents`. Intercepts specific commands (`/stop`, `/new`, `/queue`, `/status`, `/approve`, `/deny`) and routes them appropriately. Everything else triggers `running_agent.interrupt()`.

Commands that must reach the runner while the agent is blocked (like `/approve`) are dispatched **inline** via `await self._message_handler(event)` — they bypass the background task system to avoid race conditions.

## Authorization

The gateway uses a multi-layer authorization check, evaluated in order:

1. **Per-platform allow-all flag** (e.g., `TELEGRAM_ALLOW_ALL_USERS`) — if set, all users on that platform are authorized
2. **Platform allowlist** (e.g., `TELEGRAM_ALLOWED_USERS`) — comma-separated user IDs
3. **DM pairing** — authenticated users can pair new users via a pairing code
4. **Global allow-all** (`GATEWAY_ALLOW_ALL_USERS`) — if set, all users across all platforms are authorized
5. **Default: deny** — unauthorized users are rejected

### DM Pairing Flow

```text
Admin: /pair
Gateway: "Pairing code: ABC123. Share with the user."
New user: ABC123
Gateway: "Paired! You're now authorized."
```

Pairing state is persisted in `gateway/pairing.py` and survives restarts.

## Slash Command Dispatch

All slash commands in the gateway flow through the same resolution pipeline:

1. `resolve_command()` from `jarvis_cli/commands.py` maps input to canonical name (handles aliases, prefix matching)
2. The canonical name is checked against `GATEWAY_KNOWN_COMMANDS`
3. Handler in `_handle_message()` dispatches based on canonical name
4. Some commands are gated on config (`gateway_config_gate` on `CommandDef`)

### Running-Agent Guard

Commands that must NOT execute while the agent is processing are rejected early:

```python
if _quick_key in self._running_agents:
    if canonical == "model":
        return "⏳ Agent is running — wait for it to finish or /stop first."
```

Bypass commands (`/stop`, `/new`, `/approve`, `/deny`, `/queue`, `/status`) have special handling.

## Config Sources

The gateway reads configuration from multiple sources:

| Source | What it provides |
|--------|-----------------|
| `~/.jarvis/.env` | API keys, bot tokens, platform credentials |
| `~/.jarvis/config.yaml` | Model settings, tool configuration, display options |
| Environment variables | Override any of the above |

Unlike the CLI (which uses `load_cli_config()` with hardcoded defaults), the gateway reads `config.yaml` directly via YAML loader. This means config keys that exist in the CLI's defaults dict but not in the user's config file may behave differently between CLI and gateway.

## Platform Adapters

Each messaging platform has an adapter in `gateway/platforms/`:

```text
gateway/platforms/
├── base.py              # BaseAdapter — shared logic for all platforms
├── telegram.py          # Telegram Bot API (long polling or webhook)
├── discord.py           # Discord bot via discord.py
├── slack.py             # Slack Socket Mode
├── whatsapp.py          # WhatsApp Business Cloud API
├── signal.py            # Signal via signal-cli REST API
├── matrix.py            # Matrix via mautrix (optional E2EE)
├── mattermost.py        # Mattermost WebSocket API
├── email.py             # Email via IMAP/SMTP
├── sms.py               # SMS via Twilio
├── dingtalk.py          # DingTalk WebSocket
├── feishu.py            # Feishu/Lark WebSocket or webhook
├── wecom.py             # WeCom (WeChat Work) callback
├── weixin.py            # Weixin (personal WeChat) via iLink Bot API
├── bluebubbles.py       # Apple iMessage via BlueBubbles macOS server
├── qqbot/               # QQ Bot (Tencent QQ) via Official API v2 (sub-package: adapter.py, crypto.py, keyboards.py, …)
├── yuanbao.py           # Yuanbao (Tencent) DM/group adapter
├── feishu_comment.py    # Feishu document/drive comment-reply handler
├── msgraph_webhook.py   # Microsoft Graph change-notification webhook (Teams, Outlook, etc.)
├── webhook.py           # Inbound/outbound webhook adapter
├── api_server.py        # REST API server adapter
└── homeassistant.py     # Home Assistant conversation integration
```

Adapters implement a common interface:
- `connect()` / `disconnect()` — lifecycle management
- `send_message()` — outbound message delivery
- `on_message()` — inbound message normalization → `MessageEvent`

### Token Locks

Adapters that connect with unique credentials call `acquire_scoped_lock()` in `connect()` and `release_scoped_lock()` in `disconnect()`. This prevents two profiles from using the same bot token simultaneously.

## Delivery Path

Outgoing deliveries (`gateway/delivery.py`) handle:

- **Direct reply** — send response back to the originating chat
- **Home channel delivery** — route cron job outputs and background results to a configured home channel
- **Explicit target delivery** — `send_message` tool specifying `telegram:-1001234567890`, or the [`jarvis send` CLI](/docs/guides/pipe-script-output) wrapping the same tool for shell scripts
- **Cross-platform delivery** — deliver to a different platform than the originating message

Cron job deliveries are NOT mirrored into gateway session history — they live in their own cron session only. This is a deliberate design choice to avoid message alternation violations.

## Hooks

Gateway hooks are Python modules that respond to lifecycle events:

### Gateway Hook Events

| Event | When fired |
|-------|-----------|
| `gateway:startup` | Gateway process starts |
| `session:start` | New conversation session begins |
| `session:end` | Session completes or times out |
| `session:reset` | User resets session with `/new` |
| `agent:start` | Agent begins processing a message |
| `agent:step` | Agent completes one tool-calling iteration |
| `agent:end` | Agent finishes and returns response |
| `command:*` | Any slash command is executed |

Hooks are discovered from `gateway/builtin_hooks/` (an extension point — currently empty in the shipped distribution; `_register_builtin_hooks()` is a no-op stub) and `~/.jarvis/hooks/` (user-installed). Each hook is a directory with a `HOOK.yaml` manifest and `handler.py`.

## Memory Provider Integration

When a memory provider plugin (e.g., Honcho) is enabled:

1. Gateway creates an `AIAgent` per message with the session ID
2. The `MemoryManager` initializes the provider with the session context
3. Provider tools (e.g., `honcho_profile`, `viking_search`) are routed through:

```text
AIAgent._invoke_tool()
  → self._memory_manager.handle_tool_call(name, args)
    → provider.handle_tool_call(name, args)
```

4. On session end/reset, `on_session_end()` fires for cleanup and final data flush

### Memory Flush Lifecycle

When a session is reset, resumed, or expires:
1. Built-in memories are flushed to disk
2. Memory provider's `on_session_end()` hook fires
3. A temporary `AIAgent` runs a memory-only conversation turn
4. Context is then discarded or archived

## Background Maintenance

The gateway runs periodic maintenance alongside message handling:

- **Cron ticking** — checks job schedules and fires due jobs
- **Session expiry** — cleans up abandoned sessions after timeout
- **Memory flush** — proactively flushes memory before session expiry
- **Cache refresh** — refreshes model lists and provider status

## Process Management

The gateway runs as a long-lived process, managed via:

- `jarvis gateway start` / `jarvis gateway stop` — manual control
- `systemctl` (Linux) or `launchctl` (macOS) — service management
- PID file at `~/.jarvis/gateway.pid` — profile-scoped process tracking

**Profile-scoped vs global**: `start_gateway()` uses profile-scoped PID files. `jarvis gateway stop` stops only the current profile's gateway. `jarvis gateway stop --all` uses global `ps aux` scanning to kill all gateway processes (used during updates).

## Related Docs

- [Session Storage](./session-storage.md)
- [Cron Internals](./cron-internals.md)
- [ACP Internals](./acp-internals.md)
- [Agent Loop Internals](./agent-loop.md)
- [Messaging Gateway (User Guide)](/docs/user-guide/messaging)

## Source: `developer-guide/tools-runtime.md`

---
sidebar_position: 9
title: "Tools Runtime"
description: "Runtime behavior of the tool registry, toolsets, dispatch, and terminal environments"
---

# Tools Runtime

Jarvis tools are self-registering functions grouped into toolsets and executed through a central registry/dispatch system.

Primary files:

- `tools/registry.py`
- `tools/model_tools.py`
- `tools/toolsets.py`
- `tools/terminal_tool.py`
- `tools/environments/*`

## Tool registration model

Each tool module calls `registry.register(...)` at import time.

`tools/model_tools.py` is responsible for importing/discovering tool modules and building the schema list used by the model.

### How `registry.register()` works

Every tool file in `tools/` calls `registry.register()` at module level to declare itself. The function signature is:

```python
registry.register(
    name="terminal",               # Unique tool name (used in API schemas)
    toolset="terminal",            # Toolset this tool belongs to
    schema={...},                  # OpenAI function-calling schema (description, parameters)
    handler=handle_terminal,       # The function that executes when the tool is called
    check_fn=check_terminal,       # Optional: returns True/False for availability
    requires_env=["SOME_VAR"],     # Optional: env vars needed (for UI display)
    is_async=False,                # Whether the handler is an async coroutine
    description="Run commands",    # Human-readable description
    emoji="💻",                    # Emoji for spinner/progress display
)
```

Each call creates a `ToolEntry` stored in the singleton `ToolRegistry._tools` dict keyed by tool name. If a name collision occurs across toolsets, a warning is logged and the later registration wins.

### Discovery: `discover_builtin_tools()`

When `tools/model_tools.py` is imported, it calls `discover_builtin_tools()` from `tools/registry.py`. This function scans every `tools/*.py` file using AST parsing to find modules that contain top-level `registry.register()` calls, then imports them:

```python
# tools/registry.py (simplified)
def discover_builtin_tools(tools_dir=None):
    tools_path = Path(tools_dir) if tools_dir else Path(__file__).parent
    for path in sorted(tools_path.glob("*.py")):
        if path.name in {"__init__.py", "registry.py", "mcp_tool.py"}:
            continue
        if _module_registers_tools(path):  # AST check for top-level registry.register()
            importlib.import_module(f"tools.{path.stem}")
```

This auto-discovery means new tool files are picked up automatically — no manual list to maintain. The AST check only matches top-level `registry.register()` calls (not calls inside functions), so helper modules in `tools/` are not imported.

Each import triggers the module's `registry.register()` calls. Errors in optional tools (e.g., missing `fal_client` for image generation) are caught and logged — they don't prevent other tools from loading.

After core tool discovery, MCP tools and plugin tools are also discovered:

1. **MCP tools** — `tools.mcp_tool.discover_mcp_tools()` reads MCP server config and registers tools from external servers.
2. **Plugin tools** — `jarvis_cli.plugins.discover_plugins()` loads user/project/pip plugins that may register additional tools.

## Tool availability checking (`check_fn`)

Each tool can optionally provide a `check_fn` — a callable that returns `True` when the tool is available and `False` otherwise. Typical checks include:

- **API key present** — e.g., `lambda: bool(os.environ.get("SERP_API_KEY"))` for web search
- **Service running** — e.g., checking if the Honcho server is configured
- **Binary installed** — e.g., verifying `playwright` is available for browser tools

When `registry.get_definitions()` builds the schema list for the model, it runs each tool's `check_fn()`:

```python
# Simplified from registry.py
if entry.check_fn:
    try:
        available = bool(entry.check_fn())
    except Exception:
        available = False   # Exceptions = unavailable
    if not available:
        continue            # Skip this tool entirely
```

Key behaviors:
- Check results are **cached per-call** — if multiple tools share the same `check_fn`, it only runs once.
- Exceptions in `check_fn()` are treated as "unavailable" (fail-safe).
- The `is_toolset_available()` method checks whether a toolset's `check_fn` passes, used for UI display and toolset resolution.

## Toolset resolution

Toolsets are named bundles of tools. Jarvis resolves them through:

- explicit enabled/disabled toolset lists
- platform presets (`jarvis-cli`, `jarvis-telegram`, etc.)
- dynamic MCP toolsets
- curated special-purpose sets like `jarvis-acp`

### How `get_tool_definitions()` filters tools

The main entry point is `model_tools.get_tool_definitions(enabled_toolsets, disabled_toolsets, quiet_mode)`:

1. **If `enabled_toolsets` is provided** — only tools from those toolsets are included. Each toolset name is resolved via `resolve_toolset()` which expands composite toolsets into individual tool names.

2. **If `disabled_toolsets` is provided** — start with ALL toolsets, then subtract the disabled ones.

3. **If neither** — include all known toolsets.

4. **Registry filtering** — the resolved tool name set is passed to `registry.get_definitions()`, which applies `check_fn` filtering and returns OpenAI-format schemas.

5. **Dynamic schema patching** — after filtering, `execute_code` and `browser_navigate` schemas are dynamically adjusted to only reference tools that actually passed filtering (prevents model hallucination of unavailable tools).

### Legacy toolset names

Old toolset names with `_tools` suffixes (e.g., `web_tools`, `terminal_tools`) are mapped to their modern tool names via `_LEGACY_TOOLSET_MAP` for backward compatibility.

## Dispatch

At runtime, tools are dispatched through the central registry, with agent-loop exceptions for some agent-level tools such as memory/todo/session-search handling.

### Dispatch flow: model tool_call → handler execution

When the model returns a `tool_call`, the flow is:

```
Model response with tool_call
    ↓
run_agent.py agent loop
    ↓
model_tools.handle_function_call(name, args, task_id, user_task)
    ↓
[Agent-loop tools?] → handled directly by agent loop (todo, memory, session_search, delegate_task)
    ↓
[Plugin pre-hook] → invoke_hook("pre_tool_call", ...)
    ↓
registry.dispatch(name, args, **kwargs)
    ↓
Look up ToolEntry by name
    ↓
[Async handler?] → bridge via _run_async()
[Sync handler?]  → call directly
    ↓
Return result string (or JSON error)
    ↓
[Plugin post-hook] → invoke_hook("post_tool_call", ...)
```

### Error wrapping

All tool execution is wrapped in error handling at two levels:

1. **`registry.dispatch()`** — catches any exception from the handler and returns `{"error": "Tool execution failed: ExceptionType: message"}` as JSON.

2. **`handle_function_call()`** — wraps the entire dispatch in a secondary try/except that returns `{"error": "Error executing tool_name: message"}`.

This ensures the model always receives a well-formed JSON string, never an unhandled exception.

### Agent-loop tools

Four tools are intercepted before registry dispatch because they need agent-level state (TodoStore, MemoryStore, etc.):

- `todo` — planning/task tracking
- `memory` — persistent memory writes
- `session_search` — cross-session recall
- `delegate_task` — spawns subagent sessions

These tools' schemas are still registered in the registry (for `get_tool_definitions`), but their handlers return a stub error if dispatch somehow reaches them directly.

### Async bridging

When a tool handler is async, `_run_async()` bridges it to the sync dispatch path:

- **CLI path (no running loop)** — uses a persistent event loop to keep cached async clients alive
- **Gateway path (running loop)** — spins up a disposable thread with `asyncio.run()`
- **Worker threads (parallel tools)** — uses per-thread persistent loops stored in thread-local storage

## The DANGEROUS_PATTERNS approval flow

The terminal tool integrates a dangerous-command approval system defined in `tools/approval.py`:

1. **Pattern detection** — `DANGEROUS_PATTERNS` is a list of `(regex, description)` tuples covering destructive operations:
   - Recursive deletes (`rm -rf`)
   - Filesystem formatting (`mkfs`, `dd`)
   - SQL destructive operations (`DROP TABLE`, `DELETE FROM` without `WHERE`)
   - System config overwrites (`> /etc/`)
   - Service manipulation (`systemctl stop`)
   - Remote code execution (`curl | sh`)
   - Fork bombs, process kills, etc.

2. **Detection** — before executing any terminal command, `detect_dangerous_command(command)` checks against all patterns.

3. **Approval prompt** — if a match is found:
   - **CLI mode** — an interactive prompt asks the user to approve, deny, or allow permanently
   - **Gateway mode** — an async approval callback sends the request to the messaging platform
   - **Smart approval** — optionally, an auxiliary LLM can auto-approve low-risk commands that match patterns (e.g., `rm -rf node_modules/` is safe but matches "recursive delete")

4. **Session state** — approvals are tracked per-session. Once you approve "recursive delete" for a session, subsequent `rm -rf` commands don't re-prompt.

5. **Permanent allowlist** — the "allow permanently" option writes the pattern to `config.yaml`'s `command_allowlist`, persisting across sessions.

## Terminal/runtime environments

The terminal system supports multiple backends:

- local
- docker
- ssh
- singularity
- modal
- daytona
- vercel_sandbox

It also supports:

- per-task cwd overrides
- background process management
- PTY mode
- approval callbacks for dangerous commands

## Concurrency

Tool calls may execute sequentially or concurrently depending on the tool mix and interaction requirements.

## Related docs

- [Toolsets Reference](../reference/toolsets-reference.md)
- [Built-in Tools Reference](../reference/tools-reference.md)
- [Agent Loop Internals](./agent-loop.md)
- [ACP Internals](./acp-internals.md)

