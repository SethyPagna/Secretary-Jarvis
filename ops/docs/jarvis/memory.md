# Memory

> Imported from the local source documentation and rewritten for the JARVIS desktop-first app. Run commands from the integrated Home terminal unless a section explicitly refers to packaging or automation.

## Source: `user-guide/features/memory.md`

---
sidebar_position: 3
title: "Persistent Memory"
description: "How JARVIS remembers across sessions — MEMORY.md, USER.md, and session search"
---

# Persistent Memory

JARVIS has bounded, curated memory that persists across sessions. This lets it remember your preferences, your projects, your environment, and things it has learned.

## How It Works

Two files make up the agent's memory:

| File | Purpose | Char Limit |
|------|---------|------------|
| **MEMORY.md** | Agent's personal notes — environment facts, conventions, things learned | 2,200 chars (~800 tokens) |
| **USER.md** | User profile — your preferences, communication style, expectations | 1,375 chars (~500 tokens) |

Both are stored in `~/.jarvis/memories/` and are injected into the system prompt as a frozen snapshot at session start. The agent manages its own memory via the `memory` tool — it can add, replace, or remove entries.

:::info
Character limits keep memory focused. When memory is full, the agent consolidates or replaces entries to make room for new information.
:::

## How Memory Appears in the System Prompt

At the start of every session, memory entries are loaded from disk and rendered into the system prompt as a frozen block:

```
══════════════════════════════════════════════
MEMORY (your personal notes) [67% — 1,474/2,200 chars]
══════════════════════════════════════════════
User's project is a Rust web service at ~/code/myapi using Axum + SQLx
§
This machine runs Ubuntu 22.04, has Docker and Podman installed
§
User prefers concise responses, dislikes verbose explanations
```

The format includes:
- A header showing which store (MEMORY or USER PROFILE)
- Usage percentage and character counts so the agent knows capacity
- Individual entries separated by `§` (section sign) delimiters
- Entries can be multiline

**Frozen snapshot pattern:** The system prompt injection is captured once at session start and never changes mid-session. This is intentional — it preserves the LLM's prefix cache for performance. When the agent adds/removes memory entries during a session, the changes are persisted to disk immediately but won't appear in the system prompt until the next session starts. Tool responses always show the live state.

## Memory Tool Actions

The agent uses the `memory` tool with these actions:

- **add** — Add a new memory entry
- **replace** — Replace an existing entry with updated content (uses substring matching via `old_text`)
- **remove** — Remove an entry that's no longer relevant (uses substring matching via `old_text`)

There is no `read` action — memory content is automatically injected into the system prompt at session start. The agent sees its memories as part of its conversation context.

### Substring Matching

The `replace` and `remove` actions use short unique substring matching — you don't need the full entry text. The `old_text` parameter just needs to be a unique substring that identifies exactly one entry:

```python
# If memory contains "User prefers dark mode in all editors"
memory(action="replace", target="memory",
       old_text="dark mode",
       content="User prefers light mode in VS Code, dark mode in terminal")
```

If the substring matches multiple entries, an error is returned asking for a more specific match.

## Two Targets Explained

### `memory` — Agent's Personal Notes

For information the agent needs to remember about the environment, workflows, and lessons learned:

- Environment facts (OS, tools, project structure)
- Project conventions and configuration
- Tool quirks and workarounds discovered
- Completed task diary entries
- Skills and techniques that worked

### `user` — User Profile

For information about the user's identity, preferences, and communication style:

- Name, role, timezone
- Communication preferences (concise vs detailed, format preferences)
- Pet peeves and things to avoid
- Workflow habits
- Technical skill level

## What to Save vs Skip

### Save These (Proactively)

The agent saves automatically — you don't need to ask. It saves when it learns:

- **User preferences:** "I prefer TypeScript over JavaScript" → save to `user`
- **Environment facts:** "This server runs Debian 12 with PostgreSQL 16" → save to `memory`
- **Corrections:** "Don't use `sudo` for Docker commands, user is in docker group" → save to `memory`
- **Conventions:** "Project uses tabs, 120-char line width, Google-style docstrings" → save to `memory`
- **Completed work:** "Migrated database from MySQL to PostgreSQL on 2026-01-15" → save to `memory`
- **Explicit requests:** "Remember that my API key rotation happens monthly" → save to `memory`

### Skip These

- **Trivial/obvious info:** "User asked about Python" — too vague to be useful
- **Easily re-discovered facts:** "Python 3.12 supports f-string nesting" — can web search this
- **Raw data dumps:** Large code blocks, log files, data tables — too big for memory
- **Session-specific ephemera:** Temporary file paths, one-off debugging context
- **Information already in context files:** SOUL.md and AGENTS.md content

## Capacity Management

Memory has strict character limits to keep system prompts bounded:

| Store | Limit | Typical entries |
|-------|-------|----------------|
| memory | 2,200 chars | 8-15 entries |
| user | 1,375 chars | 5-10 entries |

### What Happens When Memory is Full

When you try to add an entry that would exceed the limit, the tool returns an error:

```json
{
  "success": false,
  "error": "Memory at 2,100/2,200 chars. Adding this entry (250 chars) would exceed the limit. Replace or remove existing entries first.",
  "current_entries": ["..."],
  "usage": "2,100/2,200"
}
```

The agent should then:
1. Read the current entries (shown in the error response)
2. Identify entries that can be removed or consolidated
3. Use `replace` to merge related entries into shorter versions
4. Then `add` the new entry

**Best practice:** When memory is above 80% capacity (visible in the system prompt header), consolidate entries before adding new ones. For example, merge three separate "project uses X" entries into one comprehensive project description entry.

### Practical Examples of Good Memory Entries

**Compact, information-dense entries work best:**

```
# Good: Packs multiple related facts
User runs macOS 14 Sonoma, uses Homebrew, has Docker Desktop and Podman. Shell: zsh with oh-my-zsh. Editor: VS Code with Vim keybindings.

# Good: Specific, actionable convention
Project ~/code/api uses Go 1.22, sqlc for DB queries, chi router. Run tests with 'make test'. CI via GitHub Actions.

# Good: Lesson learned with context
The staging server (10.0.1.50) needs SSH port 2222, not 22. Key is at ~/.ssh/staging_ed25519.

# Bad: Too vague
User has a project.

# Bad: Too verbose
On January 5th, 2026, the user asked me to look at their project which is
located at ~/code/api. I discovered it uses Go version 1.22 and...
```

## Duplicate Prevention

The memory system automatically rejects exact duplicate entries. If you try to add content that already exists, it returns success with a "no duplicate added" message.

## Security Scanning

Memory entries are scanned for injection and exfiltration patterns before being accepted, since they're injected into the system prompt. Content matching threat patterns (prompt injection, credential exfiltration, SSH backdoors) or containing invisible Unicode characters is blocked.

## Session Search

Beyond MEMORY.md and USER.md, the agent can search its past conversations using the `session_search` tool:

- All CLI and messaging sessions are stored in SQLite (`~/.jarvis/state.db`) with FTS5 full-text search
- Search queries return actual messages from the DB — no LLM summarization, no truncation
- The agent can find things it discussed weeks ago, even if they're not in its active memory
- The agent can also scroll forward/backward inside any session it finds

```bash
jarvis sessions list    # Browse past sessions
```

See [Session Search Tool](/docs/user-guide/sessions#session-search-tool) for the three calling shapes (discovery / scroll / browse) and the response format.

### session_search vs memory

| Feature | Persistent Memory | Session Search |
|---------|------------------|----------------|
| **Capacity** | ~1,300 tokens total | Unlimited (all sessions) |
| **Speed** | Instant (in system prompt) | ~20ms FTS5 query, ~1ms scroll |
| **Cost** | Token cost in every prompt | Free — no LLM calls |
| **Use case** | Key facts always available | Finding specific past conversations |
| **Management** | Manually curated by agent | Automatic — all sessions stored |
| **Token cost** | Fixed per session (~1,300 tokens) | On-demand (searched when needed) |

**Memory** is for critical facts that should always be in context. **Session search** is for "did we discuss X last week?" queries where the agent needs to recall specifics from past conversations.

## Configuration

```yaml
# In ~/.jarvis/config.yaml
memory:
  memory_enabled: true
  user_profile_enabled: true
  memory_char_limit: 2200   # ~800 tokens
  user_char_limit: 1375     # ~500 tokens
```

## External Memory Providers

For deeper, persistent memory that goes beyond MEMORY.md and USER.md, Jarvis ships with 8 external memory provider plugins — including Honcho, OpenViking, Mem0, Hindsight, Holographic, RetainDB, ByteRover, and Supermemory.

External providers run **alongside** built-in memory (never replacing it) and add capabilities like knowledge graphs, semantic search, automatic fact extraction, and cross-session user modeling.

```bash
jarvis memory setup      # pick a provider and configure it
jarvis memory status     # check what's active
```

See the [Memory Providers](./memory-providers.md) guide for full details on each provider, setup instructions, and comparison.

## Source: `user-guide/features/memory-providers.md`

---
sidebar_position: 4
title: "Memory Providers"
description: "External memory provider plugins — Honcho, OpenViking, Mem0, Hindsight, Holographic, RetainDB, ByteRover, Supermemory"
---

# Memory Providers

JARVIS ships with 8 external memory provider plugins that give the agent persistent, cross-session knowledge beyond the built-in MEMORY.md and USER.md. Only **one** external provider can be active at a time — the built-in memory is always active alongside it.

## Quick Start

```bash
jarvis memory setup      # interactive picker + configuration
jarvis memory status     # check what's active
jarvis memory off        # disable external provider
```

You can also select the active memory provider via `jarvis plugins` → Provider Plugins → Memory Provider.

Or set manually in `~/.jarvis/config.yaml`:

```yaml
memory:
  provider: openviking   # or honcho, mem0, hindsight, holographic, retaindb, byterover, supermemory
```

## How It Works

When a memory provider is active, Jarvis automatically:

1. **Injects provider context** into the system prompt (what the provider knows)
2. **Prefetches relevant memories** before each turn (background, non-blocking)
3. **Syncs conversation turns** to the provider after each response
4. **Extracts memories on session end** (for providers that support it)
5. **Mirrors built-in memory writes** to the external provider
6. **Adds provider-specific tools** so the agent can search, store, and manage memories

The built-in memory (MEMORY.md / USER.md) continues to work exactly as before. The external provider is additive.

## Available Providers

### Honcho

AI-native cross-session user modeling with dialectic reasoning, session-scoped context injection, semantic search, and persistent conclusions. Base context now includes the session summary alongside user representation and peer cards, giving the agent awareness of what has already been discussed.

| | |
|---|---|
| **Best for** | Multi-agent systems with cross-session context, user-agent alignment |
| **Requires** | `pip install honcho-ai` + [API key](https://app.honcho.dev) or self-hosted instance |
| **Data storage** | Honcho Cloud or self-hosted |
| **Cost** | Honcho pricing (cloud) / free (self-hosted) |

**Tools (5):** `honcho_profile` (read/update peer card), `honcho_search` (semantic search), `honcho_context` (session context — summary, representation, card, messages), `honcho_reasoning` (LLM-synthesized), `honcho_conclude` (create/delete conclusions)

**Architecture:** Two-layer context injection — a base layer (session summary + representation + peer card, refreshed on `contextCadence`) plus a dialectic supplement (LLM reasoning, refreshed on `dialecticCadence`). The dialectic automatically selects cold-start prompts (general user facts) vs. warm prompts (session-scoped context) based on whether base context exists.

**Three orthogonal config knobs** control cost and depth independently:

- `contextCadence` — how often the base layer refreshes (API call frequency)
- `dialecticCadence` — how often the dialectic LLM fires (LLM call frequency)
- `dialecticDepth` — how many `.chat()` passes per dialectic invocation (1–3, depth of reasoning)

**Setup Wizard:**
```bash
jarvis memory setup        # select "honcho" — runs the Honcho-specific post-setup
```

The legacy `jarvis honcho setup` command still works (it now redirects to `jarvis memory setup`), but is only registered after Honcho is selected as the active memory provider.

**Config:** `$JARVIS_HOME/honcho.json` (profile-local) or `~/.honcho/config.json` (global). Resolution order: `$JARVIS_HOME/honcho.json` > `~/.jarvis/honcho.json` > `~/.honcho/config.json`. See the [config reference](https://github.com/jarvis-ai/jarvis-agent/blob/main/plugins/memory/honcho/README.md) and the [Honcho integration guide](https://docs.honcho.dev/v3/guides/integrations/jarvis).

<details>
<summary>Full config reference</summary>

| Key | Default | Description |
|-----|---------|-------------|
| `apiKey` | -- | API key from [app.honcho.dev](https://app.honcho.dev) |
| `baseUrl` | -- | Base URL for self-hosted Honcho |
| `peerName` | -- | User peer identity |
| `aiPeer` | host key | AI peer identity (one per profile) |
| `workspace` | host key | Shared workspace ID |
| `contextTokens` | `null` (uncapped) | Token budget for auto-injected context per turn. Truncates at word boundaries |
| `contextCadence` | `1` | Minimum turns between `context()` API calls (base layer refresh) |
| `dialecticCadence` | `2` | Minimum turns between `peer.chat()` LLM calls. Recommended 1–5. Only applies to `hybrid`/`context` modes |
| `dialecticDepth` | `1` | Number of `.chat()` passes per dialectic invocation. Clamped 1–3. Pass 0: cold/warm prompt, pass 1: self-audit, pass 2: reconciliation |
| `dialecticDepthLevels` | `null` | Optional array of reasoning levels per pass, e.g. `["minimal", "low", "medium"]`. Overrides proportional defaults |
| `dialecticReasoningLevel` | `'low'` | Base reasoning level: `minimal`, `low`, `medium`, `high`, `max` |
| `dialecticDynamic` | `true` | When `true`, model can override reasoning level per-call via tool param |
| `dialecticMaxChars` | `600` | Max chars of dialectic result injected into system prompt |
| `recallMode` | `'hybrid'` | `hybrid` (auto-inject + tools), `context` (inject only), `tools` (tools only) |
| `writeFrequency` | `'async'` | When to flush messages: `async` (background thread), `turn` (sync), `session` (batch on end), or integer N |
| `saveMessages` | `true` | Whether to persist messages to Honcho API |
| `observationMode` | `'directional'` | `directional` (all on) or `unified` (shared pool). Override with `observation` object |
| `messageMaxChars` | `25000` | Max chars per message (chunked if exceeded) |
| `dialecticMaxInputChars` | `10000` | Max chars for dialectic query input to `peer.chat()` |
| `sessionStrategy` | `'per-directory'` | `per-directory`, `per-repo`, `per-session`, `global` |

</details>

<details>
<summary>Minimal honcho.json (cloud)</summary>

```json
{
  "apiKey": "your-key-from-app.honcho.dev",
  "hosts": {
    "jarvis": {
      "enabled": true,
      "aiPeer": "jarvis",
      "peerName": "your-name",
      "workspace": "jarvis"
    }
  }
}
```

</details>

<details>
<summary>Minimal honcho.json (self-hosted)</summary>

```json
{
  "baseUrl": "http://localhost:8000",
  "hosts": {
    "jarvis": {
      "enabled": true,
      "aiPeer": "jarvis",
      "peerName": "your-name",
      "workspace": "jarvis"
    }
  }
}
```

</details>

:::tip Migrating from `jarvis honcho`
If you previously used `jarvis honcho setup`, your config and all server-side data are intact. Just re-enable through the setup wizard again or manually set `memory.provider: honcho` to reactivate via the new system.
:::

**Multi-peer setup:**

Honcho models conversations as peers exchanging messages — one user peer plus one AI peer per Jarvis profile, all sharing a workspace. The workspace is the shared environment: the user peer is global across profiles, each AI peer is its own identity. Every AI peer builds an independent representation / card from its own observations, so a `coder` profile stays code-oriented while a `writer` profile stays editorial against the same user.

The mapping:

| Concept | What it is |
|---------|-----------|
| **Workspace** | Shared environment. All Jarvis profiles under one workspace see the same user identity. |
| **User peer** (`peerName`) | The human. Shared across profiles in the workspace. |
| **AI peer** (`aiPeer`) | One per Jarvis profile. Host key `jarvis` → default; `jarvis.<profile>` for others. |
| **Observation** | Per-peer toggles controlling what Honcho models from whose messages. `directional` (default, all four on) or `unified` (single-observer pool). |

### New profile, fresh Honcho peer

```bash
jarvis profile create coder --clone
```

`--clone` creates a `jarvis.coder` host block in `honcho.json` with `aiPeer: "coder"`, shared `workspace`, inherited `peerName`, `recallMode`, `writeFrequency`, `observation`, etc. The AI peer is eagerly created in Honcho so it exists before the first message.

### Existing profiles, backfill Honcho peers

```bash
jarvis honcho sync
```

Scans every Jarvis profile, creates host blocks for any profile without one, inherits settings from the default `jarvis` block, and creates the new AI peers eagerly. Idempotent — skips profiles that already have a host block.

### Per-profile observation

Each host block can override the observation config independently. Example: a code-focused profile where the AI peer observes the user but doesn't self-model:

```json
"jarvis.coder": {
  "aiPeer": "coder",
  "observation": {
    "user": { "observeMe": true, "observeOthers": true },
    "ai":   { "observeMe": false, "observeOthers": true }
  }
}
```

**Observation toggles (one set per peer):**

| Toggle | Effect |
|--------|--------|
| `observeMe` | Honcho builds a representation of this peer from its own messages |
| `observeOthers` | This peer observes the other peer's messages (feeds cross-peer reasoning) |

Presets via `observationMode`:

- **`"directional"`** (default) — all four flags on. Full mutual observation; enables cross-peer dialectic.
- **`"unified"`** — user `observeMe: true`, AI `observeOthers: true`, rest false. Single-observer pool; AI models the user but not itself, user peer only self-models.

Server-side toggles set via the [Honcho dashboard](https://app.honcho.dev) win over local defaults — synced back at session init.

See the [Honcho page](./honcho.md#observation-directional-vs-unified) for the full observation reference.

<details>
<summary>Full honcho.json example (multi-profile)</summary>

```json
{
  "apiKey": "your-key",
  "workspace": "jarvis",
  "peerName": "eri",
  "hosts": {
    "jarvis": {
      "enabled": true,
      "aiPeer": "jarvis",
      "workspace": "jarvis",
      "peerName": "eri",
      "recallMode": "hybrid",
      "writeFrequency": "async",
      "sessionStrategy": "per-directory",
      "observation": {
        "user": { "observeMe": true, "observeOthers": true },
        "ai": { "observeMe": true, "observeOthers": true }
      },
      "dialecticReasoningLevel": "low",
      "dialecticDynamic": true,
      "dialecticCadence": 2,
      "dialecticDepth": 1,
      "dialecticMaxChars": 600,
      "contextCadence": 1,
      "messageMaxChars": 25000,
      "saveMessages": true
    },
    "jarvis.coder": {
      "enabled": true,
      "aiPeer": "coder",
      "workspace": "jarvis",
      "peerName": "eri",
      "recallMode": "tools",
      "observation": {
        "user": { "observeMe": true, "observeOthers": false },
        "ai": { "observeMe": true, "observeOthers": true }
      }
    },
    "jarvis.writer": {
      "enabled": true,
      "aiPeer": "writer",
      "workspace": "jarvis",
      "peerName": "eri"
    }
  },
  "sessions": {
    "/home/user/myproject": "myproject-main"
  }
}
```

</details>

See the [config reference](https://github.com/jarvis-ai/jarvis-agent/blob/main/plugins/memory/honcho/README.md) and [Honcho integration guide](https://docs.honcho.dev/v3/guides/integrations/jarvis).


---

### OpenViking

Context database by Volcengine (ByteDance) with filesystem-style knowledge hierarchy, tiered retrieval, and automatic memory extraction into 6 categories.

| | |
|---|---|
| **Best for** | Self-hosted knowledge management with structured browsing |
| **Requires** | `pip install openviking` + running server |
| **Data storage** | Self-hosted (local or cloud) |
| **Cost** | Free (open-source, AGPL-3.0) |

**Tools:** `viking_search` (semantic search), `viking_read` (tiered: abstract/overview/full), `viking_browse` (filesystem navigation), `viking_remember` (store facts), `viking_add_resource` (ingest URLs/docs)

**Setup:**
```bash
# Start the OpenViking server first
pip install openviking
openviking-server

# Then configure Jarvis
jarvis memory setup    # select "openviking"
# Or manually:
jarvis config set memory.provider openviking
echo "OPENVIKING_ENDPOINT=http://localhost:1933" >> ~/.jarvis/.env
```

**Key features:**
- Tiered context loading: L0 (~100 tokens) → L1 (~2k) → L2 (full)
- Automatic memory extraction on session commit (profile, preferences, entities, events, cases, patterns)
- `viking://` URI scheme for hierarchical knowledge browsing

---

### Mem0

Server-side LLM fact extraction with semantic search, reranking, and automatic deduplication.

| | |
|---|---|
| **Best for** | Hands-off memory management — Mem0 handles extraction automatically |
| **Requires** | `pip install mem0ai` + API key |
| **Data storage** | Mem0 Cloud |
| **Cost** | Mem0 pricing |

**Tools:** `mem0_profile` (all stored memories), `mem0_search` (semantic search + reranking), `mem0_conclude` (store verbatim facts)

**Setup:**
```bash
jarvis memory setup    # select "mem0"
# Or manually:
jarvis config set memory.provider mem0
echo "MEM0_API_KEY=your-key" >> ~/.jarvis/.env
```

**Config:** `$JARVIS_HOME/mem0.json`

| Key | Default | Description |
|-----|---------|-------------|
| `user_id` | `jarvis-user` | User identifier |
| `agent_id` | `jarvis` | Agent identifier |

---

### Hindsight

Long-term memory with knowledge graph, entity resolution, and multi-strategy retrieval. The `hindsight_reflect` tool provides cross-memory synthesis that no other provider offers. Automatically retains full conversation turns (including tool calls) with session-level document tracking.

| | |
|---|---|
| **Best for** | Knowledge graph-based recall with entity relationships |
| **Requires** | Cloud: API key from [ui.hindsight.vectorize.io](https://ui.hindsight.vectorize.io). Local: LLM API key (OpenAI, Groq, OpenRouter, etc.) |
| **Data storage** | Hindsight Cloud or local embedded PostgreSQL |
| **Cost** | Hindsight pricing (cloud) or free (local) |

**Tools:** `hindsight_retain` (store with entity extraction), `hindsight_recall` (multi-strategy search), `hindsight_reflect` (cross-memory synthesis)

**Setup:**
```bash
jarvis memory setup    # select "hindsight"
# Or manually:
jarvis config set memory.provider hindsight
echo "HINDSIGHT_API_KEY=your-key" >> ~/.jarvis/.env
```

The setup wizard installs dependencies automatically and only installs what's needed for the selected mode (`hindsight-client` for cloud, `hindsight-all` for local). Requires `hindsight-client >= 0.4.22` (auto-upgraded on session start if outdated).

**Local mode UI:** `hindsight-embed -p jarvis ui start`

**Config:** `$JARVIS_HOME/hindsight/config.json`

| Key | Default | Description |
|-----|---------|-------------|
| `mode` | `cloud` | `cloud` or `local` |
| `bank_id` | `jarvis` | Memory bank identifier |
| `recall_budget` | `mid` | Recall thoroughness: `low` / `mid` / `high` |
| `memory_mode` | `hybrid` | `hybrid` (context + tools), `context` (auto-inject only), `tools` (tools only) |
| `auto_retain` | `true` | Automatically retain conversation turns |
| `auto_recall` | `true` | Automatically recall memories before each turn |
| `retain_async` | `true` | Process retain asynchronously on the server |
| `retain_context` | `conversation between JARVIS and the User` | Context label for retained memories |
| `retain_tags` | — | Default tags applied to retained memories; merged with per-call tool tags |
| `retain_source` | — | Optional `metadata.source` attached to retained memories |
| `retain_user_prefix` | `User` | Label used before user turns in auto-retained transcripts |
| `retain_assistant_prefix` | `Assistant` | Label used before assistant turns in auto-retained transcripts |
| `recall_tags` | — | Tags to filter on recall |

See [plugin README](https://github.com/SethyPagna/Secretary-Jarvis/blob/main/plugins/memory/hindsight/README.md) for the full configuration reference.

---

### Holographic

Local SQLite fact store with FTS5 full-text search, trust scoring, and HRR (Holographic Reduced Representations) for compositional algebraic queries.

| | |
|---|---|
| **Best for** | Local-only memory with advanced retrieval, no external dependencies |
| **Requires** | Nothing (SQLite is always available). NumPy optional for HRR algebra. |
| **Data storage** | Local SQLite |
| **Cost** | Free |

**Tools:** `fact_store` (9 actions: add, search, probe, related, reason, contradict, update, remove, list), `fact_feedback` (helpful/unhelpful rating that trains trust scores)

**Setup:**
```bash
jarvis memory setup    # select "holographic"
# Or manually:
jarvis config set memory.provider holographic
```

**Config:** `config.yaml` under `plugins.jarvis-memory-store`

| Key | Default | Description |
|-----|---------|-------------|
| `db_path` | `$JARVIS_HOME/memory_store.db` | SQLite database path |
| `auto_extract` | `false` | Auto-extract facts at session end |
| `default_trust` | `0.5` | Default trust score (0.0–1.0) |

**Unique capabilities:**
- `probe` — entity-specific algebraic recall (all facts about a person/thing)
- `reason` — compositional AND queries across multiple entities
- `contradict` — automated detection of conflicting facts
- Trust scoring with asymmetric feedback (+0.05 helpful / -0.10 unhelpful)

---

### RetainDB

Cloud memory API with hybrid search (Vector + BM25 + Reranking), 7 memory types, and delta compression.

| | |
|---|---|
| **Best for** | Teams already using RetainDB's infrastructure |
| **Requires** | RetainDB account + API key |
| **Data storage** | RetainDB Cloud |
| **Cost** | $20/month |

**Tools:** `retaindb_profile` (user profile), `retaindb_search` (semantic search), `retaindb_context` (task-relevant context), `retaindb_remember` (store with type + importance), `retaindb_forget` (delete memories)

**Setup:**
```bash
jarvis memory setup    # select "retaindb"
# Or manually:
jarvis config set memory.provider retaindb
echo "RETAINDB_API_KEY=your-key" >> ~/.jarvis/.env
```

---

### ByteRover

Persistent memory via the `brv` CLI — hierarchical knowledge tree with tiered retrieval (fuzzy text → LLM-driven search). Local-first with optional cloud sync.

| | |
|---|---|
| **Best for** | Developers who want portable, local-first memory with a CLI |
| **Requires** | ByteRover CLI (`npm install -g byterover-cli` or [install script](https://byterover.dev)) |
| **Data storage** | Local (default) or ByteRover Cloud (optional sync) |
| **Cost** | Free (local) or ByteRover pricing (cloud) |

**Tools:** `brv_query` (search knowledge tree), `brv_curate` (store facts/decisions/patterns), `brv_status` (CLI version + tree stats)

**Setup:**
```bash
# Install the CLI first
curl -fsSL https://byterover.dev/install.sh | sh

# Then configure Jarvis
jarvis memory setup    # select "byterover"
# Or manually:
jarvis config set memory.provider byterover
```

**Key features:**
- Automatic pre-compression extraction (saves insights before context compression discards them)
- Knowledge tree stored at `$JARVIS_HOME/byterover/` (profile-scoped)
- SOC2 Type II certified cloud sync (optional)

---

### Supermemory

Semantic long-term memory with profile recall, semantic search, explicit memory tools, and session-end conversation ingest via the Supermemory graph API.

| | |
|---|---|
| **Best for** | Semantic recall with user profiling and session-level graph building |
| **Requires** | `pip install supermemory` + [API key](https://supermemory.ai) |
| **Data storage** | Supermemory Cloud |
| **Cost** | Supermemory pricing |

**Tools:** `supermemory_store` (save explicit memories), `supermemory_search` (semantic similarity search), `supermemory_forget` (forget by ID or best-match query), `supermemory_profile` (persistent profile + recent context)

**Setup:**
```bash
jarvis memory setup    # select "supermemory"
# Or manually:
jarvis config set memory.provider supermemory
echo 'SUPERMEMORY_API_KEY=***' >> ~/.jarvis/.env
```

**Config:** `$JARVIS_HOME/supermemory.json`

| Key | Default | Description |
|-----|---------|-------------|
| `container_tag` | `jarvis` | Container tag used for search and writes. Supports `{identity}` template for profile-scoped tags. |
| `auto_recall` | `true` | Inject relevant memory context before turns |
| `auto_capture` | `true` | Store cleaned user-assistant turns after each response |
| `max_recall_results` | `10` | Max recalled items to format into context |
| `profile_frequency` | `50` | Include profile facts on first turn and every N turns |
| `capture_mode` | `all` | Skip tiny or trivial turns by default |
| `search_mode` | `hybrid` | Search mode: `hybrid`, `memories`, or `documents` |
| `api_timeout` | `5.0` | Timeout for SDK and ingest requests |

**Environment variables:** `SUPERMEMORY_API_KEY` (required), `SUPERMEMORY_CONTAINER_TAG` (overrides config).

**Key features:**
- Automatic context fencing — strips recalled memories from captured turns to prevent recursive memory pollution
- Session-end conversation ingest for richer graph-level knowledge building
- Profile facts injected on first turn and at configurable intervals
- Trivial message filtering (skips "ok", "thanks", etc.)
- **Profile-scoped containers** — use `{identity}` in `container_tag` (e.g. `jarvis-{identity}` → `jarvis-coder`) to isolate memories per Jarvis profile
- **Multi-container mode** — enable `enable_custom_container_tags` with a `custom_containers` list to let the agent read/write across named containers. Automatic operations (sync, prefetch) stay on the primary container.

<details>
<summary>Multi-container example</summary>

```json
{
  "container_tag": "jarvis",
  "enable_custom_container_tags": true,
  "custom_containers": ["project-alpha", "shared-knowledge"],
  "custom_container_instructions": "Use project-alpha for coding context."
}
```

</details>

**Support:** [Discord](https://supermemory.link/discord) · [support@supermemory.com](mailto:support@supermemory.com)

---

## Provider Comparison

| Provider | Storage | Cost | Tools | Dependencies | Unique Feature |
|----------|---------|------|-------|-------------|----------------|
| **Honcho** | Cloud | Paid | 5 | `honcho-ai` | Dialectic user modeling + session-scoped context |
| **OpenViking** | Self-hosted | Free | 5 | `openviking` + server | Filesystem hierarchy + tiered loading |
| **Mem0** | Cloud | Paid | 3 | `mem0ai` | Server-side LLM extraction |
| **Hindsight** | Cloud/Local | Free/Paid | 3 | `hindsight-client` | Knowledge graph + reflect synthesis |
| **Holographic** | Local | Free | 2 | None | HRR algebra + trust scoring |
| **RetainDB** | Cloud | $20/mo | 5 | `requests` | Delta compression |
| **ByteRover** | Local/Cloud | Free/Paid | 3 | `brv` CLI | Pre-compression extraction |
| **Supermemory** | Cloud | Paid | 4 | `supermemory` | Context fencing + session graph ingest + multi-container |

## Profile Isolation

Each provider's data is isolated per [profile](/docs/user-guide/profiles):

- **Local storage providers** (Holographic, ByteRover) use `$JARVIS_HOME/` paths which differ per profile
- **Config file providers** (Honcho, Mem0, Hindsight, Supermemory) store config in `$JARVIS_HOME/` so each profile has its own credentials
- **Cloud providers** (RetainDB) auto-derive profile-scoped project names
- **Env var providers** (OpenViking) are configured via each profile's `.env` file

## Building a Memory Provider

See the [Developer Guide: Memory Provider Plugins](/docs/developer-guide/memory-provider-plugin) for how to create your own.

## Source: `developer-guide/memory-provider-plugin.md`

---
sidebar_position: 8
title: "Memory Provider Plugins"
description: "How to build a memory provider plugin for JARVIS"
---

# Building a Memory Provider Plugin

Memory provider plugins give JARVIS persistent, cross-session knowledge beyond the built-in MEMORY.md and USER.md. This guide covers how to build one.

:::tip
Memory providers are one of two **provider plugin** types. The other is [Context Engine Plugins](/docs/developer-guide/context-engine-plugin), which replace the built-in context compressor. Both follow the same pattern: single-select, config-driven, managed via `jarvis plugins`.
:::

## Directory Structure

Each memory provider lives in `plugins/memory/<name>/`:

```
plugins/memory/my-provider/
├── __init__.py      # MemoryProvider implementation + register() entry point
├── plugin.yaml      # Metadata (name, description, hooks)
└── README.md        # Setup instructions, config reference, tools
```

## The MemoryProvider ABC

Your plugin implements the `MemoryProvider` abstract base class from `agent/memory_provider.py`:

```python
from agent.memory_provider import MemoryProvider

class MyMemoryProvider(MemoryProvider):
    @property
    def name(self) -> str:
        return "my-provider"

    def is_available(self) -> bool:
        """Check if this provider can activate. NO network calls."""
        return bool(os.environ.get("MY_API_KEY"))

    def initialize(self, session_id: str, **kwargs) -> None:
        """Called once at agent startup.

        kwargs always includes:
          jarvis_home (str): Active JARVIS_HOME path. Use for storage.
        """
        self._api_key = os.environ.get("MY_API_KEY", "")
        self._session_id = session_id

    # ... implement remaining methods
```

## Required Methods

### Core Lifecycle

| Method | When Called | Must Implement? |
|--------|-----------|-----------------|
| `name` (property) | Always | **Yes** |
| `is_available()` | Agent init, before activation | **Yes** — no network calls |
| `initialize(session_id, **kwargs)` | Agent startup | **Yes** |
| `get_tool_schemas()` | After init, for tool injection | **Yes** |
| `handle_tool_call(name, args)` | When agent uses your tools | **Yes** (if you have tools) |

### Config

| Method | Purpose | Must Implement? |
|--------|---------|-----------------|
| `get_config_schema()` | Declare config fields for `jarvis memory setup` | **Yes** |
| `save_config(values, jarvis_home)` | Write non-secret config to native location | **Yes** (unless env-var-only) |

### Optional Hooks

| Method | When Called | Use Case |
|--------|-----------|----------|
| `system_prompt_block()` | System prompt assembly | Static provider info |
| `prefetch(query)` | Before each API call | Return recalled context |
| `queue_prefetch(query)` | After each turn | Pre-warm for next turn |
| `sync_turn(user, assistant)` | After each completed turn | Persist conversation |
| `on_session_end(messages)` | Conversation ends | Final extraction/flush |
| `on_pre_compress(messages)` | Before context compression | Save insights before discard |
| `on_memory_write(action, target, content)` | Built-in memory writes | Mirror to your backend |
| `shutdown()` | Process exit | Clean up connections |

## Config Schema

`get_config_schema()` returns a list of field descriptors used by `jarvis memory setup`:

```python
def get_config_schema(self):
    return [
        {
            "key": "api_key",
            "description": "My Provider API key",
            "secret": True,           # → written to .env
            "required": True,
            "env_var": "MY_API_KEY",   # explicit env var name
            "url": "https://my-provider.com/keys",  # where to get it
        },
        {
            "key": "region",
            "description": "Server region",
            "default": "us-east",
            "choices": ["us-east", "eu-west", "ap-south"],
        },
        {
            "key": "project",
            "description": "Project identifier",
            "default": "jarvis",
        },
    ]
```

Fields with `secret: True` and `env_var` go to `.env`. Non-secret fields are passed to `save_config()`.

:::tip Minimal vs Full Schema
Every field in `get_config_schema()` is prompted during `jarvis memory setup`. Providers with many options should keep the schema minimal — only include fields the user **must** configure (API key, required credentials). Document optional settings in a config file reference (e.g. `$JARVIS_HOME/myprovider.json`) rather than prompting for them all during setup. This keeps the setup wizard fast while still supporting advanced configuration. See the Supermemory provider for an example — it only prompts for the API key; all other options live in `supermemory.json`.
:::

## Save Config

```python
def save_config(self, values: dict, jarvis_home: str) -> None:
    """Write non-secret config to your native location."""
    import json
    from pathlib import Path
    config_path = Path(jarvis_home) / "my-provider.json"
    config_path.write_text(json.dumps(values, indent=2))
```

For env-var-only providers, leave the default no-op.

## Plugin Entry Point

```python
def register(ctx) -> None:
    """Called by the memory plugin discovery system."""
    ctx.register_memory_provider(MyMemoryProvider())
```

## plugin.yaml

```yaml
name: my-provider
version: 1.0.0
description: "Short description of what this provider does."
hooks:
  - on_session_end    # list hooks you implement
```

## Threading Contract

**`sync_turn()` MUST be non-blocking.** If your backend has latency (API calls, LLM processing), run the work in a daemon thread:

```python
def sync_turn(self, user_content, assistant_content):
    def _sync():
        try:
            self._api.ingest(user_content, assistant_content)
        except Exception as e:
            logger.warning("Sync failed: %s", e)

    if self._sync_thread and self._sync_thread.is_alive():
        self._sync_thread.join(timeout=5.0)
    self._sync_thread = threading.Thread(target=_sync, daemon=True)
    self._sync_thread.start()
```

## Profile Isolation

All storage paths **must** use the `jarvis_home` kwarg from `initialize()`, not hardcoded `~/.jarvis`:

```python
# CORRECT — profile-scoped
from jarvis_cli.constants import get_jarvis_home
data_dir = get_jarvis_home() / "my-provider"

# WRONG — shared across all profiles
data_dir = Path("~/.jarvis/my-provider").expanduser()
```

## Testing

See `tests/agent/test_memory_plugin_e2e.py` for the complete E2E testing pattern using a real SQLite provider.

```python
from agent.memory_manager import MemoryManager

mgr = MemoryManager()
mgr.add_provider(my_provider)
mgr.initialize_all(session_id="test-1", platform="cli")

# Test tool routing
result = mgr.handle_tool_call("my_tool", {"action": "add", "content": "test"})

# Test lifecycle
mgr.sync_all("user msg", "assistant msg")
mgr.on_session_end([])
mgr.shutdown_all()
```

## Adding CLI Commands

Memory provider plugins can register their own CLI subcommand tree (e.g. `jarvis my-provider status`, `jarvis my-provider config`). This uses a convention-based discovery system — no changes to core files needed.

### How it works

1. Add a `cli.py` file to your plugin directory
2. Define a `register_cli(subparser)` function that builds the argparse tree
3. The memory plugin system discovers it at startup via `discover_plugin_cli_commands()`
4. Your commands appear under `jarvis <provider-name> <subcommand>`

**Active-provider gating:** Your CLI commands only appear when your provider is the active `memory.provider` in config. If a user hasn't configured your provider, your commands won't show in `jarvis --help`.

### Example

```python
# plugins/memory/my-provider/cli.py

def my_command(args):
    """Handler dispatched by argparse."""
    sub = getattr(args, "my_command", None)
    if sub == "status":
        print("Provider is active and connected.")
    elif sub == "config":
        print("Showing config...")
    else:
        print("Usage: jarvis my-provider <status|config>")

def register_cli(subparser) -> None:
    """Build the jarvis my-provider argparse tree.

    Called by discover_plugin_cli_commands() at argparse setup time.
    """
    subs = subparser.add_subparsers(dest="my_command")
    subs.add_parser("status", help="Show provider status")
    subs.add_parser("config", help="Show provider config")
    subparser.set_defaults(func=my_command)
```

### Reference implementation

See `plugins/memory/honcho/cli.py` for a full example with 13 subcommands, cross-profile management (`--target-profile`), and config read/write.

### Directory structure with CLI

```
plugins/memory/my-provider/
├── __init__.py      # MemoryProvider implementation + register()
├── plugin.yaml      # Metadata
├── cli.py           # register_cli(subparser) — CLI commands
└── README.md        # Setup instructions
```

## Single Provider Rule

Only **one** external memory provider can be active at a time. If a user tries to register a second, the MemoryManager rejects it with a warning. This prevents tool schema bloat and conflicting backends.

## Source: `developer-guide/session-storage.md`

# Session Storage

JARVIS uses a SQLite database (`~/.jarvis/state.db`) to persist session
metadata, full message history, and model configuration across CLI and gateway
sessions. This replaces the earlier per-session JSONL file approach.

Source file: `jarvis_state.py`


## Architecture Overview

```
~/.jarvis/state.db (SQLite, WAL mode)
├── sessions              — Session metadata, token counts, billing
├── messages              — Full message history per session
├── messages_fts          — FTS5 virtual table (content + tool_name + tool_calls)
├── messages_fts_trigram  — FTS5 virtual table with trigram tokenizer (CJK / substring search)
├── state_meta            — Key/value metadata table
└── schema_version        — Single-row table tracking migration state
```

Key design decisions:
- **WAL mode** for concurrent readers + one writer (gateway multi-platform)
- **FTS5 virtual table** for fast text search across all session messages
- **Session lineage** via `parent_session_id` chains (compression-triggered splits)
- **Source tagging** (`cli`, `telegram`, `discord`, etc.) for platform filtering
- Batch runner and RL trajectories are NOT stored here (separate systems)


## SQLite Schema

### Sessions Table

```sql
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    user_id TEXT,
    model TEXT,
    model_config TEXT,
    system_prompt TEXT,
    parent_session_id TEXT,
    started_at REAL NOT NULL,
    ended_at REAL,
    end_reason TEXT,
    message_count INTEGER DEFAULT 0,
    tool_call_count INTEGER DEFAULT 0,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cache_read_tokens INTEGER DEFAULT 0,
    cache_write_tokens INTEGER DEFAULT 0,
    reasoning_tokens INTEGER DEFAULT 0,
    billing_provider TEXT,
    billing_base_url TEXT,
    billing_mode TEXT,
    estimated_cost_usd REAL,
    actual_cost_usd REAL,
    cost_status TEXT,
    cost_source TEXT,
    pricing_version TEXT,
    title TEXT,
    api_call_count INTEGER DEFAULT 0,
    FOREIGN KEY (parent_session_id) REFERENCES sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_source ON sessions(source);
CREATE INDEX IF NOT EXISTS idx_sessions_parent ON sessions(parent_session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_title_unique
    ON sessions(title) WHERE title IS NOT NULL;
```

### Messages Table

```sql
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    role TEXT NOT NULL,
    content TEXT,
    tool_call_id TEXT,
    tool_calls TEXT,
    tool_name TEXT,
    timestamp REAL NOT NULL,
    token_count INTEGER,
    finish_reason TEXT,
    reasoning TEXT,
    reasoning_content TEXT,
    reasoning_details TEXT,
    codex_reasoning_items TEXT,
    codex_message_items TEXT
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, timestamp);
```

Notes:
- `tool_calls` is stored as a JSON string (serialized list of tool call objects)
- `reasoning_details`, `codex_reasoning_items`, and `codex_message_items` are stored as JSON strings
- `reasoning` stores the raw reasoning text for providers that expose it
- Timestamps are Unix epoch floats (`time.time()`)

### FTS5 Full-Text Search

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
    content,
    content=messages,
    content_rowid=id
);
```

The FTS5 table is kept in sync via three triggers that fire on INSERT, UPDATE,
and DELETE of the `messages` table:

```sql
CREATE TRIGGER IF NOT EXISTS messages_fts_insert AFTER INSERT ON messages BEGIN
    INSERT INTO messages_fts(rowid, content) VALUES (new.id, new.content);
END;

CREATE TRIGGER IF NOT EXISTS messages_fts_delete AFTER DELETE ON messages BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, content)
        VALUES('delete', old.id, old.content);
END;

CREATE TRIGGER IF NOT EXISTS messages_fts_update AFTER UPDATE ON messages BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, content)
        VALUES('delete', old.id, old.content);
    INSERT INTO messages_fts(rowid, content) VALUES (new.id, new.content);
END;
```


## Schema Version and Migrations

Current schema version: **11**

The `schema_version` table stores a single integer. Simple column additions are handled declaratively by `_reconcile_columns()` (which diffs live columns against `SCHEMA_SQL` and ADDs any missing ones). The version-gated chain is reserved for data migrations and index/FTS changes that can't be expressed declaratively:

| Version | Change |
|---------|--------|
| 1 | Initial schema (sessions, messages, FTS5) |
| 2 | Add `finish_reason` column to messages |
| 3 | Add `title` column to sessions |
| 4 | Add unique index on `title` (NULLs allowed, non-NULL must be unique) |
| 5 | Add billing columns: `cache_read_tokens`, `cache_write_tokens`, `reasoning_tokens`, `billing_provider`, `billing_base_url`, `billing_mode`, `estimated_cost_usd`, `actual_cost_usd`, `cost_status`, `cost_source`, `pricing_version` |
| 6 | Add reasoning columns to messages: `reasoning`, `reasoning_details`, `codex_reasoning_items` |
| 7 | Add `reasoning_content` column to messages |
| 8 | Add `api_call_count` column to sessions |
| 9 | Add `codex_message_items` column to messages for Codex Responses message id/phase replay |
| 10 | Add `messages_fts_trigram` virtual table (trigram tokenizer for CJK / substring search) and backfill existing rows |
| 11 | Re-index `messages_fts` and `messages_fts_trigram` to cover `tool_name` + `tool_calls` and switch from external-content to inline mode; drop old triggers and backfill every message row |

Declarative column adds use `ALTER TABLE ADD COLUMN` wrapped in try/except to handle the column-already-exists case (idempotent). The version number is bumped after each successful migration block.


## Write Contention Handling

Multiple jarvis processes (gateway + CLI sessions + worktree agents) share one
`state.db`. The `SessionDB` class handles write contention with:

- **Short SQLite timeout** (1 second) instead of the default 30s
- **Application-level retry** with random jitter (20-150ms, up to 15 retries)
- **BEGIN IMMEDIATE** transactions to surface lock contention at transaction start
- **Periodic WAL checkpoints** every 50 successful writes (PASSIVE mode)

This avoids the "convoy effect" where SQLite's deterministic internal backoff
causes all competing writers to retry at the same intervals.

```
_WRITE_MAX_RETRIES = 15
_WRITE_RETRY_MIN_S = 0.020   # 20ms
_WRITE_RETRY_MAX_S = 0.150   # 150ms
_CHECKPOINT_EVERY_N_WRITES = 50
```


## Common Operations

### Initialize

```python
from jarvis_state import SessionDB

db = SessionDB()                           # Default: ~/.jarvis/state.db
db = SessionDB(db_path=Path("/tmp/test.db"))  # Custom path
```

### Create and Manage Sessions

```python
# Create a new session
db.create_session(
    session_id="sess_abc123",
    source="cli",
    model="anthropic/claude-sonnet-4.6",
    user_id="user_1",
    parent_session_id=None,  # or previous session ID for lineage
)

# End a session
db.end_session("sess_abc123", end_reason="user_exit")

# Reopen a session (clear ended_at/end_reason)
db.reopen_session("sess_abc123")
```

### Store Messages

```python
msg_id = db.append_message(
    session_id="sess_abc123",
    role="assistant",
    content="Here's the answer...",
    tool_calls=[{"id": "call_1", "function": {"name": "terminal", "arguments": "{}"}}],
    token_count=150,
    finish_reason="stop",
    reasoning="Let me think about this...",
)
```

### Retrieve Messages

```python
# Raw messages with all metadata
messages = db.get_messages("sess_abc123")

# OpenAI conversation format (for API replay)
conversation = db.get_messages_as_conversation("sess_abc123")
# Returns: [{"role": "user", "content": "..."}, {"role": "assistant", ...}]
```

### Session Titles

```python
# Set a title (must be unique among non-NULL titles)
db.set_session_title("sess_abc123", "Fix Docker Build")

# Resolve by title (returns most recent in lineage)
session_id = db.resolve_session_by_title("Fix Docker Build")

# Auto-generate next title in lineage
next_title = db.get_next_title_in_lineage("Fix Docker Build")
# Returns: "Fix Docker Build #2"
```


## Full-Text Search

The `search_messages()` method supports FTS5 query syntax with automatic
sanitization of user input.

### Basic Search

```python
results = db.search_messages("docker deployment")
```

### FTS5 Query Syntax

| Syntax | Example | Meaning |
|--------|---------|---------|
| Keywords | `docker deployment` | Both terms (implicit AND) |
| Quoted phrase | `"exact phrase"` | Exact phrase match |
| Boolean OR | `docker OR kubernetes` | Either term |
| Boolean NOT | `python NOT java` | Exclude term |
| Prefix | `deploy*` | Prefix match |

### Filtered Search

```python
# Search only CLI sessions
results = db.search_messages("error", source_filter=["cli"])

# Exclude gateway sessions
results = db.search_messages("bug", exclude_sources=["telegram", "discord"])

# Search only user messages
results = db.search_messages("help", role_filter=["user"])
```

### Search Results Format

Each result includes:
- `id`, `session_id`, `role`, `timestamp`
- `snippet` — FTS5-generated snippet with `>>>match<<<` markers
- `context` — 1 message before and after the match (content truncated to 200 chars)
- `source`, `model`, `session_started` — from the parent session

The `_sanitize_fts5_query()` method handles edge cases:
- Strips unmatched quotes and special characters
- Wraps hyphenated terms in quotes (`chat-send` → `"chat-send"`)
- Removes dangling boolean operators (`hello AND` → `hello`)


## Session Lineage

Sessions can form chains via `parent_session_id`. This happens when context
compression triggers a session split in the gateway.

### Query: Find Session Lineage

```sql
-- Find all ancestors of a session
WITH RECURSIVE lineage AS (
    SELECT * FROM sessions WHERE id = ?
    UNION ALL
    SELECT s.* FROM sessions s
    JOIN lineage l ON s.id = l.parent_session_id
)
SELECT id, title, started_at, parent_session_id FROM lineage;

-- Find all descendants of a session
WITH RECURSIVE descendants AS (
    SELECT * FROM sessions WHERE id = ?
    UNION ALL
    SELECT s.* FROM sessions s
    JOIN descendants d ON s.parent_session_id = d.id
)
SELECT id, title, started_at FROM descendants;
```

### Query: Recent Sessions with Preview

```sql
SELECT s.*,
    COALESCE(
        (SELECT SUBSTR(m.content, 1, 63)
         FROM messages m
         WHERE m.session_id = s.id AND m.role = 'user' AND m.content IS NOT NULL
         ORDER BY m.timestamp, m.id LIMIT 1),
        ''
    ) AS preview,
    COALESCE(
        (SELECT MAX(m2.timestamp) FROM messages m2 WHERE m2.session_id = s.id),
        s.started_at
    ) AS last_active
FROM sessions s
ORDER BY s.started_at DESC
LIMIT 20;
```

### Query: Token Usage Statistics

```sql
-- Total tokens by model
SELECT model,
       COUNT(*) as session_count,
       SUM(input_tokens) as total_input,
       SUM(output_tokens) as total_output,
       SUM(estimated_cost_usd) as total_cost
FROM sessions
WHERE model IS NOT NULL
GROUP BY model
ORDER BY total_cost DESC;

-- Sessions with highest token usage
SELECT id, title, model, input_tokens + output_tokens AS total_tokens,
       estimated_cost_usd
FROM sessions
ORDER BY total_tokens DESC
LIMIT 10;
```


## Export and Cleanup

```python
# Export a single session with messages
data = db.export_session("sess_abc123")

# Export all sessions (with messages) as list of dicts
all_data = db.export_all(source="cli")

# Delete old sessions (only ended sessions)
deleted_count = db.prune_sessions(older_than_days=90)
deleted_count = db.prune_sessions(older_than_days=30, source="telegram")

# Clear messages but keep the session record
db.clear_messages("sess_abc123")

# Delete session and all messages
db.delete_session("sess_abc123")
```


## Database Location

Default path: `~/.jarvis/state.db`

This is derived from `jarvis_cli.constants.get_jarvis_home()` which resolves to
`~/.jarvis/` by default, or the value of `JARVIS_HOME` environment variable.

The database file, WAL file (`state.db-wal`), and shared-memory file
(`state.db-shm`) are all created in the same directory.
