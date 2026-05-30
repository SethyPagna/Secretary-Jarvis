# Skills Hub

> Imported from the local source documentation and rewritten for the JARVIS desktop-first app. Run commands from the integrated Home terminal unless a section explicitly refers to packaging or automation.

## Source: `user-guide/features/skills.md`

---
sidebar_position: 2
title: "Skills System"
description: "On-demand knowledge documents — progressive disclosure, agent-managed skills, and the Skills Hub"
---

# Skills System

Skills are on-demand knowledge documents the agent can load when needed. They follow a **progressive disclosure** pattern to minimize token usage and are compatible with the [agentskills.io](https://agentskills.io/specification) open standard.

All skills live in **`~/.jarvis/skills/`** — the primary directory and source of truth. On fresh install, bundled skills are copied from the repo. Hub-installed and agent-created skills also go here. The agent can modify or delete any skill.

You can also point Jarvis at **external skill directories** — additional folders scanned alongside the local one. See [External Skill Directories](#external-skill-directories) below.

See also:

- [Bundled Skills Catalog](/docs/reference/skills-catalog)
- [Official Optional Skills Catalog](/docs/reference/optional-skills-catalog)

## Using Skills

Every installed skill is automatically available as a slash command:

```bash
# In the CLI or any messaging platform:
/gif-search funny cats
/axolotl help me fine-tune Llama 3 on my dataset
/github-pr-workflow create a PR for the auth refactor
/plan design a rollout for migrating our auth provider

# Just the skill name loads it and lets the agent ask what you need:
/excalidraw
```

The bundled `plan` skill is a good example. Running `/plan [request]` loads the skill's instructions, telling Jarvis to inspect context if needed, write a markdown implementation plan instead of executing the task, and save the result under `.jarvis/plans/` relative to the active workspace/backend working directory.

You can also interact with skills through natural conversation:

```bash
jarvis chat --toolsets skills -q "What skills do you have?"
jarvis chat --toolsets skills -q "Show me the axolotl skill"
```

## Progressive Disclosure

Skills use a token-efficient loading pattern:

```
Level 0: skills_list()           → [{name, description, category}, ...]   (~3k tokens)
Level 1: skill_view(name)        → Full content + metadata       (varies)
Level 2: skill_view(name, path)  → Specific reference file       (varies)
```

The agent only loads the full skill content when it actually needs it.

## SKILL.md Format

```markdown
---
name: my-skill
description: Brief description of what this skill does
version: 1.0.0
platforms: [macos, linux]     # Optional — restrict to specific OS platforms
metadata:
  jarvis:
    tags: [python, automation]
    category: devops
    fallback_for_toolsets: [web]    # Optional — conditional activation (see below)
    requires_toolsets: [terminal]   # Optional — conditional activation (see below)
    config:                          # Optional — config.yaml settings
      - key: my.setting
        description: "What this controls"
        default: "value"
        prompt: "Prompt for setup"
---

# Skill Title

## When to Use
Trigger conditions for this skill.

## Procedure
1. Step one
2. Step two

## Pitfalls
- Known failure modes and fixes

## Verification
How to confirm it worked.
```

### Platform-Specific Skills

Skills can restrict themselves to specific operating systems using the `platforms` field:

| Value | Matches |
|-------|---------|
| `macos` | macOS (Darwin) |
| `linux` | Linux |
| `windows` | Windows |

```yaml
platforms: [macos]            # macOS only (e.g., iMessage, Apple Reminders, FindMy)
platforms: [macos, linux]     # macOS and Linux
```

When set, the skill is automatically hidden from the system prompt, `skills_list()`, and slash commands on incompatible platforms. If omitted, the skill loads on all platforms.

## Skill output and media delivery

When a skill response (or any agent response) includes a bare absolute path to a media file — for example `/home/user/screenshots/diagram.png` — the gateway auto-detects it, strips it from the visible text, and delivers the file natively to the user's chat (Telegram photo, Discord attachment, etc.) instead of leaving the raw path in the message.

For audio specifically, the `[[audio_as_voice]]` directive promotes audio files to native voice-message bubbles on platforms that support them (Telegram, WhatsApp).

### Forcing document-style delivery: `[[as_document]]`

Sometimes you want the **opposite** of inline preview: you want the file delivered as a downloadable attachment, not a re-compressed image bubble. The classic example is a high-resolution screenshot or chart — Telegram's `sendPhoto` recompresses it to ~200 KB at 1280 px, destroying readability. A 1-2 MB PNG sent via `sendDocument` keeps the original bytes intact.

If a response (or any text inside it — typically the last line) contains the literal directive `[[as_document]]`, every media path extracted from that response is delivered as a document/file attachment rather than an image bubble:

```
Here is your rendered chart:

/home/user/.jarvis/cache/chart-q4-2025.png

[[as_document]]
```

The directive is stripped before delivery, so users never see it. Granularity is intentionally all-or-nothing per response: emit `[[as_document]]` once and every image path in the same response is delivered as a document. This mirrors the scope of `[[audio_as_voice]]`.

Use it from a skill when:

- You produce screenshots or charts the user needs as files (for editing in another tool, archiving, sharing intact).
- The default lossy preview would obscure detail (small text, pixel-accurate diagrams, color-sensitive renders).

Platforms without a separate document path (e.g. SMS) fall back to whatever attachment mechanism they have.

### Conditional Activation (Fallback Skills)

Skills can automatically show or hide themselves based on which tools are available in the current session. This is most useful for **fallback skills** — free or local alternatives that should only appear when a premium tool is unavailable.

```yaml
metadata:
  jarvis:
    fallback_for_toolsets: [web]      # Show ONLY when these toolsets are unavailable
    requires_toolsets: [terminal]     # Show ONLY when these toolsets are available
    fallback_for_tools: [web_search]  # Show ONLY when these specific tools are unavailable
    requires_tools: [terminal]        # Show ONLY when these specific tools are available
```

| Field | Behavior |
|-------|----------|
| `fallback_for_toolsets` | Skill is **hidden** when the listed toolsets are available. Shown when they're missing. |
| `fallback_for_tools` | Same, but checks individual tools instead of toolsets. |
| `requires_toolsets` | Skill is **hidden** when the listed toolsets are unavailable. Shown when they're present. |
| `requires_tools` | Same, but checks individual tools. |

**Example:** The built-in `duckduckgo-search` skill uses `fallback_for_toolsets: [web]`. When you have `FIRECRAWL_API_KEY` set, the web toolset is available and the agent uses `web_search` — the DuckDuckGo skill stays hidden. If the API key is missing, the web toolset is unavailable and the DuckDuckGo skill automatically appears as a fallback.

Skills without any conditional fields behave exactly as before — they're always shown.

## Secure Setup on Load

Skills can declare required environment variables without disappearing from discovery:

```yaml
required_environment_variables:
  - name: TENOR_API_KEY
    prompt: Tenor API key
    help: Get a key from https://developers.google.com/tenor
    required_for: full functionality
```

When a missing value is encountered, Jarvis asks for it securely only when the skill is actually loaded in the local CLI. You can skip setup and keep using the skill. Messaging surfaces never ask for secrets in chat — they tell you to use `jarvis setup` or `~/.jarvis/.env` locally instead.

Once set, declared env vars are **automatically passed through** to `execute_code` and `terminal` sandboxes — the skill's scripts can use `$TENOR_API_KEY` directly. For non-skill env vars, use the `terminal.env_passthrough` config option. See [Environment Variable Passthrough](/docs/user-guide/security#environment-variable-passthrough) for details.

### Skill Config Settings

Skills can also declare non-secret config settings (paths, preferences) stored in `config.yaml`:

```yaml
metadata:
  jarvis:
    config:
      - key: myplugin.path
        description: Path to the plugin data directory
        default: "~/myplugin-data"
        prompt: Plugin data directory path
```

Settings are stored under `skills.config` in your config.yaml. `jarvis config migrate` prompts for unconfigured settings, and `jarvis config show` displays them. When a skill loads, its resolved config values are injected into the context so the agent knows the configured values automatically.

See [Skill Settings](/docs/user-guide/configuration#skill-settings) and [Creating Skills — Config Settings](/docs/developer-guide/creating-skills#config-settings-configyaml) for details.

## Skill Directory Structure

```text
~/.jarvis/skills/                  # Single source of truth
├── mlops/                         # Category directory
│   ├── axolotl/
│   │   ├── SKILL.md               # Main instructions (required)
│   │   ├── references/            # Additional docs
│   │   ├── templates/             # Output formats
│   │   ├── scripts/               # Helper scripts callable from the skill
│   │   └── assets/                # Supplementary files
│   └── vllm/
│       └── SKILL.md
├── devops/
│   └── deploy-k8s/                # Agent-created skill
│       ├── SKILL.md
│       └── references/
├── .hub/                          # Skills Hub state
│   ├── lock.json
│   ├── quarantine/
│   └── audit.log
└── .bundled_manifest              # Tracks seeded bundled skills
```

## External Skill Directories

If you maintain skills outside of Jarvis — for example, a shared `~/.agents/skills/` directory used by multiple AI tools — you can tell Jarvis to scan those directories too.

Add `external_dirs` under the `skills` section in `~/.jarvis/config.yaml`:

```yaml
skills:
  external_dirs:
    - ~/.agents/skills
    - /home/shared/team-skills
    - ${SKILLS_REPO}/skills
```

Paths support `~` expansion and `${VAR}` environment variable substitution.

### How it works

- **Create locally, update in place**: New agent-created skills are written to `~/.jarvis/skills/`. Existing skills are modified where they are found, including skills under `external_dirs`, when the agent uses `skill_manage` actions such as `patch`, `edit`, `write_file`, `remove_file`, or `delete`.
- **External dirs are not a write-protection boundary**: If an external skill directory is writable by the Jarvis process, agent-managed skill updates can change files in that directory. Use filesystem permissions or a separate profile/toolset setup if shared external skills must stay read-only.
- **Local precedence**: If the same skill name exists in both the local dir and an external dir, the local version wins.
- **Full integration**: External skills appear in the system prompt index, `skills_list`, `skill_view`, and as `/skill-name` slash commands — no different from local skills.
- **Non-existent paths are silently skipped**: If a configured directory doesn't exist, Jarvis ignores it without errors. Useful for optional shared directories that may not be present on every machine.

### Example

```text
~/.jarvis/skills/               # Local (primary, read-write)
├── devops/deploy-k8s/
│   └── SKILL.md
└── mlops/axolotl/
    └── SKILL.md

~/.agents/skills/               # External (shared, mutable if writable)
├── my-custom-workflow/
│   └── SKILL.md
└── team-conventions/
    └── SKILL.md
```

All four skills appear in your skill index. If you create a new skill called `my-custom-workflow` locally, it shadows the external version.

## Skill Bundles

Skill bundles are tiny YAML files that group several skills under a single slash command. When you run `/<bundle-name>`, every skill listed in the bundle loads at once — useful when a particular task always benefits from the same set of skills together.

### Quick example

```bash
# Create a bundle for backend feature work
jarvis bundles create backend-dev \
  --skill github-code-review \
  --skill test-driven-development \
  --skill github-pr-workflow \
  -d "Backend feature work — review, test, PR workflow"
```

Then in the CLI or any gateway platform:

```
/backend-dev refactor the auth middleware
```

The agent receives all three skills loaded into one user message, with any text after the slash command attached as a user instruction.

### YAML schema

Bundles live in **`~/.jarvis/skill-bundles/<slug>.yaml`** and look like this:

```yaml
name: backend-dev
description: Backend feature work — review, test, PR workflow.
skills:
  - github-code-review
  - test-driven-development
  - github-pr-workflow
instruction: |
  Always start by writing failing tests, then implement.
  Open the PR through the standard workflow with co-author tags.
```

Fields:
- `name` (optional — defaults to the filename stem) — the bundle's display name. Normalized to a hyphen slug for the slash command (`Backend Dev` → `/backend-dev`).
- `description` (optional) — short text shown in `/bundles` and `jarvis bundles list`.
- `skills` (required, non-empty list) — skill names or paths relative to your skills directory. Use the same identifier you'd pass to `/<skill-name>`.
- `instruction` (optional) — extra guidance prepended to the loaded skill content. Useful for codifying "how we always use these together."

### Managing bundles

```bash
# List all installed bundles
jarvis bundles list

# Inspect one bundle
jarvis bundles show backend-dev

# Create a bundle interactively (omit --skill flags to enter them one per line)
jarvis bundles create research

# Overwrite an existing bundle
jarvis bundles create backend-dev --skill ... --force

# Delete a bundle
jarvis bundles delete backend-dev

# Re-scan ~/.jarvis/skill-bundles/ and report changes
jarvis bundles reload
```

From inside a chat session, `/bundles` lists every installed bundle and its skills.

### Behavior

- **Bundles take precedence over individual skills** when slugs collide. If you name a bundle `research` and you also have a skill called `research`, `/research` invokes the bundle. This is intentional — you opted into the bundle by naming it.
- **Missing skills are skipped, not fatal.** If a bundle lists `skill-foo` and you haven't installed it, the bundle still loads the skills that do resolve, and the agent gets a note listing what was skipped.
- **Bundles work in every surface** — interactive CLI, TUI, dashboard chat, and every gateway platform (Telegram, Discord, Slack, …) — because dispatch is centralized in the same place as individual skill commands.
- **Bundles do not invalidate the prompt cache.** They generate a fresh user message at invocation time, the same way `/<skill-name>` does — no system prompt mutation.

### When bundles beat installing each skill manually

Use a bundle when:
- You always pair the same skills for a recurring task (`/backend-dev`, `/release-prep`, `/incident-response`).
- You want a one-character-shorter mental model than typing several `/skill` invocations in a row.
- You want to ship a team-wide "task profile" by checking the bundle YAML into a shared dotfiles repo and symlinking it into `~/.jarvis/skill-bundles/`.

A bundle is just a YAML alias — it doesn't install skills for you. The skills themselves must already be present (in `~/.jarvis/skills/` or an external skill directory). Otherwise the bundle invocation just skips the missing ones.

## Agent-Managed Skills (skill_manage tool)

The agent can create, update, and delete its own skills via the `skill_manage` tool. This is the agent's **procedural memory** — when it figures out a non-trivial workflow, it saves the approach as a skill for future reuse.

### When the Agent Creates Skills

- After completing a complex task (5+ tool calls) successfully
- When it hit errors or dead ends and found the working path
- When the user corrected its approach
- When it discovered a non-trivial workflow

### Actions

| Action | Use for | Key params |
|--------|---------|------------|
| `create` | New skill from scratch | `name`, `content` (full SKILL.md), optional `category` |
| `patch` | Targeted fixes (preferred) | `name`, `old_string`, `new_string` |
| `edit` | Major structural rewrites | `name`, `content` (full SKILL.md replacement) |
| `delete` | Remove a skill entirely | `name` |
| `write_file` | Add/update supporting files | `name`, `file_path`, `file_content` |
| `remove_file` | Remove a supporting file | `name`, `file_path` |

:::tip
The `patch` action is preferred for updates — it's more token-efficient than `edit` because only the changed text appears in the tool call.
:::

## Skills Hub

Browse, search, install, and manage skills from online registries, `skills.sh`, direct well-known skill endpoints, and official optional skills.

### Common commands

```bash
jarvis skills browse                              # Browse all hub skills (official first)
jarvis skills browse --source official            # Browse only official optional skills
jarvis skills search kubernetes                   # Search all sources
jarvis skills search react --source skills-sh     # Search the skills.sh directory
jarvis skills search https://mintlify.com/docs --source well-known
jarvis skills inspect openai/skills/k8s           # Preview before installing
jarvis skills install openai/skills/k8s           # Install with security scan
jarvis skills install official/security/1password
jarvis skills install skills-sh/vercel-labs/json-render/json-render-react --force
jarvis skills install well-known:https://mintlify.com/docs/.well-known/skills/mintlify
jarvis skills install https://sharethis.chat/SKILL.md              # Direct URL (single-file SKILL.md)
jarvis skills install https://example.com/SKILL.md --name my-skill # Override name when frontmatter has none
jarvis skills list --source hub                   # List hub-installed skills
jarvis skills check                               # Check installed hub skills for upstream updates
jarvis skills update                              # Reinstall hub skills with upstream changes when needed
jarvis skills audit                               # Re-scan all hub skills for security
jarvis skills uninstall k8s                       # Remove a hub skill
jarvis skills reset google-workspace              # Un-stick a bundled skill from "user-modified" (see below)
jarvis skills reset google-workspace --restore    # Also restore the bundled version, deleting your local edits
jarvis skills publish skills/my-skill --to github --repo owner/repo
jarvis skills snapshot export setup.json          # Export skill config
jarvis skills tap add myorg/skills-repo           # Add a custom GitHub source
```

### Supported hub sources

| Source | Example | Notes |
|--------|---------|-------|
| `official` | `official/security/1password` | Optional skills shipped with Jarvis. |
| `skills-sh` | `skills-sh/vercel-labs/agent-skills/vercel-react-best-practices` | Searchable via `jarvis skills search <query> --source skills-sh`. Jarvis resolves alias-style skills when the skills.sh slug differs from the repo folder. |
| `well-known` | `well-known:https://mintlify.com/docs/.well-known/skills/mintlify` | Skills served directly from `/.well-known/skills/index.json` on a website. Search using the site or docs URL. |
| `url` | `https://sharethis.chat/SKILL.md` | Direct HTTP(S) URL to a single-file `SKILL.md`. Name resolution: frontmatter → URL slug → interactive prompt → `--name` flag. |
| `github` | `openai/skills/k8s` | Direct GitHub repo/path installs and custom taps. |
| `clawhub`, `lobehub`, `browse-sh`, `claude-marketplace` | Source-specific identifiers | Community or marketplace integrations. |

### Integrated hubs and registries

Jarvis currently integrates with these skills ecosystems and discovery sources:

#### 1. Official optional skills (`official`)

These are maintained in the Jarvis repository itself and install with builtin trust.

- Catalog: [Official Optional Skills Catalog](../../reference/optional-skills-catalog)
- Source in repo: `capabilities/optional-skills/`
- Example:

```bash
jarvis skills browse --source official
jarvis skills install official/security/1password
```

#### 2. skills.sh (`skills-sh`)

This is Vercel's public skills directory. Jarvis can search it directly, inspect skill detail pages, resolve alias-style slugs, and install from the underlying source repo.

- Directory: [skills.sh](https://skills.sh/)
- CLI/tooling repo: [vercel-labs/skills](https://github.com/vercel-labs/skills)
- Official Vercel skills repo: [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills)
- Example:

```bash
jarvis skills search react --source skills-sh
jarvis skills inspect skills-sh/vercel-labs/json-render/json-render-react
jarvis skills install skills-sh/vercel-labs/json-render/json-render-react --force
```

#### 3. Well-known skill endpoints (`well-known`)

This is URL-based discovery from sites that publish `/.well-known/skills/index.json`. It is not a single centralized hub — it is a web discovery convention.

- Example live endpoint: [Mintlify docs skills index](https://mintlify.com/docs/.well-known/skills/index.json)
- Reference server implementation: [vercel-labs/skills-handler](https://github.com/vercel-labs/skills-handler)
- Example:

```bash
jarvis skills search https://mintlify.com/docs --source well-known
jarvis skills inspect well-known:https://mintlify.com/docs/.well-known/skills/mintlify
jarvis skills install well-known:https://mintlify.com/docs/.well-known/skills/mintlify
```

#### 4. Direct GitHub skills (`github`)

Jarvis can install directly from GitHub repositories and GitHub-based taps. This is useful when you already know the repo/path or want to add your own custom source repo.

Default taps (browsable without any setup):
- [openai/skills](https://github.com/openai/skills)
- [anthropics/skills](https://github.com/anthropics/skills)
- [huggingface/skills](https://github.com/huggingface/skills)
- [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills)
- [garrytan/gstack](https://github.com/garrytan/gstack)

- Example:

```bash
jarvis skills install openai/skills/k8s
jarvis skills tap add myorg/skills-repo
```

#### 5. ClawHub (`clawhub`)

A third-party skills marketplace integrated as a community source.

- Site: [clawhub.ai](https://clawhub.ai/)
- Jarvis source id: `clawhub`

#### 6. Claude marketplace-style repos (`claude-marketplace`)

Jarvis supports marketplace repos that publish Claude-compatible plugin/marketplace manifests.

Known integrated sources include:
- [anthropics/skills](https://github.com/anthropics/skills)
- [aiskillstore/marketplace](https://github.com/aiskillstore/marketplace)

Jarvis source id: `claude-marketplace`

#### 7. LobeHub (`lobehub`)

Jarvis can search and convert agent entries from LobeHub's public catalog into installable Jarvis skills.

- Site: [LobeHub](https://lobehub.com/)
- Public agents index: [chat-agents.lobehub.com](https://chat-agents.lobehub.com/)
- Backing repo: [lobehub/lobe-chat-agents](https://github.com/lobehub/lobe-chat-agents)
- Jarvis source id: `lobehub`

#### 8. browse.sh (`browse-sh`)

Jarvis integrates with [browse.sh](https://browse.sh), Browserbase's catalog of 200+ site-specific browser-automation SKILL.md files (Airbnb, Amazon, arXiv, 12306.cn, Etsy, Xero, and many more). Each skill describes how to drive one website end-to-end and is suitable for use with Jarvis' browser tools and any browser-automation skills you already have installed.

- Site: [browse.sh](https://browse.sh/)
- Catalog API: `https://browse.sh/api/skills`
- Jarvis source id: `browse-sh`
- Trust level: `community`

```bash
jarvis skills search airbnb --source browse-sh
jarvis skills inspect browse-sh/airbnb.com/search-listings-ddgioa
jarvis skills install browse-sh/airbnb.com/search-listings-ddgioa
```

Identifiers use the form `browse-sh/<hostname>/<task-id>` and match the slug exposed by the browse.sh catalog. Content is resolved through the per-skill detail endpoint (`/api/skills/<slug>` → `skillMdUrl`), not through the catalog's GitHub `sourceUrl`.

#### 9. Direct URL (`url`)

Install a single-file `SKILL.md` directly from any HTTP(S) URL — useful when an author hosts a skill on their own site (no hub listing, no GitHub path to type). Jarvis fetches the URL, parses the YAML frontmatter, security-scans it, and installs.

- Jarvis source id: `url`
- Identifier: the URL itself (no prefix needed)
- Scope: **single-file `SKILL.md`** only. Multi-file skills with `references/` or `scripts/` need a manifest and should be published via one of the other sources above.

```bash
jarvis skills install https://sharethis.chat/SKILL.md
jarvis skills install https://example.com/my-skill/SKILL.md --category productivity
```

Name resolution, in order:
1. `name:` field in the SKILL.md YAML frontmatter (recommended — every well-formed skill has one).
2. Parent directory name from the URL path (e.g. `.../my-skill/SKILL.md` → `my-skill`, or `.../my-skill.md` → `my-skill`), when it's a valid identifier (`^[a-z][a-z0-9_-]*$`).
3. Interactive prompt on a terminal with a TTY.
4. On non-interactive surfaces (the `/skills install` slash command inside the TUI, gateway platforms, scripts), a clean error pointing at the `--name` override.

```bash
# Frontmatter has no name and the URL slug is unhelpful — supply one:
jarvis skills install https://example.com/SKILL.md --name sharethis-chat

# Or inside a chat session:
/skills install https://example.com/SKILL.md --name sharethis-chat
```

Trust level is always `community` — the same security scan runs as for every other source. The URL is stored as the install identifier, so `jarvis skills update` re-fetches from the same URL automatically when you want to refresh.

### Security scanning and `--force`

All hub-installed skills go through a **security scanner** that checks for data exfiltration, prompt injection, destructive commands, supply-chain signals, and other threats.

`jarvis skills inspect ...` now also surfaces upstream metadata when available:
- repo URL
- skills.sh detail page URL
- install command
- weekly installs
- upstream security audit statuses
- well-known index/endpoint URLs

Use `--force` when you have reviewed a third-party skill and want to override a non-dangerous policy block:

```bash
jarvis skills install skills-sh/anthropics/skills/pdf --force
```

Important behavior:
- `--force` can override policy blocks for caution/warn-style findings.
- `--force` does **not** override a `dangerous` scan verdict.
- Official optional skills (`official/...`) are treated as builtin trust and do not show the third-party warning panel.

### Trust levels

| Level | Source | Policy |
|-------|--------|--------|
| `builtin` | Ships with Jarvis | Always trusted |
| `official` | `capabilities/optional-skills/` in the repo | Builtin trust, no third-party warning |
| `trusted` | Trusted registries/repos such as `openai/skills`, `anthropics/skills`, `huggingface/skills` | More permissive policy than community sources |
| `community` | Everything else (`skills.sh`, well-known endpoints, custom GitHub repos, most marketplaces) | Non-dangerous findings can be overridden with `--force`; `dangerous` verdicts stay blocked |

### Update lifecycle

The hub now tracks enough provenance to re-check upstream copies of installed skills:

```bash
jarvis skills check          # Report which installed hub skills changed upstream
jarvis skills update         # Reinstall only the skills with updates available
jarvis skills update react   # Update one specific installed hub skill
```

This uses the stored source identifier plus the current upstream bundle content hash to detect drift.

:::tip GitHub rate limits
Skills hub operations use the GitHub API, which has a rate limit of 60 requests/hour for unauthenticated users. If you see rate-limit errors during install or search, set `GITHUB_TOKEN` in your `.env` file to increase the limit to 5,000 requests/hour. The error message includes an actionable hint when this happens.
:::

### Publishing a custom skill tap

If you want to share a curated set of skills — for your team, your org, or publicly — you can publish them as a **tap**: a GitHub repository other Jarvis users add with `jarvis skills tap add <owner/repo>`. No server, no registry sign-up, no release pipeline. Just a directory of `SKILL.md` files.

#### Repo layout

A tap is any GitHub repo (public or private — private needs `GITHUB_TOKEN`) laid out like this:

```
owner/repo
├── skills/                       # default path; configurable per-tap
│   ├── my-workflow/
│   │   ├── SKILL.md              # required
│   │   ├── references/           # optional supporting files
│   │   ├── templates/
│   │   └── scripts/
│   ├── another-skill/
│   │   └── SKILL.md
│   └── third-skill/
│       └── SKILL.md
└── README.md                     # optional but helpful
```

Rules:
- Each skill lives in its own directory under the tap's root path (default `skills/`).
- The directory name becomes the skill's install slug.
- Each skill directory must contain a `SKILL.md` with standard [SKILL.md frontmatter](#skillmd-format) (`name`, `description`, plus optional `metadata.jarvis.tags`, `version`, `author`, `platforms`, `metadata.jarvis.config`).
- Subdirectories like `references/`, `templates/`, `scripts/`, `assets/` are downloaded alongside `SKILL.md` at install time.
- Skills whose directory name starts with `.` or `_` are ignored.

Jarvis discovers skills by listing every subdirectory of the tap path and probing each for `SKILL.md`.

#### Minimal tap example

```
my-org/jarvis-skills
└── skills/
    └── deploy-runbook/
        └── SKILL.md
```

`skills/deploy-runbook/SKILL.md`:

```markdown
---
name: deploy-runbook
description: Our deployment runbook — services, rollback, Slack channels
version: 1.0.0
author: My Org Platform Team
metadata:
  jarvis:
    tags: [deployment, runbook, internal]
---

# Deploy Runbook

Step 1: ...
```

After pushing that to GitHub, any Jarvis user can subscribe and install:

```bash
jarvis skills tap add my-org/jarvis-skills
jarvis skills search deploy
jarvis skills install my-org/jarvis-skills/deploy-runbook
```

#### Non-default paths

If your skills don't live under `skills/` (common when you're adding a `skills/` subtree to an existing project), edit the tap entry in `~/.jarvis/.hub/taps.json`:

```json
{
  "taps": [
    {"repo": "my-org/platform-docs", "path": "internal/skills/"}
  ]
}
```

The `jarvis skills tap add` CLI defaults new taps to `path: "skills/"`; edit the file directly if you need a different path. `jarvis skills tap list` shows the effective path per tap.

#### Installing individual skills directly (without adding a tap)

Users can also install a single skill from any public GitHub repo without adding the whole repo as a tap:

```bash
jarvis skills install owner/repo/skills/my-workflow
```

Useful when you want to share one skill without asking the user to subscribe to your whole registry.

#### Trust levels for taps

New taps are assigned `community` trust by default. Skills installed from them run through the standard security scan and show the third-party warning panel on first install. If your org or a widely-trusted source should get higher trust, add its repo to `TRUSTED_REPOS` in `tools/skills_hub.py` (requires a Jarvis core PR).

#### Tap management

```bash
jarvis skills tap list                                # show all configured taps
jarvis skills tap add myorg/skills-repo               # add (default path: skills/)
jarvis skills tap remove myorg/skills-repo            # remove
```

Inside a running session:

```
/skills tap list
/skills tap add myorg/skills-repo
/skills tap remove myorg/skills-repo
```

Taps are stored in `~/.jarvis/.hub/taps.json` (created on demand).

## Bundled skill updates (`jarvis skills reset`)

Jarvis ships with a set of bundled skills in `skills/` inside the repo. On install and on every `jarvis update`, a sync pass copies those into `~/.jarvis/skills/` and records a manifest at `~/.jarvis/skills/.bundled_manifest` mapping each skill name to the content hash at the time it was synced (the **origin hash**).

On each sync, Jarvis recomputes the hash of your local copy and compares it to the origin hash:

- **Unchanged** → safe to pull upstream changes, copy the new bundled version in, record the new origin hash.
- **Changed** → treated as **user-modified** and skipped forever, so your edits never get stomped.

The protection is good, but it has one sharp edge. If you edit a bundled skill and then later want to abandon your changes and go back to the bundled version by just copy-pasting from `~/.jarvis/jarvis-agent/skills/`, the manifest still holds the *old* origin hash from whenever the last successful sync ran. Your fresh copy-paste contents (current bundled hash) won't match that stale origin hash, so sync keeps flagging it as user-modified.

`jarvis skills reset` is the escape hatch:

```bash
# Safe: clears the manifest entry for this skill. Your current copy is preserved,
# but the next sync re-baselines against it so future updates work normally.
jarvis skills reset google-workspace

# Full restore: also deletes your local copy and re-copies the current bundled
# version. Use this when you want the pristine upstream skill back.
jarvis skills reset google-workspace --restore

# Non-interactive (e.g. in scripts or TUI mode) — skip the --restore confirmation.
jarvis skills reset google-workspace --restore --yes
```

The same command works in chat as a slash command:

```text
/skills reset google-workspace
/skills reset google-workspace --restore
```

:::note Profiles
Each profile has its own `.bundled_manifest` under its own `JARVIS_HOME`, so `jarvis -p coder skills reset <name>` only affects that profile.
:::

### Slash commands (inside chat)

All the same commands work with `/skills`:

```text
/skills browse
/skills search react --source skills-sh
/skills search https://mintlify.com/docs --source well-known
/skills inspect skills-sh/vercel-labs/json-render/json-render-react
/skills install openai/skills/skill-creator --force
/skills check
/skills update
/skills reset google-workspace
/skills list
```

Official optional skills still use identifiers like `official/security/1password` and `official/migration/openclaw-migration`.

## Source: `guides/work-with-skills.md`

---
sidebar_position: 12
title: "Working with Skills"
description: "Find, install, use, and create skills — on-demand knowledge that teaches Jarvis new workflows"
---

# Working with Skills

Skills are on-demand knowledge documents that teach Jarvis how to handle specific tasks — from generating ASCII art to managing GitHub PRs. This guide walks you through using them day to day.

For the full technical reference, see [Skills System](/docs/user-guide/features/skills).

---

## Finding Skills

Every Jarvis installation ships with bundled skills. See what's available:

```bash
# In any chat session:
/skills

# Or from the CLI:
jarvis skills list
```

This shows a compact list with names and descriptions:

```
ascii-art         Generate ASCII art using pyfiglet, cowsay, boxes...
arxiv             Search and retrieve academic papers from arXiv...
github-pr-workflow Full PR lifecycle — create branches, commit...
plan              Plan mode — inspect context, write a markdown...
excalidraw        Create hand-drawn style diagrams using Excalidraw...
```

### Searching for a Skill

```bash
# Search by keyword
/skills search docker
/skills search music
```

### The Skills Hub

Official optional skills (heavier or niche skills not active by default) are available via the Hub:

```bash
# Browse official optional skills
/skills browse

# Search the hub
/skills search blockchain
```

---

## Using a Skill

Every installed skill is automatically a slash command. Just type its name:

```bash
# Load a skill and give it a task
/ascii-art Make a banner that says "HELLO WORLD"
/plan Design a REST API for a todo app
/github-pr-workflow Create a PR for the auth refactor

# Just the skill name (no task) loads it and lets you describe what you need
/excalidraw
```

You can also trigger skills through natural conversation — ask Jarvis to use a specific skill, and it will load it via the `skill_view` tool.

### Progressive Disclosure

Skills use a token-efficient loading pattern. The agent doesn't load everything at once:

1. **`skills_list()`** — compact list of all skills (~3k tokens). Loaded at session start.
2. **`skill_view(name)`** — full SKILL.md content for one skill. Loaded when the agent decides it needs that skill.
3. **`skill_view(name, file_path)`** — a specific reference file within the skill. Only loaded if needed.

This means skills don't cost tokens until they're actually used.

---

## Installing from the Hub

Official optional skills ship with Jarvis but aren't active by default. Install them explicitly:

```bash
# Install an official optional skill
jarvis skills install official/research/arxiv

# Install from the hub in a chat session
/skills install official/creative/songwriting-and-ai-music

# Install a single-file SKILL.md directly from any HTTP(S) URL
jarvis skills install https://sharethis.chat/SKILL.md
/skills install https://example.com/SKILL.md --name my-skill
```

What happens:
1. The skill directory is copied to `~/.jarvis/skills/`
2. It appears in your `skills_list` output
3. It becomes available as a slash command

:::tip
Installed skills take effect in new sessions. If you want it available in the current session, use `/reset` to start fresh, or add `--now` to invalidate the prompt cache immediately (costs more tokens on the next turn).
:::

### Verifying Installation

```bash
# Check it's there
jarvis skills list | grep arxiv

# Or in chat
/skills search arxiv
```

---

## Plugin-Provided Skills

Plugins can bundle their own skills using namespaced names (`plugin:skill`). This prevents name collisions with built-in skills.

```bash
# Load a plugin skill by its qualified name
skill_view("superpowers:writing-plans")

# Built-in skill with the same base name is unaffected
skill_view("writing-plans")
```

Plugin skills are **not** listed in the system prompt and don't appear in `skills_list`. They're opt-in — load them explicitly when you know a plugin provides one. When loaded, the agent sees a banner listing sibling skills from the same plugin.

For how to ship skills in your own plugin, see [Build a Jarvis Plugin → Bundle skills](/docs/guides/build-a-jarvis-plugin#bundle-skills).

---

## Configuring Skill Settings

Some skills declare configuration they need in their frontmatter:

```yaml
metadata:
  jarvis:
    config:
      - key: tenor.api_key
        description: "Tenor API key for GIF search"
        prompt: "Enter your Tenor API key"
        url: "https://developers.google.com/tenor/guides/quickstart"
```

When a skill with config is first loaded, Jarvis prompts you for the values. They're stored in `config.yaml` under `skills.config.*`.

Manage skill config from the CLI:

```bash
# Interactive config for a specific skill
jarvis skills config gif-search

# View all skill config
jarvis config get skills.config
```

---

## Creating Your Own Skill

Skills are just markdown files with YAML frontmatter. Creating one takes under five minutes.

### 1. Create the Directory

```bash
mkdir -p ~/.jarvis/skills/my-category/my-skill
```

### 2. Write SKILL.md

```markdown title="~/.jarvis/skills/my-category/my-skill/SKILL.md"
---
name: my-skill
description: Brief description of what this skill does
version: 1.0.0
metadata:
  jarvis:
    tags: [my-tag, automation]
    category: my-category
---

# My Skill

## When to Use
Use this skill when the user asks about [specific topic] or needs to [specific task].

## Procedure
1. First, check if [prerequisite] is available
2. Run `command --with-flags`
3. Parse the output and present results

## Pitfalls
- Common failure: [description]. Fix: [solution]
- Watch out for [edge case]

## Verification
Run `check-command` to confirm the result is correct.
```

### 3. Add Reference Files (Optional)

Skills can include supporting files the agent loads on demand:

```
my-skill/
├── SKILL.md                    # Main skill document
├── references/
│   ├── api-docs.md             # API reference the agent can consult
│   └── examples.md             # Example inputs/outputs
├── templates/
│   └── config.yaml             # Template files the agent can use
└── scripts/
    └── setup.sh                # Scripts the agent can execute
```

Reference these in your SKILL.md:

```markdown
For API details, load the reference: `skill_view("my-skill", "references/api-docs.md")`
```

### 4. Test It

Start a new session and try your skill:

```bash
jarvis chat -q "/my-skill help me with the thing"
```

The skill appears automatically — no registration needed. Drop it in `~/.jarvis/skills/` and it's live.

:::info
The agent can also create and update skills itself using `skill_manage`. After solving a complex problem, Jarvis may offer to save the approach as a skill for next time.
:::

---

## Per-Platform Skill Management

Control which skills are available on which platforms:

```bash
jarvis skills
```

This opens an interactive TUI where you can enable or disable skills per platform (CLI, Telegram, Discord, etc.). Useful when you want certain skills only available in specific contexts — for example, keeping development skills off Telegram.

---

## Skills vs Memory

Both are persistent across sessions, but they serve different purposes:

| | Skills | Memory |
|---|---|---|
| **What** | Procedural knowledge — how to do things | Factual knowledge — what things are |
| **When** | Loaded on demand, only when relevant | Injected into every session automatically |
| **Size** | Can be large (hundreds of lines) | Should be compact (key facts only) |
| **Cost** | Zero tokens until loaded | Small but constant token cost |
| **Examples** | "How to deploy to Kubernetes" | "User prefers dark mode, lives in PST" |
| **Who creates** | You, the agent, or installed from Hub | The agent, based on conversations |

**Rule of thumb:** If you'd put it in a reference document, it's a skill. If you'd put it on a sticky note, it's memory.

---

## Tips

**Keep skills focused.** A skill that tries to cover "all of DevOps" will be too long and too vague. A skill that covers "deploy a Python app to Fly.io" is specific enough to be genuinely useful.

**Let the agent create skills.** After a complex multi-step task, Jarvis will often offer to save the approach as a skill. Say yes — these agent-authored skills capture the exact workflow including pitfalls that were discovered along the way.

**Use categories.** Organize skills into subdirectories (`~/.jarvis/skills/devops/`, `~/.jarvis/skills/research/`, etc.). This keeps the list manageable and helps the agent find relevant skills faster.

**Update skills when they go stale.** If you use a skill and hit issues not covered by it, tell Jarvis to update the skill with what you learned. Skills that aren't maintained become liabilities.

---

*For the complete skills reference — frontmatter fields, conditional activation, external directories, and more — see [Skills System](/docs/user-guide/features/skills).*

## Source: `developer-guide/creating-skills.md`

---
sidebar_position: 3
title: "Creating Skills"
description: "How to create skills for JARVIS — SKILL.md format, guidelines, and publishing"
---

# Creating Skills

Skills are the preferred way to add new capabilities to JARVIS. They're easier to create than tools, require no code changes to the agent, and can be shared with the community.

## Should it be a Skill or a Tool?

Make it a **Skill** when:
- The capability can be expressed as instructions + shell commands + existing tools
- It wraps an external CLI or API that the agent can call via `terminal` or `web_extract`
- It doesn't need custom Python integration or API key management baked into the agent
- Examples: arXiv search, git workflows, Docker management, PDF processing, email via CLI tools

Make it a **Tool** when:
- It requires end-to-end integration with API keys, auth flows, or multi-component configuration
- It needs custom processing logic that must execute precisely every time
- It handles binary data, streaming, or real-time events
- Examples: browser automation, TTS, vision analysis

## Skill Directory Structure

Bundled skills live in `skills/` organized by category. Official optional skills use the same structure in `capabilities/optional-skills/`:

```text
skills/
├── research/
│   └── arxiv/
│       ├── SKILL.md              # Required: main instructions
│       └── scripts/              # Optional: helper scripts
│           └── search_arxiv.py
├── productivity/
│   └── ocr-and-documents/
│       ├── SKILL.md
│       ├── scripts/
│       └── references/
└── ...
```

## SKILL.md Format

```markdown
---
name: my-skill
description: Brief description (shown in skill search results)
version: 1.0.0
author: Your Name
license: MIT
platforms: [macos, linux]          # Optional — restrict to specific OS platforms
                                   #   Valid: macos, linux, windows
                                   #   Omit to load on all platforms (default)
metadata:
  jarvis:
    tags: [Category, Subcategory, Keywords]
    related_skills: [other-skill-name]
    requires_toolsets: [web]            # Optional — only show when these toolsets are active
    requires_tools: [web_search]        # Optional — only show when these tools are available
    fallback_for_toolsets: [browser]    # Optional — hide when these toolsets are active
    fallback_for_tools: [browser_navigate]  # Optional — hide when these tools exist
    config:                              # Optional — config.yaml settings the skill needs
      - key: my.setting
        description: "What this setting controls"
        default: "sensible-default"
        prompt: "Display prompt for setup"
required_environment_variables:          # Optional — env vars the skill needs
  - name: MY_API_KEY
    prompt: "Enter your API key"
    help: "Get one at https://example.com"
    required_for: "API access"
---

# Skill Title

Brief intro.

## When to Use
Trigger conditions — when should the agent load this skill?

## Quick Reference
Table of common commands or API calls.

## Procedure
Step-by-step instructions the agent follows.

## Pitfalls
Known failure modes and how to handle them.

## Verification
How the agent confirms it worked.
```

### Platform-Specific Skills

Skills can restrict themselves to specific operating systems using the `platforms` field:

```yaml
platforms: [macos]            # macOS only (e.g., iMessage, Apple Reminders)
platforms: [macos, linux]     # macOS and Linux
platforms: [windows]          # Windows only
```

When set, the skill is automatically hidden from the system prompt, `skills_list()`, and slash commands on incompatible platforms. If omitted or empty, the skill loads on all platforms (backward compatible).

### Conditional Skill Activation

Skills can declare dependencies on specific tools or toolsets. This controls whether the skill appears in the system prompt for a given session.

```yaml
metadata:
  jarvis:
    requires_toolsets: [web]           # Hide if the web toolset is NOT active
    requires_tools: [web_search]       # Hide if web_search tool is NOT available
    fallback_for_toolsets: [browser]   # Hide if the browser toolset IS active
    fallback_for_tools: [browser_navigate]  # Hide if browser_navigate IS available
```

| Field | Behavior |
|-------|----------|
| `requires_toolsets` | Skill is **hidden** when ANY listed toolset is **not** available |
| `requires_tools` | Skill is **hidden** when ANY listed tool is **not** available |
| `fallback_for_toolsets` | Skill is **hidden** when ANY listed toolset **is** available |
| `fallback_for_tools` | Skill is **hidden** when ANY listed tool **is** available |

**Use case for `fallback_for_*`:** Create a skill that serves as a workaround when a primary tool isn't available. For example, a `duckduckgo-search` skill with `fallback_for_tools: [web_search]` only shows when the web search tool (which requires an API key) is not configured.

**Use case for `requires_*`:** Create a skill that only makes sense when certain tools are present. For example, a web scraping workflow skill with `requires_toolsets: [web]` won't clutter the prompt when web tools are disabled.

### Environment Variable Requirements

Skills can declare environment variables they need. When a skill is loaded via `skill_view`, its required vars are automatically registered for passthrough into sandboxed execution environments (terminal, execute_code).

```yaml
required_environment_variables:
  - name: TENOR_API_KEY
    prompt: "Tenor API key"               # Shown when prompting user
    help: "Get your key at https://tenor.com"  # Help text or URL
    required_for: "GIF search functionality"   # What needs this var
```

Each entry supports:
- `name` (required) — the environment variable name
- `prompt` (optional) — prompt text when asking the user for the value
- `help` (optional) — help text or URL for obtaining the value
- `required_for` (optional) — describes which feature needs this variable

Users can also manually configure passthrough variables in `config.yaml`:

```yaml
terminal:
  env_passthrough:
    - MY_CUSTOM_VAR
    - ANOTHER_VAR
```

See `skills/apple/` for examples of macOS-only skills.

## Secure Setup on Load

Use `required_environment_variables` when a skill needs an API key or token. Missing values do **not** hide the skill from discovery. Instead, Jarvis prompts for them securely when the skill is loaded in the local CLI.

```yaml
required_environment_variables:
  - name: TENOR_API_KEY
    prompt: Tenor API key
    help: Get a key from https://developers.google.com/tenor
    required_for: full functionality
```

The user can skip setup and keep loading the skill. Jarvis never exposes the raw secret value to the model. Gateway and messaging sessions show local setup guidance instead of collecting secrets in-band.

:::tip Sandbox Passthrough
When your skill is loaded, any declared `required_environment_variables` that are set are **automatically passed through** to `execute_code` and `terminal` sandboxes — including remote backends like Docker and Modal. Your skill's scripts can access `$TENOR_API_KEY` (or `os.environ["TENOR_API_KEY"]` in Python) without the user needing to configure anything extra. See [Environment Variable Passthrough](/docs/user-guide/security#environment-variable-passthrough) for details.
:::

Legacy `prerequisites.env_vars` remains supported as a backward-compatible alias.

### Config Settings (config.yaml)

Skills can declare non-secret settings that are stored in `config.yaml` under the `skills.config` namespace. Unlike environment variables (which are secrets stored in `.env`), config settings are for paths, preferences, and other non-sensitive values.

```yaml
metadata:
  jarvis:
    config:
      - key: myplugin.path
        description: Path to the plugin data directory
        default: "~/myplugin-data"
        prompt: Plugin data directory path
      - key: myplugin.domain
        description: Domain the plugin operates on
        default: ""
        prompt: Plugin domain (e.g., AI/ML research)
```

Each entry supports:
- `key` (required) — dotpath for the setting (e.g., `myplugin.path`)
- `description` (required) — explains what the setting controls
- `default` (optional) — default value if the user doesn't configure it
- `prompt` (optional) — prompt text shown during `jarvis config migrate`; falls back to `description`

**How it works:**

1. **Storage:** Values are written to `config.yaml` under `skills.config.<key>`:
   ```yaml
   skills:
     config:
       myplugin:
         path: ~/my-data
   ```

2. **Discovery:** `jarvis config migrate` scans all enabled skills, finds unconfigured settings, and prompts the user. Settings also appear in `jarvis config show` under "Skill Settings."

3. **Runtime injection:** When a skill loads, its config values are resolved and appended to the skill message:
   ```
   [Skill config (from ~/.jarvis/config.yaml):
     myplugin.path = /home/user/my-data
   ]
   ```
   The agent sees the configured values without needing to read `config.yaml` itself.

4. **Manual setup:** Users can also set values directly:
   ```bash
   jarvis config set skills.config.myplugin.path ~/my-data
   ```

:::tip When to use which
Use `required_environment_variables` for API keys, tokens, and other **secrets** (stored in `~/.jarvis/.env`, never shown to the model). Use `config` for **paths, preferences, and non-sensitive settings** (stored in `config.yaml`, visible in config show).
:::

### Credential File Requirements (OAuth tokens, etc.)

Skills that use OAuth or file-based credentials can declare files that need to be mounted into remote sandboxes. This is for credentials stored as **files** (not env vars) — typically OAuth token files produced by a setup script.

```yaml
required_credential_files:
  - path: google_token.json
    description: Google OAuth2 token (created by setup script)
  - path: google_client_secret.json
    description: Google OAuth2 client credentials
```

Each entry supports:
- `path` (required) — file path relative to `~/.jarvis/`
- `description` (optional) — explains what the file is and how it's created

When loaded, Jarvis checks if these files exist. Missing files trigger `setup_needed`. Existing files are automatically:
- **Mounted into Docker** containers as read-only bind mounts
- **Synced into Modal** sandboxes (at creation + before each command, so mid-session OAuth works)
- Available on **local** backend without any special handling

:::tip When to use which
Use `required_environment_variables` for simple API keys and tokens (strings stored in `~/.jarvis/.env`). Use `required_credential_files` for OAuth token files, client secrets, service account JSON, certificates, or any credential that's a file on disk.
:::

See the `skills/productivity/google-workspace/SKILL.md` for a complete example using both.

## Skill Guidelines

### No External Dependencies

Prefer stdlib Python, curl, and existing Jarvis tools (`web_extract`, `terminal`, `read_file`). If a dependency is needed, document installation steps in the skill.

### Progressive Disclosure

Put the most common workflow first. Edge cases and advanced usage go at the bottom. This keeps token usage low for common tasks.

### Include Helper Scripts

For XML/JSON parsing or complex logic, include helper scripts in `scripts/` — don't expect the LLM to write parsers inline every time.

### Deliver media as documents (`[[as_document]]`)

If your skill produces a high-resolution screenshot, chart, or any image where lossy preview compression would hurt — emit the literal directive `[[as_document]]` somewhere in the response (commonly the last line). The gateway strips the directive and delivers every extracted media path in that response as a downloadable file attachment instead of an inline image bubble. See [Skill output and media delivery](../user-guide/features/skills.md#skill-output-and-media-delivery) for the full semantics.

#### Referencing bundled scripts from SKILL.md

When a skill is loaded, the activation message exposes the absolute skill directory as `[Skill directory: /abs/path]` and also substitutes two template tokens anywhere in the SKILL.md body:

| Token | Replaced with |
|---|---|
| `${JARVIS_SKILL_DIR}` | Absolute path to the skill's directory |
| `${JARVIS_SESSION_ID}` | The active session id (left in place if there is no session) |

So a SKILL.md can tell the agent to run a bundled script directly with:

```markdown
To analyse the input, run:

    node ${JARVIS_SKILL_DIR}/scripts/analyse.js <input>
```

The agent sees the substituted absolute path and invokes the `terminal` tool with a ready-to-run command — no path math, no extra `skill_view` round-trip. Disable substitution globally with `skills.template_vars: false` in `config.yaml`.

#### Inline shell snippets (opt-in)

Skills can also embed inline shell snippets written as `` !`cmd` `` in the SKILL.md body. When enabled, each snippet's stdout is inlined into the message before the agent reads it, so skills can inject dynamic context:

```markdown
Current date: !`date -u +%Y-%m-%d`
Git branch: !`git -C ${JARVIS_SKILL_DIR} rev-parse --abbrev-ref HEAD`
```

This is **off by default** — any snippet in a SKILL.md runs on the host without approval, so only enable it for skill sources you trust:

```yaml
# config.yaml
skills:
  inline_shell: true
  inline_shell_timeout: 10   # seconds per snippet
```

Snippets run with the skill directory as their working directory, and output is capped at 4000 characters. Failures (timeouts, non-zero exits) show up as a short `[inline-shell error: ...]` marker instead of breaking the whole skill.

### Test It

Run the skill and verify the agent follows the instructions correctly:

```bash
jarvis chat --toolsets skills -q "Use the X skill to do Y"
```

## Where Should the Skill Live?

Bundled skills (in `skills/`) ship with every Jarvis install. They should be **broadly useful to most users**:

- Document handling, web research, common dev workflows, system administration
- Used regularly by a wide range of people

If your skill is official and useful but not universally needed (e.g., a paid service integration, a heavyweight dependency), put it in **`capabilities/optional-skills/`** — it ships with the repo, is discoverable via `jarvis skills browse` (labeled "official"), and installs with builtin trust.

If your skill is specialized, community-contributed, or niche, it's better suited for a **Skills Hub** — upload it to a registry and share it via `jarvis skills install`.

## Publishing Skills

### To the Skills Hub

```bash
jarvis skills publish skills/my-skill --to github --repo owner/repo
```

### To a Custom Repository

Add your repo as a tap:

```bash
jarvis skills tap add owner/repo
```

Users can then search and install from your repository.

## Security Scanning

All hub-installed skills go through a security scanner that checks for:

- Data exfiltration patterns
- Prompt injection attempts
- Destructive commands
- Shell injection

Trust levels:
- `builtin` — ships with Jarvis (always trusted)
- `official` — from `capabilities/optional-skills/` in the repo (builtin trust, no third-party warning)
- `trusted` — from openai/skills, anthropics/skills, huggingface/skills
- `community` — non-dangerous findings can be overridden with `--force`; `dangerous` verdicts remain blocked

Jarvis can now consume third-party skills from multiple external discovery models:
- direct GitHub identifiers (for example `openai/skills/k8s`)
- `skills.sh` identifiers (for example `skills-sh/vercel-labs/json-render/json-render-react`)
- well-known endpoints served from `/.well-known/skills/index.json`

If you want your skills to be discoverable without a GitHub-specific installer, consider serving them from a well-known endpoint in addition to publishing them in a repo or marketplace.

## Source: `reference/skills-catalog.md`

---
sidebar_position: 5
title: "Bundled Skills Catalog"
description: "Catalog of bundled skills that ship with JARVIS"
---

# Bundled Skills Catalog

Jarvis ships with a large built-in skill library copied into `~/.jarvis/skills/` on install. Each skill below links to a dedicated page with its full definition, setup, and usage.

Jarvis also syncs bundled skills on `jarvis update`, but the sync manifest respects local deletions and user edits. If a skill listed here is missing from your profile's `~/.jarvis/skills/` tree, it is still shipped with Jarvis; restore it with `jarvis skills reset <name> --restore`.

If a skill is missing from this list but present in the repo, refresh the desktop skill index with `ops/scripts/catalog/build_skills_index.py`.

## apple

| Skill | Description | Path |
|-------|-------------|------|
| [`apple-notes`](/docs/user-guide/skills/bundled/apple/apple-apple-notes) | Manage Apple Notes via memo CLI: create, search, edit. | `apple/apple-notes` |
| [`apple-reminders`](/docs/user-guide/skills/bundled/apple/apple-apple-reminders) | Apple Reminders via remindctl: add, list, complete. | `apple/apple-reminders` |
| [`findmy`](/docs/user-guide/skills/bundled/apple/apple-findmy) | Track Apple devices/AirTags via FindMy.app on macOS. | `apple/findmy` |
| [`imessage`](/docs/user-guide/skills/bundled/apple/apple-imessage) | Send and receive iMessages/SMS via the imsg CLI on macOS. | `apple/imessage` |
| [`macos-computer-use`](/docs/user-guide/skills/bundled/apple/apple-macos-computer-use) | Drive the macOS desktop in the background — screenshots, mouse, keyboard, scroll, drag — without stealing the user's cursor, keyboard focus, or Space. Works with any tool-capable model. Load this skill whenever the `computer_use` tool is... | `apple/macos-computer-use` |

## autonomous-ai-agents

| Skill | Description | Path |
|-------|-------------|------|
| [`claude-code`](/docs/user-guide/skills/bundled/autonomous-ai-agents/autonomous-ai-agents-claude-code) | Delegate coding to Claude Code CLI (features, PRs). | `autonomous-ai-agents/claude-code` |
| [`codex`](/docs/user-guide/skills/bundled/autonomous-ai-agents/autonomous-ai-agents-codex) | Delegate coding to OpenAI Codex CLI (features, PRs). | `autonomous-ai-agents/codex` |
| [`jarvis-agent`](/docs/user-guide/skills/bundled/autonomous-ai-agents/autonomous-ai-agents-jarvis-agent) | Configure, extend, or contribute to JARVIS. | `autonomous-ai-agents/jarvis-agent` |
| [`opencode`](/docs/user-guide/skills/bundled/autonomous-ai-agents/autonomous-ai-agents-opencode) | Delegate coding to OpenCode CLI (features, PR review). | `autonomous-ai-agents/opencode` |

## creative

| Skill | Description | Path |
|-------|-------------|------|
| [`architecture-diagram`](/docs/user-guide/skills/bundled/creative/creative-architecture-diagram) | Dark-themed SVG architecture/cloud/infra diagrams as HTML. | `creative/architecture-diagram` |
| [`ascii-art`](/docs/user-guide/skills/bundled/creative/creative-ascii-art) | ASCII art: pyfiglet, cowsay, boxes, image-to-ascii. | `creative/ascii-art` |
| [`ascii-video`](/docs/user-guide/skills/bundled/creative/creative-ascii-video) | ASCII video: convert video/audio to colored ASCII MP4/GIF. | `creative/ascii-video` |
| [`baoyu-article-illustrator`](/docs/user-guide/skills/bundled/creative/creative-baoyu-article-illustrator) | Article illustrations: type × style × palette consistency. | `creative/baoyu-article-illustrator` |
| [`baoyu-comic`](/docs/user-guide/skills/bundled/creative/creative-baoyu-comic) | Knowledge comics (知识漫画): educational, biography, tutorial. | `creative/baoyu-comic` |
| [`baoyu-infographic`](/docs/user-guide/skills/bundled/creative/creative-baoyu-infographic) | Infographics: 21 layouts x 21 styles (信息图, 可视化). | `creative/baoyu-infographic` |
| [`claude-design`](/docs/user-guide/skills/bundled/creative/creative-claude-design) | Design one-off HTML artifacts (landing, deck, prototype). | `creative/claude-design` |
| [`comfyui`](/docs/user-guide/skills/bundled/creative/creative-comfyui) | Generate images, video, and audio with ComfyUI — install, launch, manage nodes/models, run workflows with parameter injection. Uses the official comfy-cli for lifecycle and direct REST/WebSocket API for execution. | `creative/comfyui` |
| [`ideation`](/docs/user-guide/skills/bundled/creative/creative-creative-ideation) | Generate project ideas via creative constraints. | `creative/creative-ideation` |
| [`design-md`](/docs/user-guide/skills/bundled/creative/creative-design-md) | Author/validate/export Google's DESIGN.md token spec files. | `creative/design-md` |
| [`excalidraw`](/docs/user-guide/skills/bundled/creative/creative-excalidraw) | Hand-drawn Excalidraw JSON diagrams (arch, flow, seq). | `creative/excalidraw` |
| [`humanizer`](/docs/user-guide/skills/bundled/creative/creative-humanizer) | Humanize text: strip AI-isms and add real voice. | `creative/humanizer` |
| [`manim-video`](/docs/user-guide/skills/bundled/creative/creative-manim-video) | Manim CE animations: 3Blue1Brown math/algo videos. | `creative/manim-video` |
| [`p5js`](/docs/user-guide/skills/bundled/creative/creative-p5js) | p5.js sketches: gen art, shaders, interactive, 3D. | `creative/p5js` |
| [`pixel-art`](/docs/user-guide/skills/bundled/creative/creative-pixel-art) | Pixel art w/ era palettes (NES, Game Boy, PICO-8). | `creative/pixel-art` |
| [`popular-web-designs`](/docs/user-guide/skills/bundled/creative/creative-popular-web-designs) | 54 real design systems (Stripe, Linear, Vercel) as HTML/CSS. | `creative/popular-web-designs` |
| [`pretext`](/docs/user-guide/skills/bundled/creative/creative-pretext) | Use when building creative browser demos with @chenglou/pretext — DOM-free text layout for ASCII art, typographic flow around obstacles, text-as-geometry games, kinetic typography, and text-powered generative art. Produces single-file HT... | `creative/pretext` |
| [`sketch`](/docs/user-guide/skills/bundled/creative/creative-sketch) | Throwaway HTML mockups: 2-3 design variants to compare. | `creative/sketch` |
| [`songwriting-and-ai-music`](/docs/user-guide/skills/bundled/creative/creative-songwriting-and-ai-music) | Songwriting craft and Suno AI music prompts. | `creative/songwriting-and-ai-music` |
| [`touchdesigner-mcp`](/docs/user-guide/skills/bundled/creative/creative-touchdesigner-mcp) | Control a running TouchDesigner instance via twozero MCP — create operators, set parameters, wire connections, execute Python, build real-time visuals. 36 native tools. | `creative/touchdesigner-mcp` |

## data-science

| Skill | Description | Path |
|-------|-------------|------|
| [`jupyter-live-kernel`](/docs/user-guide/skills/bundled/data-science/data-science-jupyter-live-kernel) | Iterative Python via live Jupyter kernel (hamelnb). | `data-science/jupyter-live-kernel` |

## devops

| Skill | Description | Path |
|-------|-------------|------|
| [`kanban-orchestrator`](/docs/user-guide/skills/bundled/devops/devops-kanban-orchestrator) | Decomposition playbook + anti-temptation rules for an orchestrator profile routing work through Kanban. The "don't do the work yourself" rule and the basic lifecycle are auto-injected into every kanban worker's system prompt; this skill... | `devops/kanban-orchestrator` |
| [`kanban-worker`](/docs/user-guide/skills/bundled/devops/devops-kanban-worker) | Pitfalls, examples, and edge cases for Jarvis Kanban workers. The lifecycle itself is auto-injected into every worker's system prompt as KANBAN_GUIDANCE (from agent/prompt_builder.py); this skill is what you load when you want deeper det... | `devops/kanban-worker` |
| [`webhook-subscriptions`](/docs/user-guide/skills/bundled/devops/devops-webhook-subscriptions) | Webhook subscriptions: event-driven agent runs. | `devops/webhook-subscriptions` |

## dogfood

| Skill | Description | Path |
|-------|-------------|------|
| [`dogfood`](/docs/user-guide/skills/bundled/dogfood/dogfood-dogfood) | Exploratory QA of web apps: find bugs, evidence, reports. | `dogfood` |

## email

| Skill | Description | Path |
|-------|-------------|------|
| [`himalaya`](/docs/user-guide/skills/bundled/email/email-himalaya) | Himalaya CLI: IMAP/SMTP email from terminal. | `email/himalaya` |

## gaming

| Skill | Description | Path |
|-------|-------------|------|
| [`minecraft-modpack-server`](/docs/user-guide/skills/bundled/gaming/gaming-minecraft-modpack-server) | Host modded Minecraft servers (CurseForge, Modrinth). | `gaming/minecraft-modpack-server` |
| [`pokemon-player`](/docs/user-guide/skills/bundled/gaming/gaming-pokemon-player) | Play Pokemon via headless emulator + RAM reads. | `gaming/pokemon-player` |

## github

| Skill | Description | Path |
|-------|-------------|------|
| [`codebase-inspection`](/docs/user-guide/skills/bundled/github/github-codebase-inspection) | Inspect codebases w/ pygount: LOC, languages, ratios. | `github/codebase-inspection` |
| [`github-auth`](/docs/user-guide/skills/bundled/github/github-github-auth) | GitHub auth setup: HTTPS tokens, SSH keys, gh CLI login. | `github/github-auth` |
| [`github-code-review`](/docs/user-guide/skills/bundled/github/github-github-code-review) | Review PRs: diffs, inline comments via gh or REST. | `github/github-code-review` |
| [`github-issues`](/docs/user-guide/skills/bundled/github/github-github-issues) | Create, triage, label, assign GitHub issues via gh or REST. | `github/github-issues` |
| [`github-pr-workflow`](/docs/user-guide/skills/bundled/github/github-github-pr-workflow) | GitHub PR lifecycle: branch, commit, open, CI, merge. | `github/github-pr-workflow` |
| [`github-repo-management`](/docs/user-guide/skills/bundled/github/github-github-repo-management) | Clone/create/fork repos; manage remotes, releases. | `github/github-repo-management` |

## mcp

| Skill | Description | Path |
|-------|-------------|------|
| [`native-mcp`](/docs/user-guide/skills/bundled/mcp/mcp-native-mcp) | MCP client: connect servers, register tools (stdio/HTTP). | `mcp/native-mcp` |

## media

| Skill | Description | Path |
|-------|-------------|------|
| [`gif-search`](/docs/user-guide/skills/bundled/media/media-gif-search) | Search/download GIFs from Tenor via curl + jq. | `media/gif-search` |
| [`heartmula`](/docs/user-guide/skills/bundled/media/media-heartmula) | HeartMuLa: Suno-like song generation from lyrics + tags. | `media/heartmula` |
| [`songsee`](/docs/user-guide/skills/bundled/media/media-songsee) | Audio spectrograms/features (mel, chroma, MFCC) via CLI. | `media/songsee` |
| [`spotify`](/docs/user-guide/skills/bundled/media/media-spotify) | Spotify: play, search, queue, manage playlists and devices. | `media/spotify` |
| [`youtube-content`](/docs/user-guide/skills/bundled/media/media-youtube-content) | YouTube transcripts to summaries, threads, blogs. | `media/youtube-content` |

## mlops

| Skill | Description | Path |
|-------|-------------|------|
| [`audiocraft-audio-generation`](/docs/user-guide/skills/bundled/mlops/mlops-models-audiocraft) | AudioCraft: MusicGen text-to-music, AudioGen text-to-sound. | `mlops/models/audiocraft` |
| [`dspy`](/docs/user-guide/skills/bundled/mlops/mlops-research-dspy) | DSPy: declarative LM programs, auto-optimize prompts, RAG. | `mlops/research/dspy` |
| [`huggingface-hub`](/docs/user-guide/skills/bundled/mlops/mlops-huggingface-hub) | HuggingFace hf CLI: search/download/upload models, datasets. | `mlops/huggingface-hub` |
| [`llama-cpp`](/docs/user-guide/skills/bundled/mlops/mlops-inference-llama-cpp) | llama.cpp local GGUF inference + HF Hub model discovery. | `mlops/inference/llama-cpp` |
| [`evaluating-llms-harness`](/docs/user-guide/skills/bundled/mlops/mlops-evaluation-lm-evaluation-harness) | lm-eval-harness: benchmark LLMs (MMLU, GSM8K, etc.). | `mlops/evaluation/lm-evaluation-harness` |
| [`obliteratus`](/docs/user-guide/skills/bundled/mlops/mlops-inference-obliteratus) | OBLITERATUS: abliterate LLM refusals (diff-in-means). | `mlops/inference/obliteratus` |
| [`segment-anything-model`](/docs/user-guide/skills/bundled/mlops/mlops-models-segment-anything) | SAM: zero-shot image segmentation via points, boxes, masks. | `mlops/models/segment-anything` |
| [`serving-llms-vllm`](/docs/user-guide/skills/bundled/mlops/mlops-inference-vllm) | vLLM: high-throughput LLM serving, OpenAI API, quantization. | `mlops/inference/vllm` |
| [`weights-and-biases`](/docs/user-guide/skills/bundled/mlops/mlops-evaluation-weights-and-biases) | W&B: log ML experiments, sweeps, model registry, dashboards. | `mlops/evaluation/weights-and-biases` |

## note-taking

| Skill | Description | Path |
|-------|-------------|------|
| [`obsidian`](/docs/user-guide/skills/bundled/note-taking/note-taking-obsidian) | Read, search, create, and edit notes in the Obsidian vault. | `note-taking/obsidian` |

## productivity

| Skill | Description | Path |
|-------|-------------|------|
| [`airtable`](/docs/user-guide/skills/bundled/productivity/productivity-airtable) | Airtable REST API via curl. Records CRUD, filters, upserts. | `productivity/airtable` |
| [`google-workspace`](/docs/user-guide/skills/bundled/productivity/productivity-google-workspace) | Gmail, Calendar, Drive, Docs, Sheets via gws CLI or Python. | `productivity/google-workspace` |
| [`linear`](/docs/user-guide/skills/bundled/productivity/productivity-linear) | Linear: manage issues, projects, teams via GraphQL + curl. | `productivity/linear` |
| [`maps`](/docs/user-guide/skills/bundled/productivity/productivity-maps) | Geocode, POIs, routes, timezones via OpenStreetMap/OSRM. | `productivity/maps` |
| [`nano-pdf`](/docs/user-guide/skills/bundled/productivity/productivity-nano-pdf) | Edit PDF text/typos/titles via nano-pdf CLI (NL prompts). | `productivity/nano-pdf` |
| [`notion`](/docs/user-guide/skills/bundled/productivity/productivity-notion) | Notion API + ntn CLI: pages, databases, markdown, Workers. | `productivity/notion` |
| [`ocr-and-documents`](/docs/user-guide/skills/bundled/productivity/productivity-ocr-and-documents) | Extract text from PDFs/scans (pymupdf, marker-pdf). | `productivity/ocr-and-documents` |
| [`powerpoint`](/docs/user-guide/skills/bundled/productivity/productivity-powerpoint) | Create, read, edit .pptx decks, slides, notes, templates. | `productivity/powerpoint` |
| [`teams-meeting-pipeline`](/docs/user-guide/skills/bundled/productivity/productivity-teams-meeting-pipeline) | Operate the Teams meeting summary pipeline via Jarvis CLI — summarize meetings, inspect pipeline status, replay jobs, manage Microsoft Graph subscriptions. | `productivity/teams-meeting-pipeline` |

## red-teaming

| Skill | Description | Path |
|-------|-------------|------|
| [`godmode`](/docs/user-guide/skills/bundled/red-teaming/red-teaming-godmode) | Jailbreak LLMs: Parseltongue, GODMODE, ULTRAPLINIAN. | `red-teaming/godmode` |

## research

| Skill | Description | Path |
|-------|-------------|------|
| [`arxiv`](/docs/user-guide/skills/bundled/research/research-arxiv) | Search arXiv papers by keyword, author, category, or ID. | `research/arxiv` |
| [`blogwatcher`](/docs/user-guide/skills/bundled/research/research-blogwatcher) | Monitor blogs and RSS/Atom feeds via blogwatcher-cli tool. | `research/blogwatcher` |
| [`llm-wiki`](/docs/user-guide/skills/bundled/research/research-llm-wiki) | Karpathy's LLM Wiki: build/query interlinked markdown KB. | `research/llm-wiki` |
| [`polymarket`](/docs/user-guide/skills/bundled/research/research-polymarket) | Query Polymarket: markets, prices, orderbooks, history. | `research/polymarket` |
| [`research-paper-writing`](/docs/user-guide/skills/bundled/research/research-research-paper-writing) | Write ML papers for NeurIPS/ICML/ICLR: design→submit. | `research/research-paper-writing` |

## smart-home

| Skill | Description | Path |
|-------|-------------|------|
| [`openhue`](/docs/user-guide/skills/bundled/smart-home/smart-home-openhue) | Control Philips Hue lights, scenes, rooms via OpenHue CLI. | `smart-home/openhue` |

## social-media

| Skill | Description | Path |
|-------|-------------|------|
| [`xurl`](/docs/user-guide/skills/bundled/social-media/social-media-xurl) | X/Twitter via xurl CLI: post, search, DM, media, v2 API. | `social-media/xurl` |

## software-development

| Skill | Description | Path |
|-------|-------------|------|
| [`debugging-jarvis-tui-commands`](/docs/user-guide/skills/bundled/software-development/software-development-debugging-jarvis-tui-commands) | Debug Jarvis TUI slash commands: Python, gateway, Ink UI. | `software-development/debugging-jarvis-tui-commands` |
| [`jarvis-agent-skill-authoring`](/docs/user-guide/skills/bundled/software-development/software-development-jarvis-agent-skill-authoring) | Author in-repo SKILL.md: frontmatter, validator, structure. | `software-development/jarvis-agent-skill-authoring` |
| [`node-inspect-debugger`](/docs/user-guide/skills/bundled/software-development/software-development-node-inspect-debugger) | Debug Node.js via --inspect + Chrome DevTools Protocol CLI. | `software-development/node-inspect-debugger` |
| [`plan`](/docs/user-guide/skills/bundled/software-development/software-development-plan) | Plan mode: write markdown plan to .jarvis/plans/, no exec. | `software-development/plan` |
| [`python-debugpy`](/docs/user-guide/skills/bundled/software-development/software-development-python-debugpy) | Debug Python: pdb REPL + debugpy remote (DAP). | `software-development/python-debugpy` |
| [`requesting-code-review`](/docs/user-guide/skills/bundled/software-development/software-development-requesting-code-review) | Pre-commit review: security scan, quality gates, auto-fix. | `software-development/requesting-code-review` |
| [`spike`](/docs/user-guide/skills/bundled/software-development/software-development-spike) | Throwaway experiments to validate an idea before build. | `software-development/spike` |
| [`subagent-driven-development`](/docs/user-guide/skills/bundled/software-development/software-development-subagent-driven-development) | Execute plans via delegate_task subagents (2-stage review). | `software-development/subagent-driven-development` |
| [`systematic-debugging`](/docs/user-guide/skills/bundled/software-development/software-development-systematic-debugging) | 4-phase root cause debugging: understand bugs before fixing. | `software-development/systematic-debugging` |
| [`test-driven-development`](/docs/user-guide/skills/bundled/software-development/software-development-test-driven-development) | TDD: enforce RED-GREEN-REFACTOR, tests before code. | `software-development/test-driven-development` |
| [`writing-plans`](/docs/user-guide/skills/bundled/software-development/software-development-writing-plans) | Write implementation plans: bite-sized tasks, paths, code. | `software-development/writing-plans` |

## yuanbao

| Skill | Description | Path |
|-------|-------------|------|
| [`yuanbao`](/docs/user-guide/skills/bundled/yuanbao/yuanbao-yuanbao) | Yuanbao (元宝) groups: @mention users, query info/members. | `yuanbao` |

## Source: `reference/optional-skills-catalog.md`

---
sidebar_position: 9
title: "Optional Skills Catalog"
description: "Official optional skills shipped with jarvis-agent — install via jarvis skills install official/<category>/<skill>"
---

# Optional Skills Catalog

Optional skills ship with jarvis-agent under `capabilities/optional-skills/` but are **not active by default**. Install them explicitly:

```bash
jarvis skills install official/<category>/<skill>
```

For example:

```bash
jarvis skills install official/blockchain/solana
jarvis skills install official/mlops/flash-attention
```

Each skill below links to a dedicated page with its full definition, setup, and usage.

To uninstall:

```bash
jarvis skills uninstall <skill-name>
```

## autonomous-ai-agents

| Skill | Description |
|-------|-------------|
| [**blackbox**](/docs/user-guide/skills/optional/autonomous-ai-agents/autonomous-ai-agents-blackbox) | Delegate coding tasks to Blackbox AI CLI agent. Multi-model agent with built-in judge that runs tasks through multiple LLMs and picks the best result. Requires the blackbox CLI and a Blackbox AI API key. |
| [**honcho**](/docs/user-guide/skills/optional/autonomous-ai-agents/autonomous-ai-agents-honcho) | Configure and use Honcho memory with Jarvis -- cross-session user modeling, multi-profile peer isolation, observation config, dialectic reasoning, session summaries, and context budget enforcement. Use when setting up Honcho, troubleshoo... |

## blockchain

| Skill | Description |
|-------|-------------|
| [**evm**](/docs/user-guide/skills/optional/blockchain/blockchain-evm) | Read-only EVM client: wallets, tokens, gas across 8 chains. |
| [**hyperliquid**](/docs/user-guide/skills/optional/blockchain/blockchain-hyperliquid) | Hyperliquid market data, account history, trade review. |
| [**solana**](/docs/user-guide/skills/optional/blockchain/blockchain-solana) | Query Solana blockchain data with USD pricing — wallet balances, token portfolios with values, transaction details, NFTs, whale detection, and live network stats. Uses Solana RPC + CoinGecko. No API key required. |

## communication

| Skill | Description |
|-------|-------------|
| [**one-three-one-rule**](/docs/user-guide/skills/optional/communication/communication-one-three-one-rule) | Structured decision-making framework for technical proposals and trade-off analysis. When the user faces a choice between multiple approaches (architecture decisions, tool selection, refactoring strategies, migration paths), this skill p... |

## creative

| Skill | Description |
|-------|-------------|
| [**blender-mcp**](/docs/user-guide/skills/optional/creative/creative-blender-mcp) | Control Blender directly from Jarvis via socket connection to the blender-mcp addon. Create 3D objects, materials, animations, and run arbitrary Blender Python (bpy) code. Use when user wants to create or modify anything in Blender. |
| [**concept-diagrams**](/docs/user-guide/skills/optional/creative/creative-concept-diagrams) | Generate flat, minimal light/dark-aware SVG diagrams as standalone HTML files, using a unified educational visual language with 9 semantic color ramps, sentence-case typography, and automatic dark mode. Best suited for educational and no... |
| [**hyperframes**](/docs/user-guide/skills/optional/creative/creative-hyperframes) | Create HTML-based video compositions, animated title cards, social overlays, captioned talking-head videos, audio-reactive visuals, and shader transitions using HyperFrames. HTML is the source of truth for video. Use when the user wants... |
| [**kanban-video-orchestrator**](/docs/user-guide/skills/optional/creative/creative-kanban-video-orchestrator) | Plan, set up, and monitor a multi-agent video production pipeline backed by Jarvis Kanban. Use when the user wants to make ANY video — narrative film, product/marketing, music video, explainer, ASCII/terminal art, abstract/generative loo... |
| [**meme-generation**](/docs/user-guide/skills/optional/creative/creative-meme-generation) | Generate real meme images by picking a template and overlaying text with Pillow. Produces actual .png meme files. |

## devops

| Skill | Description |
|-------|-------------|
| [**inference-sh-cli**](/docs/user-guide/skills/optional/devops/devops-cli) | Run 150+ AI apps via inference.sh CLI (infsh) — image generation, video creation, LLMs, search, 3D, social automation. Uses the terminal tool. Triggers: inference.sh, infsh, ai apps, flux, veo, image generation, video generation, seedrea... |
| [**docker-management**](/docs/user-guide/skills/optional/devops/devops-docker-management) | Manage Docker containers, images, volumes, networks, and Compose stacks — lifecycle ops, debugging, cleanup, and Dockerfile optimization. |
| [**pinggy-tunnel**](/docs/user-guide/skills/optional/devops/devops-pinggy-tunnel) | Zero-install localhost tunnels over SSH via Pinggy. |
| [**watchers**](/docs/user-guide/skills/optional/devops/devops-watchers) | Poll RSS, JSON APIs, and GitHub with watermark dedup. |

## dogfood

| Skill | Description |
|-------|-------------|
| [**adversarial-ux-test**](/docs/user-guide/skills/optional/dogfood/dogfood-adversarial-ux-test) | Roleplay the most difficult, tech-resistant user for your product. Browse the app as that persona, find every UX pain point, then filter complaints through a pragmatism layer to separate real problems from noise. Creates actionable ticke... |

## email

| Skill | Description |
|-------|-------------|
| [**agentmail**](/docs/user-guide/skills/optional/email/email-agentmail) | Give the agent its own dedicated email inbox via AgentMail. Send, receive, and manage email autonomously using agent-owned email addresses (e.g. jarvis-agent@agentmail.to). |

## finance

| Skill | Description |
|-------|-------------|
| [**3-statement-model**](/docs/user-guide/skills/optional/finance/finance-3-statement-model) | Build fully-integrated 3-statement models (IS, BS, CF) in Excel with working capital schedules, D&A roll-forwards, debt schedule, and the plugs that make cash and retained earnings tie. Pairs with excel-author. |
| [**comps-analysis**](/docs/user-guide/skills/optional/finance/finance-comps-analysis) | Build comparable company analysis in Excel — operating metrics, valuation multiples, statistical benchmarking vs peer sets. Pairs with excel-author. Use for public-company valuation, IPO pricing, sector benchmarking, or outlier detection. |
| [**dcf-model**](/docs/user-guide/skills/optional/finance/finance-dcf-model) | Build institutional-quality DCF valuation models in Excel — revenue projections, FCF build, WACC, terminal value, Bear/Base/Bull scenarios, 5x5 sensitivity tables. Pairs with excel-author. Use for intrinsic-value equity analysis. |
| [**excel-author**](/docs/user-guide/skills/optional/finance/finance-excel-author) | Build auditable Excel workbooks headless with openpyxl — blue/black/green cell conventions, formulas over hardcodes, named ranges, balance checks, sensitivity tables. Use for financial models, audit outputs, reconciliations. |
| [**lbo-model**](/docs/user-guide/skills/optional/finance/finance-lbo-model) | Build leveraged buyout models in Excel — sources & uses, debt schedule, cash sweep, exit multiple, IRR/MOIC sensitivity. Pairs with excel-author. Use for PE screening, sponsor-case valuation, or illustrative LBO in a pitch. |
| [**merger-model**](/docs/user-guide/skills/optional/finance/finance-merger-model) | Build accretion/dilution (merger) models in Excel — pro-forma P&L, synergies, financing mix, EPS impact. Pairs with excel-author. Use for M&A pitches, board materials, or deal evaluation. |
| [**pptx-author**](/docs/user-guide/skills/optional/finance/finance-pptx-author) | Build PowerPoint decks headless with python-pptx. Pairs with excel-author for model-backed decks where every number traces to a workbook cell. Use for pitch decks, IC memos, earnings notes. |
| [**stocks**](/docs/user-guide/skills/optional/finance/finance-stocks) | Stock quotes, history, search, compare, crypto via Yahoo. |

## health

| Skill | Description |
|-------|-------------|
| [**fitness-nutrition**](/docs/user-guide/skills/optional/health/health-fitness-nutrition) | Gym workout planner and nutrition tracker. Search 690+ exercises by muscle, equipment, or category via wger. Look up macros and calories for 380,000+ foods via USDA FoodData Central. Compute BMI, TDEE, one-rep max, macro splits, and body... |
| [**neuroskill-bci**](/docs/user-guide/skills/optional/health/health-neuroskill-bci) | Connect to a running NeuroSkill instance and incorporate the user's real-time cognitive and emotional state (focus, relaxation, mood, cognitive load, drowsiness, heart rate, HRV, sleep staging, and 40+ derived EXG scores) into responses.... |

## mcp

| Skill | Description |
|-------|-------------|
| [**fastmcp**](/docs/user-guide/skills/optional/mcp/mcp-fastmcp) | Build, test, inspect, install, and deploy MCP servers with FastMCP in Python. Use when creating a new MCP server, wrapping an API or database as MCP tools, exposing resources or prompts, or preparing a FastMCP server for Claude Code, Cur... |
| [**mcporter**](/docs/user-guide/skills/optional/mcp/mcp-mcporter) | Use the mcporter CLI to list, configure, auth, and call MCP servers/tools directly (HTTP or stdio), including ad-hoc servers, config edits, and CLI/type generation. |

## migration

| Skill | Description |
|-------|-------------|
| [**openclaw-migration**](/docs/user-guide/skills/optional/migration/migration-openclaw-migration) | Migrate a user's OpenClaw customization footprint into JARVIS. Imports Jarvis-compatible memories, SOUL.md, command allowlists, user skills, and selected workspace assets from ~/.openclaw, then reports exactly what could not be mig... |

## mlops

| Skill | Description |
|-------|-------------|
| [**huggingface-accelerate**](/docs/user-guide/skills/optional/mlops/mlops-accelerate) | Simplest distributed training API. 4 lines to add distributed support to any PyTorch script. Unified API for DeepSpeed/FSDP/Megatron/DDP. Automatic device placement, mixed precision (FP16/BF16/FP8). Interactive config, single launch comm... |
| [**axolotl**](/docs/user-guide/skills/optional/mlops/mlops-training-axolotl) | Axolotl: YAML LLM fine-tuning (LoRA, DPO, GRPO). |
| [**chroma**](/docs/user-guide/skills/optional/mlops/mlops-chroma) | Open-source embedding database for AI applications. Store embeddings and metadata, perform vector and full-text search, filter by metadata. Simple 4-function API. Scales from notebooks to production clusters. Use for semantic search, RAG... |
| [**clip**](/docs/user-guide/skills/optional/mlops/mlops-clip) | OpenAI's model connecting vision and language. Enables zero-shot image classification, image-text matching, and cross-modal retrieval. Trained on 400M image-text pairs. Use for image search, content moderation, or vision-language tasks w... |
| [**faiss**](/docs/user-guide/skills/optional/mlops/mlops-faiss) | Facebook's library for efficient similarity search and clustering of dense vectors. Supports billions of vectors, GPU acceleration, and various index types (Flat, IVF, HNSW). Use for fast k-NN search, large-scale vector retrieval, or whe... |
| [**optimizing-attention-flash**](/docs/user-guide/skills/optional/mlops/mlops-flash-attention) | Optimizes transformer attention with Flash Attention for 2-4x speedup and 10-20x memory reduction. Use when training/running transformers with long sequences (>512 tokens), encountering GPU memory issues with attention, or need faster in... |
| [**guidance**](/docs/user-guide/skills/optional/mlops/mlops-guidance) | Control LLM output with regex and grammars, guarantee valid JSON/XML/code generation, enforce structured formats, and build multi-step workflows with Guidance - Microsoft Research's constrained generation framework |
| [**huggingface-tokenizers**](/docs/user-guide/skills/optional/mlops/mlops-huggingface-tokenizers) | Fast tokenizers optimized for research and production. Rust-based implementation tokenizes 1GB in &lt;20 seconds. Supports BPE, WordPiece, and Unigram algorithms. Train custom vocabularies, track alignments, handle padding/truncation. Integ... |
| [**instructor**](/docs/user-guide/skills/optional/mlops/mlops-instructor) | Extract structured data from LLM responses with Pydantic validation, retry failed extractions automatically, parse complex JSON with type safety, and stream partial results with Instructor - battle-tested structured output library |
| [**lambda-labs-gpu-cloud**](/docs/user-guide/skills/optional/mlops/mlops-lambda-labs) | Reserved and on-demand GPU cloud instances for ML training and inference. Use when you need dedicated GPU instances with simple SSH access, persistent filesystems, or high-performance multi-node clusters for large-scale training. |
| [**llava**](/docs/user-guide/skills/optional/mlops/mlops-llava) | Large Language and Vision Assistant. Enables visual instruction tuning and image-based conversations. Combines CLIP vision encoder with Vicuna/LLaMA language models. Supports multi-turn image chat, visual question answering, and instruct... |
| [**modal-serverless-gpu**](/docs/user-guide/skills/optional/mlops/mlops-modal) | Serverless GPU cloud platform for running ML workloads. Use when you need on-demand GPU access without infrastructure management, deploying ML models as APIs, or running batch jobs with automatic scaling. |
| [**nemo-curator**](/docs/user-guide/skills/optional/mlops/mlops-nemo-curator) | GPU-accelerated data curation for LLM training. Supports text/image/video/audio. Features fuzzy deduplication (16× faster), quality filtering (30+ heuristics), semantic deduplication, PII redaction, NSFW detection. Scales across GPUs wit... |
| [**outlines**](/docs/user-guide/skills/optional/mlops/mlops-inference-outlines) | Outlines: structured JSON/regex/Pydantic LLM generation. |
| [**peft-fine-tuning**](/docs/user-guide/skills/optional/mlops/mlops-peft) | Parameter-efficient fine-tuning for LLMs using LoRA, QLoRA, and 25+ methods. Use when fine-tuning large models (7B-70B) with limited GPU memory, when you need to train &lt;1% of parameters with minimal accuracy loss, or for multi-adapter se... |
| [**pinecone**](/docs/user-guide/skills/optional/mlops/mlops-pinecone) | Managed vector database for production AI applications. Fully managed, auto-scaling, with hybrid search (dense + sparse), metadata filtering, and namespaces. Low latency (&lt;100ms p95). Use for production RAG, recommendation systems, or se... |
| [**pytorch-fsdp**](/docs/user-guide/skills/optional/mlops/mlops-pytorch-fsdp) | Expert guidance for Fully Sharded Data Parallel training with PyTorch FSDP - parameter sharding, mixed precision, CPU offloading, FSDP2 |
| [**pytorch-lightning**](/docs/user-guide/skills/optional/mlops/mlops-pytorch-lightning) | High-level PyTorch framework with Trainer class, automatic distributed training (DDP/FSDP/DeepSpeed), callbacks system, and minimal boilerplate. Scales from laptop to supercomputer with same code. Use when you want clean training loops w... |
| [**qdrant-vector-search**](/docs/user-guide/skills/optional/mlops/mlops-qdrant) | High-performance vector similarity search engine for RAG and semantic search. Use when building production RAG systems requiring fast nearest neighbor search, hybrid search with filtering, or scalable vector storage with Rust-powered per... |
| [**sparse-autoencoder-training**](/docs/user-guide/skills/optional/mlops/mlops-saelens) | Provides guidance for training and analyzing Sparse Autoencoders (SAEs) using SAELens to decompose neural network activations into interpretable features. Use when discovering interpretable features, analyzing superposition, or studying... |
| [**simpo-training**](/docs/user-guide/skills/optional/mlops/mlops-simpo) | Simple Preference Optimization for LLM alignment. Reference-free alternative to DPO with better performance (+6.4 points on AlpacaEval 2.0). No reference model needed, more efficient than DPO. Use for preference alignment when want simpl... |
| [**slime-rl-training**](/docs/user-guide/skills/optional/mlops/mlops-slime) | Provides guidance for LLM post-training with RL using slime, a Megatron+SGLang framework. Use when training GLM models, implementing custom data generation workflows, or needing tight Megatron-LM integration for RL scaling. |
| [**stable-diffusion-image-generation**](/docs/user-guide/skills/optional/mlops/mlops-stable-diffusion) | State-of-the-art text-to-image generation with Stable Diffusion models via HuggingFace Diffusers. Use when generating images from text prompts, performing image-to-image translation, inpainting, or building custom diffusion pipelines. |
| [**tensorrt-llm**](/docs/user-guide/skills/optional/mlops/mlops-tensorrt-llm) | Optimizes LLM inference with NVIDIA TensorRT for maximum throughput and lowest latency. Use for production deployment on NVIDIA GPUs (A100/H100), when you need 10-100x faster inference than PyTorch, or for serving models with quantizatio... |
| [**distributed-llm-pretraining-torchtitan**](/docs/user-guide/skills/optional/mlops/mlops-torchtitan) | Provides PyTorch-native distributed LLM pretraining using torchtitan with 4D parallelism (FSDP2, TP, PP, CP). Use when pretraining Llama 3.1, DeepSeek V3, or custom models at scale from 8 to 512+ GPUs with Float8, torch.compile, and dist... |
| [**fine-tuning-with-trl**](/docs/user-guide/skills/optional/mlops/mlops-training-trl-fine-tuning) | TRL: SFT, DPO, PPO, GRPO, reward modeling for LLM RLHF. |
| [**unsloth**](/docs/user-guide/skills/optional/mlops/mlops-training-unsloth) | Unsloth: 2-5x faster LoRA/QLoRA fine-tuning, less VRAM. |
| [**whisper**](/docs/user-guide/skills/optional/mlops/mlops-whisper) | OpenAI's general-purpose speech recognition model. Supports 99 languages, transcription, translation to English, and language identification. Six model sizes from tiny (39M params) to large (1550M params). Use for speech-to-text, podcast... |

## productivity

| Skill | Description |
|-------|-------------|
| [**canvas**](/docs/user-guide/skills/optional/productivity/productivity-canvas) | Canvas LMS integration — fetch enrolled courses and assignments using API token authentication. |
| [**here.now**](/docs/user-guide/skills/optional/productivity/productivity-here-now) | Publish static sites to &#123;slug&#125;.here.now and store private files in cloud Drives for agent-to-agent handoff. |
| [**memento-flashcards**](/docs/user-guide/skills/optional/productivity/productivity-memento-flashcards) | Spaced-repetition flashcard system. Create cards from facts or text, chat with flashcards using free-text answers graded by the agent, generate quizzes from YouTube transcripts, review due cards with adaptive scheduling, and export/impor... |
| [**shop-app**](/docs/user-guide/skills/optional/productivity/productivity-shop-app) | Shop.app: product search, order tracking, returns, reorder. |
| [**shopify**](/docs/user-guide/skills/optional/productivity/productivity-shopify) | Shopify Admin & Storefront GraphQL APIs via curl. Products, orders, customers, inventory, metafields. |
| [**siyuan**](/docs/user-guide/skills/optional/productivity/productivity-siyuan) | SiYuan Note API for searching, reading, creating, and managing blocks and documents in a self-hosted knowledge base via curl. |
| [**telephony**](/docs/user-guide/skills/optional/productivity/productivity-telephony) | Give Jarvis phone capabilities without core tool changes. Provision and persist a Twilio number, send and receive SMS/MMS, make direct calls, and place AI-driven outbound calls through Bland.ai or Vapi. |

## research

| Skill | Description |
|-------|-------------|
| [**bioinformatics**](/docs/user-guide/skills/optional/research/research-bioinformatics) | Gateway to 400+ bioinformatics skills from bioSkills and ClawBio. Covers genomics, transcriptomics, single-cell, variant calling, pharmacogenomics, metagenomics, structural biology, and more. Fetches domain-specific reference material on... |
| [**darwinian-evolver**](/docs/user-guide/skills/optional/research/research-darwinian-evolver) | Evolve prompts/regex/SQL/code with Imbue's evolution loop. |
| [**domain-intel**](/docs/user-guide/skills/optional/research/research-domain-intel) | Passive domain reconnaissance using Python stdlib. Subdomain discovery, SSL certificate inspection, WHOIS lookups, DNS records, domain availability checks, and bulk multi-domain analysis. No API keys required. |
| [**drug-discovery**](/docs/user-guide/skills/optional/research/research-drug-discovery) | Pharmaceutical research assistant for drug discovery workflows. Search bioactive compounds on ChEMBL, calculate drug-likeness (Lipinski Ro5, QED, TPSA, synthetic accessibility), look up drug-drug interactions via OpenFDA, interpret ADMET... |
| [**duckduckgo-search**](/docs/user-guide/skills/optional/research/research-duckduckgo-search) | Free web search via DuckDuckGo — text, news, images, videos. No API key needed. Prefer the `ddgs` CLI when installed; use the Python DDGS library only after verifying that `ddgs` is available in the current runtime. |
| [**gitnexus-explorer**](/docs/user-guide/skills/optional/research/research-gitnexus-explorer) | Index a codebase with GitNexus and serve an interactive knowledge graph via web UI + Cloudflare tunnel. |
| [**osint-investigation**](/docs/user-guide/skills/optional/research/research-osint-investigation) | Public-records OSINT investigation framework — SEC EDGAR filings, USAspending contracts, Senate lobbying, OFAC sanctions, ICIJ offshore leaks, NYC property records (ACRIS), OpenCorporates registries, CourtListener court records, Wayback... |
| [**parallel-cli**](/docs/user-guide/skills/optional/research/research-parallel-cli) | Optional vendor skill for Parallel CLI — agent-native web search, extraction, deep research, enrichment, FindAll, and monitoring. Prefer JSON output and non-interactive flows. |
| [**qmd**](/docs/user-guide/skills/optional/research/research-qmd) | Search personal knowledge bases, notes, docs, and meeting transcripts locally using qmd — a hybrid retrieval engine with BM25, vector search, and LLM reranking. Supports CLI and MCP integration. |
| [**scrapling**](/docs/user-guide/skills/optional/research/research-scrapling) | Web scraping with Scrapling - HTTP fetching, stealth browser automation, Cloudflare bypass, and spider crawling via CLI and Python. |
| [**searxng-search**](/docs/user-guide/skills/optional/research/research-searxng-search) | Free meta-search via SearXNG — aggregates results from 70+ search engines. Self-hosted or use a public instance. No API key needed. Falls back automatically when the web search toolset is unavailable. |

## security

| Skill | Description |
|-------|-------------|
| [**1password**](/docs/user-guide/skills/optional/security/security-1password) | Set up and use 1Password CLI (op). Use when installing the CLI, enabling desktop app integration, signing in, and reading/injecting secrets for commands. |
| [**oss-forensics**](/docs/user-guide/skills/optional/security/security-oss-forensics) | Supply chain investigation, evidence recovery, and forensic analysis for GitHub repositories. Covers deleted commit recovery, force-push detection, IOC extraction, multi-source evidence collection, hypothesis formation/validation, and st... |
| [**sherlock**](/docs/user-guide/skills/optional/security/security-sherlock) | OSINT username search across 400+ social networks. Hunt down social media accounts by username. |

## software-development

| Skill | Description |
|-------|-------------|
| [**rest-graphql-debug**](/docs/user-guide/skills/optional/software-development/software-development-rest-graphql-debug) | Debug REST/GraphQL APIs: status codes, auth, schemas, repro. |

## web-development

| Skill | Description |
|-------|-------------|
| [**page-agent**](/docs/user-guide/skills/optional/web-development/web-development-page-agent) | Embed alibaba/page-agent into your own web application — a pure-JavaScript in-page GUI agent that ships as a single &lt;script> tag or npm package and lets end-users of your site drive the UI with natural language ("click login, fill userna... |

---

## Contributing Optional Skills

To add a new optional skill to the repository:

1. Create a directory under `capabilities/optional-skills/<category>/<skill-name>/`
2. Add a `SKILL.md` with standard frontmatter (name, description, version, author)
3. Include any supporting files in `references/`, `templates/`, or `scripts/` subdirectories
4. Submit a pull request — the skill will appear in this catalog and get its own docs page once merged
