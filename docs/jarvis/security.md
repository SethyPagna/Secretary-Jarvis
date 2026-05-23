# Security

> Imported from the local source documentation and rewritten for the JARVIS desktop-first app. Run commands from the integrated Home terminal unless a section explicitly refers to packaging or automation.

## Source: `user-guide/security.md`

---
sidebar_position: 8
title: "Security"
description: "Security model, dangerous command approval, user authorization, container isolation, and production deployment best practices"
---

# Security

JARVIS is designed with a defense-in-depth security model. This page covers every security boundary — from command approval to container isolation to user authorization on messaging platforms.

## Overview

The security model has seven layers:

1. **User authorization** — who can talk to the agent (allowlists, DM pairing)
2. **Dangerous command approval** — human-in-the-loop for destructive operations
3. **Container isolation** — Docker/Singularity/Modal sandboxing with hardened settings
4. **MCP credential filtering** — environment variable isolation for MCP subprocesses
5. **Context file scanning** — prompt injection detection in project files
6. **Cross-session isolation** — sessions cannot access each other's data or state; cron job storage paths are hardened against path traversal attacks
7. **Input sanitization** — working directory parameters in terminal tool backends are validated against an allowlist to prevent shell injection

## Dangerous Command Approval

Before executing any command, Jarvis checks it against a curated list of dangerous patterns. If a match is found, the user must explicitly approve it.

### Approval Modes

The approval system supports three modes, configured via `approvals.mode` in `~/.jarvis/config.yaml`:

```yaml
approvals:
  mode: manual    # manual | smart | off
  timeout: 60     # seconds to wait for user response (default: 60)
```

| Mode | Behavior |
|------|----------|
| **manual** (default) | Always prompt the user for approval on dangerous commands |
| **smart** | Use an auxiliary LLM to assess risk. Low-risk commands (e.g., `python -c "print('hello')"`) are auto-approved. Genuinely dangerous commands are auto-denied. Uncertain cases escalate to a manual prompt. |
| **off** | Disable all approval checks — equivalent to running with `--yolo`. All commands execute without prompts. |

:::warning
Setting `approvals.mode: off` disables all safety prompts. Use only in trusted environments (CI/CD, containers, etc.).
:::

### YOLO Mode

YOLO mode bypasses **all** dangerous command approval prompts for the current session. It can be activated three ways:

1. **CLI flag**: Start a session with `jarvis --yolo` or `jarvis chat --yolo`
2. **Slash command**: Type `/yolo` during a session to toggle it on/off
3. **Environment variable**: Set `JARVIS_YOLO_MODE=1`

The `/yolo` command is a **toggle** — each use flips the mode on or off:

```
> /yolo
  ⚡ YOLO mode ON — all commands auto-approved. Use with caution.

> /yolo
  ⚠ YOLO mode OFF — dangerous commands will require approval.
```

YOLO mode is available in both CLI and gateway sessions. Internally, it sets the `JARVIS_YOLO_MODE` environment variable which is checked before every command execution.

When YOLO is active, Jarvis shows two persistent visual reminders so it's hard to forget that approval prompts are bypassed:

- A red banner line at session start when YOLO is already active: `⚠ YOLO mode — all approval prompts bypassed`. Hidden when YOLO is off so the default banner stays uncluttered.
- A `⚠ YOLO` fragment in the status bar across all width tiers, updated live as you toggle YOLO on or off (rich-text renderer and plain-text fallback).

:::danger
YOLO mode disables **all** dangerous command safety checks for the session — **except** the hardline blocklist (see below). Use only when you fully trust the commands being generated (e.g., well-tested automation scripts in disposable environments).
:::

For destructive session slash commands (`/clear`, `/new` / `/reset`, `/undo`, `/exit --delete`), the CLI also prompts for confirmation before running them. See [Slash Commands — Confirmation prompts for destructive commands](../reference/slash-commands.md#confirmation-prompts-for-destructive-commands).

### Hardline Blocklist (Always-On Floor)

Some commands are so catastrophic — irreversible filesystem wipes, fork bombs, direct block-device writes — that Jarvis refuses to run them **regardless** of:

- `--yolo` / `/yolo` toggled on
- `approvals.mode: off`
- Cron jobs running in headless `approve` mode
- User explicitly clicking "allow always"

The blocklist is the floor below `--yolo`. It trips **before** the approval layer even sees the command, and there's no override flag. Patterns currently covered (not exhaustive; kept in sync with `tools/approval.py::UNRECOVERABLE_BLOCKLIST`):

| Pattern | Why it's hardline |
|---|---|
| `rm -rf /` and obvious variants | Wipes the filesystem root |
| `rm -rf --no-preserve-root /` | The explicit "yes I mean root" variant |
| `:(){ :\|:& };:` (bash fork bomb) | Pegs the host until reboot |
| `mkfs.*` on a mounted root device | Formats the live system |
| `dd if=/dev/zero of=/dev/sd*` | Zeroes a physical disk |
| Piping untrusted URLs to `sh` at the rootfs top level | Remote-code-execution attack vector too broad to approve |

If you hit the blocklist, the tool call returns an explanatory error to the agent and nothing runs. If a legitimate workflow needs one of these commands (you're the operator of a wipe-and-reinstall pipeline, for example), run it outside the agent.

### Approval Timeout

When a dangerous command prompt appears, the user has a configurable amount of time to respond. If no response is given within the timeout, the command is **denied** by default (fail-closed).

Configure the timeout in `~/.jarvis/config.yaml`:

```yaml
approvals:
  timeout: 60  # seconds (default: 60)
```

### What Triggers Approval

The following patterns trigger approval prompts (defined in `tools/approval.py`):

| Pattern | Description |
|---------|-------------|
| `rm -r` / `rm --recursive` | Recursive delete |
| `rm ... /` | Delete in root path |
| `chmod 777/666` / `o+w` / `a+w` | World/other-writable permissions |
| `chmod --recursive` with unsafe perms | Recursive world/other-writable (long flag) |
| `chown -R root` / `chown --recursive root` | Recursive chown to root |
| `mkfs` | Format filesystem |
| `dd if=` | Disk copy |
| `> /dev/sd` | Write to block device |
| `DROP TABLE/DATABASE` | SQL DROP |
| `DELETE FROM` (without WHERE) | SQL DELETE without WHERE |
| `TRUNCATE TABLE` | SQL TRUNCATE |
| `> /etc/` | Overwrite system config |
| `systemctl stop/restart/disable/mask` | Stop/restart/disable system services |
| `kill -9 -1` | Kill all processes |
| `pkill -9` | Force kill processes |
| Fork bomb patterns | Fork bombs |
| `bash -c` / `sh -c` / `zsh -c` / `ksh -c` | Shell command execution via `-c` flag (including combined flags like `-lc`) |
| `python -e` / `perl -e` / `ruby -e` / `node -c` | Script execution via `-e`/`-c` flag |
| `curl ... \| sh` / `wget ... \| sh` | Pipe remote content to shell |
| `bash <(curl ...)` / `sh <(wget ...)` | Execute remote script via process substitution |
| `tee` to `/etc/`, `~/.ssh/`, `~/.jarvis/.env` | Overwrite sensitive file via tee |
| `>` / `>>` to `/etc/`, `~/.ssh/`, `~/.jarvis/.env` | Overwrite sensitive file via redirection |
| `xargs rm` | xargs with rm |
| `find -exec rm` / `find -delete` | Find with destructive actions |
| `cp`/`mv`/`install` to `/etc/` | Copy/move file into system config |
| `sed -i` / `sed --in-place` on `/etc/` | In-place edit of system config |
| `pkill`/`killall` jarvis/gateway | Self-termination prevention |
| `gateway run` with `&`/`disown`/`nohup`/`setsid` | Prevents starting gateway outside service manager |

:::info
**Container bypass**: When running in `docker`, `singularity`, `modal`, `daytona`, or `vercel_sandbox` backends, dangerous command checks are **skipped** because the container itself is the security boundary. Destructive commands inside a container can't harm the host.
:::

### Approval Flow (CLI)

In the interactive CLI, dangerous commands show an inline approval prompt:

```
  ⚠️  DANGEROUS COMMAND: recursive delete
      rm -rf /tmp/old-project

      [o]nce  |  [s]ession  |  [a]lways  |  [d]eny

      Choice [o/s/a/D]:
```

The four options:

- **once** — allow this single execution
- **session** — allow this pattern for the rest of the session
- **always** — add to permanent allowlist (saved to `config.yaml`)
- **deny** (default) — block the command

### Approval Flow (Gateway/Messaging)

On messaging platforms, the agent sends the dangerous command details to the chat and waits for the user to reply:

- Reply **yes**, **y**, **approve**, **ok**, or **go** to approve
- Reply **no**, **n**, **deny**, or **cancel** to deny

The `JARVIS_EXEC_ASK=1` environment variable is automatically set when running the gateway.

### Permanent Allowlist

Commands approved with "always" are saved to `~/.jarvis/config.yaml`:

```yaml
# Permanently allowed dangerous command patterns
command_allowlist:
  - rm
  - systemctl
```

These patterns are loaded at startup and silently approved in all future sessions.

:::tip
Use `jarvis config edit` to review or remove patterns from your permanent allowlist.
:::

## User Authorization (Gateway)

When running the messaging gateway, Jarvis controls who can interact with the bot through a layered authorization system.

### Authorization Check Order

The `_is_user_authorized()` method checks in this order:

1. **Per-platform allow-all flag** (e.g., `DISCORD_ALLOW_ALL_USERS=true`)
2. **DM pairing approved list** (users approved via pairing codes)
3. **Platform-specific allowlists** (e.g., `TELEGRAM_ALLOWED_USERS=12345,67890`)
4. **Global allowlist** (`GATEWAY_ALLOWED_USERS=12345,67890`)
5. **Global allow-all** (`GATEWAY_ALLOW_ALL_USERS=true`)
6. **Default: deny**

### Platform Allowlists

Set allowed user IDs as comma-separated values in `~/.jarvis/.env`:

```bash
# Platform-specific allowlists
TELEGRAM_ALLOWED_USERS=123456789,987654321
DISCORD_ALLOWED_USERS=111222333444555666
WHATSAPP_ALLOWED_USERS=15551234567
SLACK_ALLOWED_USERS=U01ABC123

# Cross-platform allowlist (checked for all platforms)
GATEWAY_ALLOWED_USERS=123456789

# Per-platform allow-all (use with caution)
DISCORD_ALLOW_ALL_USERS=true

# Global allow-all (use with extreme caution)
GATEWAY_ALLOW_ALL_USERS=true
```

:::warning
If **no allowlists are configured** and `GATEWAY_ALLOW_ALL_USERS` is not set, **all users are denied**. The gateway logs a warning at startup:

```
No user allowlists configured. All unauthorized users will be denied.
Set GATEWAY_ALLOW_ALL_USERS=true in ~/.jarvis/.env to allow open access,
or configure platform allowlists (e.g., TELEGRAM_ALLOWED_USERS=your_id).
```
:::

### DM Pairing System

For more flexible authorization, Jarvis includes a code-based pairing system. Instead of requiring user IDs upfront, unknown users receive a one-time pairing code that the bot owner approves via the CLI.

**How it works:**

1. An unknown user sends a DM to the bot
2. The bot replies with an 8-character pairing code
3. The bot owner runs `jarvis pairing approve <platform> <code>` on the CLI
4. The user is permanently approved for that platform

Control how unauthorized direct messages are handled in `~/.jarvis/config.yaml`:

```yaml
unauthorized_dm_behavior: pair

whatsapp:
  unauthorized_dm_behavior: ignore
```

- `pair` is the default. Unauthorized DMs get a pairing code reply.
- `ignore` silently drops unauthorized DMs.
- Platform sections override the global default, so you can keep pairing on Telegram while keeping WhatsApp silent.

**Security features** (based on OWASP + NIST SP 800-63-4 guidance):

| Feature | Details |
|---------|---------|
| Code format | 8-char from 32-char unambiguous alphabet (no 0/O/1/I) |
| Randomness | Cryptographic (`secrets.choice()`) |
| Code TTL | 1 hour expiry |
| Rate limiting | 1 request per user per 10 minutes |
| Pending limit | Max 3 pending codes per platform |
| Lockout | 5 failed approval attempts → 1-hour lockout |
| File security | `chmod 0600` on all pairing data files |
| Logging | Codes are never logged to stdout |

**Pairing CLI commands:**

```bash
# List pending and approved users
jarvis pairing list

# Approve a pairing code
jarvis pairing approve telegram ABC12DEF

# Revoke a user's access
jarvis pairing revoke telegram 123456789

# Clear all pending codes
jarvis pairing clear-pending
```

**Storage:** Pairing data is stored in `~/.jarvis/pairing/` with per-platform JSON files:
- `{platform}-pending.json` — pending pairing requests
- `{platform}-approved.json` — approved users
- `_rate_limits.json` — rate limit and lockout tracking

## Container Isolation

When using the `docker` terminal backend, Jarvis applies strict security hardening to every container.

### Docker Security Flags

Every container runs with these flags (defined in `tools/environments/docker.py`):

```python
_SECURITY_ARGS = [
    "--cap-drop", "ALL",                          # Drop ALL Linux capabilities
    "--cap-add", "DAC_OVERRIDE",                  # Root can write to bind-mounted dirs
    "--cap-add", "CHOWN",                         # Package managers need file ownership
    "--cap-add", "FOWNER",                        # Package managers need file ownership
    "--security-opt", "no-new-privileges",         # Block privilege escalation
    "--pids-limit", "256",                         # Limit process count
    "--tmpfs", "/tmp:rw,nosuid,size=512m",         # Size-limited /tmp
    "--tmpfs", "/var/tmp:rw,noexec,nosuid,size=256m",  # No-exec /var/tmp
    "--tmpfs", "/run:rw,noexec,nosuid,size=64m",   # No-exec /run
]
```

### Resource Limits

Container resources are configurable in `~/.jarvis/config.yaml`:

```yaml
terminal:
  backend: docker
  docker_image: "nikolaik/python-nodejs:python3.11-nodejs20"
  docker_forward_env: []  # Explicit allowlist only; empty keeps secrets out of the container
  container_cpu: 1        # CPU cores
  container_memory: 5120  # MB (default 5GB)
  container_disk: 51200   # MB (default 50GB, requires overlay2 on XFS)
  container_persistent: true  # Persist filesystem across sessions
```

### Filesystem Persistence

- **Persistent mode** (`container_persistent: true`): Bind-mounts `/workspace` and `/root` from `~/.jarvis/sandboxes/docker/<task_id>/`
- **Ephemeral mode** (`container_persistent: false`): Uses tmpfs for workspace — everything is lost on cleanup

:::tip
For production gateway deployments, use `docker`, `modal`, `daytona`, or `vercel_sandbox` backend to isolate agent commands from your host system. This eliminates the need for dangerous command approval entirely.
:::

:::warning
If you add names to `terminal.docker_forward_env`, those variables are intentionally injected into the container for terminal commands. This is useful for task-specific credentials like `GITHUB_TOKEN`, but it also means code running in the container can read and exfiltrate them.
:::

## Terminal Backend Security Comparison

| Backend | Isolation | Dangerous Cmd Check | Best For |
|---------|-----------|-------------------|----------|
| **local** | None — runs on host | ✅ Yes | Development, trusted users |
| **ssh** | Remote machine | ✅ Yes | Running on a separate server |
| **docker** | Container | ❌ Skipped (container is boundary) | Production gateway |
| **singularity** | Container | ❌ Skipped | HPC environments |
| **modal** | Cloud sandbox | ❌ Skipped | Scalable cloud isolation |
| **daytona** | Cloud sandbox | ❌ Skipped | Persistent cloud workspaces |
| **vercel_sandbox** | Cloud microVM | ❌ Skipped | Cloud execution with snapshot persistence |

## Environment Variable Passthrough {#environment-variable-passthrough}

Both `execute_code` and `terminal` strip sensitive environment variables from child processes to prevent credential exfiltration by LLM-generated code. However, skills that declare `required_environment_variables` legitimately need access to those vars.

### How It Works

Two mechanisms allow specific variables through the sandbox filters:

**1. Skill-scoped passthrough (automatic)**

When a skill is loaded (via `skill_view` or the `/skill` command) and declares `required_environment_variables`, any of those vars that are actually set in the environment are automatically registered as passthrough. Missing vars (still in setup-needed state) are **not** registered.

```yaml
# In a skill's SKILL.md frontmatter
required_environment_variables:
  - name: TENOR_API_KEY
    prompt: Tenor API key
    help: Get a key from https://developers.google.com/tenor
```

After loading this skill, `TENOR_API_KEY` passes through to `execute_code`, `terminal` (local), **and remote backends (Docker, Modal)** — no manual configuration needed.

:::info Docker & Modal
Prior to v0.5.1, Docker's `forward_env` was a separate system from the skill passthrough. They are now merged — skill-declared env vars are automatically forwarded into Docker containers and Modal sandboxes without needing to add them to `docker_forward_env` manually.
:::

**2. Config-based passthrough (manual)**

For env vars not declared by any skill, add them to `terminal.env_passthrough` in `config.yaml`:

```yaml
terminal:
  env_passthrough:
    - MY_CUSTOM_KEY
    - ANOTHER_TOKEN
```

### Credential File Passthrough (OAuth tokens, etc.) {#credential-file-passthrough}

Some skills need **files** (not just env vars) in the sandbox — for example, Google Workspace stores OAuth tokens as `google_token.json` under the active profile's `JARVIS_HOME`. Skills declare these in frontmatter:

```yaml
required_credential_files:
  - path: google_token.json
    description: Google OAuth2 token (created by setup script)
  - path: google_client_secret.json
    description: Google OAuth2 client credentials
```

When loaded, Jarvis checks if these files exist in the active profile's `JARVIS_HOME` and registers them for mounting:

- **Docker**: Read-only bind mounts (`-v host:container:ro`)
- **Modal**: Mounted at sandbox creation + synced before each command (handles mid-session OAuth setup)
- **Local**: No action needed (files already accessible)

You can also list credential files manually in `config.yaml`:

```yaml
terminal:
  credential_files:
    - google_token.json
    - my_custom_oauth_token.json
```

Paths are relative to `~/.jarvis/`. Files are mounted to `/root/.jarvis/` inside the container.

### What Each Sandbox Filters

| Sandbox | Default Filter | Passthrough Override |
|---------|---------------|---------------------|
| **execute_code** | Blocks vars containing `KEY`, `TOKEN`, `SECRET`, `PASSWORD`, `CREDENTIAL`, `PASSWD`, `AUTH` in name; only allows safe-prefix vars through | ✅ Passthrough vars bypass both checks |
| **terminal** (local) | Blocks explicit Jarvis infrastructure vars (provider keys, gateway tokens, tool API keys) | ✅ Passthrough vars bypass the blocklist |
| **terminal** (Docker) | No host env vars by default | ✅ Passthrough vars + `docker_forward_env` forwarded via `-e` |
| **terminal** (Modal) | No host env/files by default | ✅ Credential files mounted; env passthrough via sync |
| **MCP** | Blocks everything except safe system vars + explicitly configured `env` | ❌ Not affected by passthrough (use MCP `env` config instead) |

### Security Considerations

- The passthrough only affects vars you or your skills explicitly declare — the default security posture is unchanged for arbitrary LLM-generated code
- Credential files are mounted **read-only** into Docker containers
- Skills Guard scans skill content for suspicious env access patterns before installation
- Missing/unset vars are never registered (you can't leak what doesn't exist)
- Jarvis infrastructure secrets (provider API keys, gateway tokens) should never be added to `env_passthrough` — they have dedicated mechanisms

## MCP Credential Handling

MCP (Model Context Protocol) server subprocesses receive a **filtered environment** to prevent accidental credential leakage.

### Safe Environment Variables

Only these variables are passed through from the host to MCP stdio subprocesses:

```
PATH, HOME, USER, LANG, LC_ALL, TERM, SHELL, TMPDIR
```

Plus any `XDG_*` variables. All other environment variables (API keys, tokens, secrets) are **stripped**.

Variables explicitly defined in the MCP server's `env` config are passed through:

```yaml
mcp_servers:
  github:
    command: "npx"
    args: ["-y", "@modelcontextprotocol/server-github"]
    env:
      GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_..."  # Only this is passed
```

### Credential Redaction

Error messages from MCP tools are sanitized before being returned to the LLM. The following patterns are replaced with `[REDACTED]`:

- GitHub PATs (`ghp_...`)
- OpenAI-style keys (`sk-...`)
- Bearer tokens
- `token=`, `key=`, `API_KEY=`, `password=`, `secret=` parameters

### Website Access Policy

You can restrict which websites the agent can access through its web and browser tools. This is useful for preventing the agent from accessing internal services, admin panels, or other sensitive URLs.

```yaml
# In ~/.jarvis/config.yaml
security:
  website_blocklist:
    enabled: true
    domains:
      - "*.internal.company.com"
      - "admin.example.com"
    shared_files:
      - "/etc/jarvis/blocked-sites.txt"
```

When a blocked URL is requested, the tool returns an error explaining the domain is blocked by policy. The blocklist is enforced across `web_search`, `web_extract`, `browser_navigate`, and all URL-capable tools.

See [Website Blocklist](/docs/user-guide/configuration#website-blocklist) in the configuration guide for full details.

### SSRF Protection

All URL-capable tools (web search, web extract, vision, browser) validate URLs before fetching them to prevent Server-Side Request Forgery (SSRF) attacks. Blocked addresses include:

- **Private networks** (RFC 1918): `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
- **Loopback**: `127.0.0.0/8`, `::1`
- **Link-local**: `169.254.0.0/16` (includes cloud metadata at `169.254.169.254`)
- **CGNAT / shared address space** (RFC 6598): `100.64.0.0/10` (Tailscale, WireGuard VPNs)
- **Cloud metadata hostnames**: `metadata.google.internal`, `metadata.goog`
- **Reserved, multicast, and unspecified addresses**

SSRF protection is always active for internet-facing use and DNS failures are treated as blocked (fail-closed). Redirect chains are re-validated at each hop to prevent redirect-based bypasses.

#### Intentionally allowing private URLs

Some setups legitimately need private/internal URL access — home networks that resolve `home.arpa` to RFC 1918 space, LAN-only Ollama/llama.cpp endpoints, internal wikis, cloud metadata debugging, and the like. For those cases there's a global opt-out:

```yaml
security:
  allow_private_urls: true   # default: false
```

When on, web tools, the browser, vision URL fetches, and gateway media downloads no longer reject RFC 1918 / loopback / link-local / CGNAT / cloud-metadata destinations. **This is a deliberate trust boundary** — only enable it on machines where the agent running arbitrary prompt-injected URLs against the local network is an acceptable risk. Public-facing gateways should leave it off.

The host-substring guard (which blocks lookalike Unicode domain tricks even when the underlying IP is public) stays on regardless of this setting.

### Tirith Pre-Exec Security Scanning

Jarvis integrates [tirith](https://github.com/sheeki03/tirith) for content-level command scanning before execution. Tirith detects threats that pattern matching alone misses:

- Homograph URL spoofing (internationalized domain attacks)
- Pipe-to-interpreter patterns (`curl | bash`, `wget | sh`)
- Terminal injection attacks

Tirith auto-installs from GitHub releases on first use with SHA-256 checksum verification (and cosign provenance verification if cosign is available).

```yaml
# In ~/.jarvis/config.yaml
security:
  tirith_enabled: true       # Enable/disable tirith scanning (default: true)
  tirith_path: "tirith"      # Path to tirith binary (default: PATH lookup)
  tirith_timeout: 5          # Subprocess timeout in seconds
  tirith_fail_open: true     # Allow execution when tirith is unavailable (default: true)
```

When `tirith_fail_open` is `true` (default), commands proceed if tirith is not installed or times out. Set to `false` in high-security environments to block commands when tirith is unavailable.

Tirith ships prebuilt binaries for Linux (x86_64 / aarch64) and macOS (x86_64 / arm64). On platforms with no prebuilt binary (Windows, etc.), tirith is silently skipped — pattern-matching guards still run, and the CLI does not surface an "unavailable" banner. To use tirith on Windows, run Jarvis under WSL.

Tirith's verdict integrates with the approval flow: safe commands pass through, while both suspicious and blocked commands trigger user approval with the full tirith findings (severity, title, description, safer alternatives). Users can approve or deny — the default choice is deny to keep unattended scenarios secure.

### Context File Injection Protection

Context files (AGENTS.md, .cursorrules, SOUL.md) are scanned for prompt injection before being included in the system prompt. The scanner checks for:

- Instructions to ignore/disregard prior instructions
- Hidden HTML comments with suspicious keywords
- Attempts to read secrets (`.env`, `credentials`, `.netrc`)
- Credential exfiltration via `curl`
- Invisible Unicode characters (zero-width spaces, bidirectional overrides)

Blocked files show a warning:

```
[BLOCKED: AGENTS.md contained potential prompt injection (prompt_injection). Content not loaded.]
```

## Best Practices for Production Deployment

### Gateway Deployment Checklist

1. **Set explicit allowlists** — never use `GATEWAY_ALLOW_ALL_USERS=true` in production
2. **Use container backend** — set `terminal.backend: docker` in config.yaml
3. **Restrict resource limits** — set appropriate CPU, memory, and disk limits
4. **Store secrets securely** — keep API keys in `~/.jarvis/.env` with proper file permissions
5. **Enable DM pairing** — use pairing codes instead of hardcoding user IDs when possible
6. **Review command allowlist** — periodically audit `command_allowlist` in config.yaml
7. **Set `MESSAGING_CWD`** — don't let the agent operate from sensitive directories
8. **Run as non-root** — never run the gateway as root
9. **Monitor logs** — check `~/.jarvis/logs/` for unauthorized access attempts
10. **Keep updated** — run `jarvis update` regularly for security patches

### Securing API Keys

```bash
# Set proper permissions on the .env file
chmod 600 ~/.jarvis/.env

# Keep separate keys for different services
# Never commit .env files to version control
```

### Network Isolation

For maximum security, run the gateway on a separate machine or VM. Set `terminal.backend: ssh` in `config.yaml`, then provide host details via environment variables in `~/.jarvis/.env`:

```yaml
# ~/.jarvis/config.yaml
terminal:
  backend: ssh
```

```bash
# ~/.jarvis/.env
TERMINAL_SSH_HOST=agent-worker.local
TERMINAL_SSH_USER=jarvis
TERMINAL_SSH_KEY=~/.ssh/jarvis_agent_key
```

The SSH connection details live in `.env` (not `config.yaml`) so they aren't checked in or shared along with profile exports. This keeps the gateway's messaging connections separate from the agent's command execution.

## Supply-chain advisory checking

Jarvis ships with a built-in advisory scanner that flags Python packages in the active venv that match a curated catalog of known-compromised versions (supply-chain worms like the May 2026 `mistralai 2.4.6` poisoning). Implementation lives in `jarvis_cli/security_advisories.py`.

How it runs:

- **CLI startup banner.** A one-line warning is printed if any advisory matches, with a pointer to `jarvis doctor` for the full remediation.
- **`jarvis doctor`.** Surfaces every active advisory with version specifics and 2-4 step remediation instructions.
- **Gateway startup.** Logged to `gateway.log`; the first interactive message gets a short operator banner.

Each advisory carries a stable id. Once you have read and acted on it you can dismiss it for good:

```bash
jarvis doctor --ack <advisory-id>
```

The ack is persisted to `config.security.acked_advisories` and survives restart. Old advisories are intentionally **not** removed from the catalog — leaving them in place keeps fresh installs warned about historically poisoned versions that might still be cached in a private mirror.

The check itself is stdlib-only and runs from one `importlib.metadata.version()` lookup per advisory, so it's safe to run on every startup.

### Lazy install of optional dependencies

Many features (Mistral TTS, ElevenLabs, Honcho memory, Bedrock, Slack, Matrix, …) depend on Python packages that not every user needs. Jarvis installs these **lazily** on first use rather than eagerly under `jarvis-agent[all]`. The implementation lives in `tools/lazy_deps.py`.

The trade-off this fixes:

- **Fragility.** When one extra's transitive dependency becomes unavailable on PyPI (quarantined for malware, yanked, broken upload), the entire `[all]` resolve would fail and fresh installs would silently fall back to a stripped tier — losing 10+ unrelated extras at once. Lazy install isolates each backend so one poisoned dep can't break unrelated features.
- **Bloat.** A user who only ever talks to one provider no longer pulls hundreds of packages they will never import.

How it works:

1. A backend module calls `ensure("feature.name")` at the top of its first-import path.
2. If the deps are missing, `ensure` checks `security.allow_lazy_installs` in `config.yaml` (default `true`) and runs a venv-scoped `pip install` for the allowlisted specs.
3. If the install fails or the user has disabled lazy installs, the call raises `FeatureUnavailable` with the actual pip stderr and a pointer at `jarvis tools`.

Security guarantees enforced by `tools/lazy_deps.py`:

| Guarantee | What it means |
|---|---|
| Venv-scoped only | Installs target `sys.executable` in the active venv — never the system Python |
| PyPI by name only | Specs accept `"package>=1.0,<2"` syntax. No `--index-url`, `git+https://`, or file: paths — a malicious `config.yaml` cannot redirect the install |
| Allowlist | Only specs that appear in the in-tree `LAZY_DEPS` map can be installed via this path. A typo in a feature name does NOT get install-anything semantics |
| Opt-out | Set `security.allow_lazy_installs: false` to disable runtime installs entirely. Useful for restricted networks or strict security postures |
| No silent retries | Failures surface as `FeatureUnavailable` — no caching of bad state, no retry storms |

To disable runtime installs:

```yaml
# ~/.jarvis/config.yaml
security:
  allow_lazy_installs: false
```

When disabled, backends that need optional deps will tell the user to run the install manually (`pip install …`) or pick a different backend via `jarvis tools`.

## Source: `user-guide/features/credential-pools.md`

---
title: Credential Pools
description: Pool multiple API keys or OAuth tokens per provider for automatic rotation and rate limit recovery.
sidebar_label: Credential Pools
sidebar_position: 9
---

# Credential Pools

Credential pools let you register multiple API keys or OAuth tokens for the same provider. When one key hits a rate limit or billing quota, Jarvis automatically rotates to the next healthy key — keeping your session alive without switching providers.

This is different from [fallback providers](./fallback-providers.md), which switch to a *different* provider entirely. Credential pools are same-provider rotation; fallback providers are cross-provider failover. Pools are tried first — if all pool keys are exhausted, *then* the fallback provider activates.

## How It Works

```
Your request
  → Pick key from pool (round_robin / least_used / fill_first / random)
  → Send to provider
  → 429 rate limit?
      → Retry same key once (transient blip)
      → Second 429 → rotate to next pool key
      → All keys exhausted → fallback_model (different provider)
  → 402 billing error?
      → Immediately rotate to next pool key (24h cooldown)
  → 401 auth expired?
      → Try refreshing the token (OAuth)
      → Refresh failed → rotate to next pool key
  → Success → continue normally
```

## Quick Start

If you already have an API key set in `.env`, Jarvis auto-discovers it as a 1-key pool. To benefit from pooling, add more keys:

```bash
# Add a second OpenRouter key
jarvis auth add openrouter --api-key sk-or-v1-your-second-key

# Add a second Anthropic key
jarvis auth add anthropic --type api-key --api-key sk-ant-api03-your-second-key

# Add an Anthropic OAuth credential (requires Claude Max plan + extra usage credits)
jarvis auth add anthropic --type oauth
# Opens browser for OAuth login
```

Check your pools:

```bash
jarvis auth list
```

Output:
```
openrouter (2 credentials):
  #1  OPENROUTER_API_KEY   api_key env:OPENROUTER_API_KEY ←
  #2  backup-key           api_key manual

anthropic (3 credentials):
  #1  jarvis_pkce          oauth   jarvis_pkce ←
  #2  claude_code          oauth   claude_code
  #3  ANTHROPIC_API_KEY    api_key env:ANTHROPIC_API_KEY
```

The `←` marks the currently selected credential.

## Interactive Management

Run `jarvis auth` with no subcommand for an interactive wizard:

```bash
jarvis auth
```

This shows your full pool status and offers a menu:

```
What would you like to do?
  1. Add a credential
  2. Remove a credential
  3. Reset cooldowns for a provider
  4. Set rotation strategy for a provider
  5. Exit
```

For providers that support both API keys and OAuth (Anthropic, Nous, Codex), the add flow asks which type:

```
anthropic supports both API keys and OAuth login.
  1. API key (paste a key from the provider dashboard)
  2. OAuth login (authenticate via browser)
Type [1/2]:
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `jarvis auth` | Interactive pool management wizard |
| `jarvis auth list` | Show all pools and credentials |
| `jarvis auth list <provider>` | Show a specific provider's pool |
| `jarvis auth add <provider>` | Add a credential (prompts for type and key) |
| `jarvis auth add <provider> --type api-key --api-key <key>` | Add an API key non-interactively |
| `jarvis auth add <provider> --type oauth` | Add an OAuth credential via browser login |
| `jarvis auth remove <provider> <index>` | Remove credential by 1-based index |
| `jarvis auth reset <provider>` | Clear all cooldowns/exhaustion status |

## Rotation Strategies

Configure via `jarvis auth` → "Set rotation strategy" or in `config.yaml`:

```yaml
credential_pool_strategies:
  openrouter: round_robin
  anthropic: least_used
```

| Strategy | Behavior |
|----------|----------|
| `fill_first` (default) | Use the first healthy key until it's exhausted, then move to the next |
| `round_robin` | Cycle through keys evenly, rotating after each selection |
| `least_used` | Always pick the key with the lowest request count |
| `random` | Random selection among healthy keys |

## Error Recovery

The pool handles different errors differently:

| Error | Behavior | Cooldown |
|-------|----------|----------|
| **429 Rate Limit** | Retry same key once (transient). Second consecutive 429 rotates to next key | 1 hour |
| **402 Billing/Quota** | Immediately rotate to next key | 24 hours |
| **401 Auth Expired** | Try refreshing the OAuth token first. Rotate only if refresh fails | — |
| **All keys exhausted** | Fall through to `fallback_model` if configured | — |

The `has_retried_429` flag resets on every successful API call, so a single transient 429 doesn't trigger rotation.

## Custom Endpoint Pools

Custom OpenAI-compatible endpoints (Together.ai, RunPod, local servers) get their own pools, keyed by the endpoint name from `custom_providers` in config.yaml.

When you set up a custom endpoint via `jarvis model`, it auto-generates a name like "Together.ai" or "Local (localhost:8080)". This name becomes the pool key.

```bash
# After setting up a custom endpoint via jarvis model:
jarvis auth list
# Shows:
#   Together.ai (1 credential):
#     #1  config key    api_key config:Together.ai ←

# Add a second key for the same endpoint:
jarvis auth add Together.ai --api-key sk-together-second-key
```

Custom endpoint pools are stored in `auth.json` under `credential_pool` with a `custom:` prefix:

```json
{
  "credential_pool": {
    "openrouter": [...],
    "custom:together.ai": [...]
  }
}
```

## Auto-Discovery

Jarvis automatically discovers credentials from multiple sources and seeds the pool on startup:

| Source | Example | Auto-seeded? |
|--------|---------|-------------|
| Environment variables | `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY` | Yes |
| OAuth tokens (auth.json) | Codex device code, Nous device code | Yes |
| Claude Code credentials | `~/.claude/.credentials.json` | Yes (Anthropic) |
| Jarvis PKCE OAuth | `~/.jarvis/auth.json` | Yes (Anthropic) |
| Custom endpoint config | `model.api_key` in config.yaml | Yes (custom endpoints) |
| Manual entries | Added via `jarvis auth add` | Persisted in auth.json |

Auto-seeded entries are updated on each pool load — if you remove an env var, its pool entry is automatically pruned. Manual entries (added via `jarvis auth add`) are never auto-pruned.

## Delegation & Subagent Sharing

When the agent spawns subagents via `delegate_task`, the parent's credential pool is automatically shared with children:

- **Same provider** — the child receives the parent's full pool, enabling key rotation on rate limits
- **Different provider** — the child loads that provider's own pool (if configured)
- **No pool configured** — the child falls back to the inherited single API key

This means subagents benefit from the same rate-limit resilience as the parent, with no extra configuration needed. Per-task credential leasing ensures children don't conflict with each other when rotating keys concurrently.

## Thread Safety

The credential pool uses a threading lock for all state mutations (`select()`, `mark_exhausted_and_rotate()`, `try_refresh_current()`, `mark_used()`). This ensures safe concurrent access when the gateway handles multiple chat sessions simultaneously.

## Architecture

For the full data flow diagram, see [`docs/credential-pool-flow.excalidraw`](https://excalidraw.com/#json=2Ycqhqpi6f12E_3ITyiwh,c7u9jSt5BwrmiVzHGbm87g) in the repository.

The credential pool integrates at the provider resolution layer:

1. **`agent/credential_pool.py`** — Pool manager: storage, selection, rotation, cooldowns
2. **`jarvis_cli/auth_commands.py`** — CLI commands and interactive wizard
3. **`jarvis_cli/runtime_provider.py`** — Pool-aware credential resolution
4. **`run_agent.py`** — Error recovery: 429/402/401 → pool rotation → fallback

## Storage

Pool state is stored in `~/.jarvis/auth.json` under the `credential_pool` key:

```json
{
  "version": 1,
  "credential_pool": {
    "openrouter": [
      {
        "id": "abc123",
        "label": "OPENROUTER_API_KEY",
        "auth_type": "api_key",
        "priority": 0,
        "source": "env:OPENROUTER_API_KEY",
        "access_token": "sk-or-v1-...",
        "last_status": "ok",
        "request_count": 142
      }
    ]
  },
}
```

Strategies are stored in `config.yaml` (not `auth.json`):

```yaml
credential_pool_strategies:
  openrouter: round_robin
  anthropic: least_used
```

## Source: `user-guide/features/code-execution.md`

---
sidebar_position: 8
title: "Code Execution"
description: "Programmatic Python execution with RPC tool access — collapse multi-step workflows into a single turn"
---

# Code Execution (Programmatic Tool Calling)

The `execute_code` tool lets the agent write Python scripts that call Jarvis tools programmatically, collapsing multi-step workflows into a single LLM turn. The script runs in a child process on the agent host, communicating with Jarvis over a Unix domain socket RPC.

## How It Works

1. The agent writes a Python script using `from jarvis_tools import ...`
2. Jarvis generates a `jarvis_tools.py` stub module with RPC functions
3. Jarvis opens a Unix domain socket and starts an RPC listener thread
4. The script runs in a child process — tool calls travel over the socket back to Jarvis
5. Only the script's `print()` output is returned to the LLM; intermediate tool results never enter the context window

```python
# The agent can write scripts like:
from jarvis_tools import web_search, web_extract

results = web_search("Python 3.13 features", limit=5)
for r in results["data"]["web"]:
    content = web_extract([r["url"]])
    # ... filter and process ...
print(summary)
```

**Available tools inside scripts:** `web_search`, `web_extract`, `read_file`, `write_file`, `search_files`, `patch`, `terminal` (foreground only).

## When the Agent Uses This

The agent uses `execute_code` when there are:

- **3+ tool calls** with processing logic between them
- Bulk data filtering or conditional branching
- Loops over results

The key benefit: intermediate tool results never enter the context window — only the final `print()` output comes back, dramatically reducing token usage.

## Practical Examples

### Data Processing Pipeline

```python
from jarvis_tools import search_files, read_file
import json

# Find all config files and extract database settings
matches = search_files("database", path=".", file_glob="*.yaml", limit=20)
configs = []
for match in matches.get("matches", []):
    content = read_file(match["path"])
    configs.append({"file": match["path"], "preview": content["content"][:200]})

print(json.dumps(configs, indent=2))
```

### Multi-Step Web Research

```python
from jarvis_tools import web_search, web_extract
import json

# Search, extract, and summarize in one turn
results = web_search("Rust async runtime comparison 2025", limit=5)
summaries = []
for r in results["data"]["web"]:
    page = web_extract([r["url"]])
    for p in page.get("results", []):
        if p.get("content"):
            summaries.append({
                "title": r["title"],
                "url": r["url"],
                "excerpt": p["content"][:500]
            })

print(json.dumps(summaries, indent=2))
```

### Bulk File Refactoring

```python
from jarvis_tools import search_files, read_file, patch

# Find all Python files using deprecated API and fix them
matches = search_files("old_api_call", path="src/", file_glob="*.py")
fixed = 0
for match in matches.get("matches", []):
    result = patch(
        path=match["path"],
        old_string="old_api_call(",
        new_string="new_api_call(",
        replace_all=True
    )
    if "error" not in str(result):
        fixed += 1

print(f"Fixed {fixed} files out of {len(matches.get('matches', []))} matches")
```

### Build and Test Pipeline

```python
from jarvis_tools import terminal, read_file
import json

# Run tests, parse results, and report
result = terminal("cd /project && python -m pytest --tb=short -q 2>&1", timeout=120)
output = result.get("output", "")

# Parse test output
passed = output.count(" passed")
failed = output.count(" failed")
errors = output.count(" error")

report = {
    "passed": passed,
    "failed": failed,
    "errors": errors,
    "exit_code": result.get("exit_code", -1),
    "summary": output[-500:] if len(output) > 500 else output
}

print(json.dumps(report, indent=2))
```

## Execution Mode

`execute_code` has two execution modes controlled by `code_execution.mode` in `~/.jarvis/config.yaml`:

| Mode | Working directory | Python interpreter |
|------|-------------------|--------------------|
| **`project`** (default) | The session's working directory (same as `terminal()`) | Active `VIRTUAL_ENV` / `CONDA_PREFIX` python, falling back to Jarvis's own python |
| `strict` | A temp staging directory isolated from the user's project | `sys.executable` (Jarvis's own python) |

**When to leave it on `project`:** you want `import pandas`, `from my_project import foo`, or relative paths like `open(".env")` to work the same way they do in `terminal()`. This is almost always what you want.

**When to flip to `strict`:** you need maximum reproducibility — you want the same interpreter every session regardless of which venv the user activated, and you want scripts quarantined from the project tree (no risk of accidentally reading project files through a relative path).

```yaml
# ~/.jarvis/config.yaml
code_execution:
  mode: project   # or "strict"
```

Fallback behavior in `project` mode: if `VIRTUAL_ENV` / `CONDA_PREFIX` is unset, broken, or points at a Python older than 3.8, the resolver falls back cleanly to `sys.executable` — it never leaves the agent without a working interpreter.

Security-critical invariants are identical across both modes:

- environment scrubbing (API keys, tokens, credentials stripped)
- tool whitelist (scripts cannot call `execute_code` recursively, `delegate_task`, or MCP tools)
- resource limits (timeout, stdout cap, tool-call cap)

Switching mode changes where scripts run and which interpreter runs them, not what credentials they can see or which tools they can call.

## Resource Limits

| Resource | Limit | Notes |
|----------|-------|-------|
| **Timeout** | 5 minutes (300s) | Script is killed with SIGTERM, then SIGKILL after 5s grace |
| **Stdout** | 50 KB | Output truncated with `[output truncated at 50KB]` notice |
| **Stderr** | 10 KB | Included in output on non-zero exit for debugging |
| **Tool calls** | 50 per execution | Error returned when limit reached |

All limits are configurable via `config.yaml`:

```yaml
# In ~/.jarvis/config.yaml
code_execution:
  mode: project      # project (default) | strict
  timeout: 300       # Max seconds per script (default: 300)
  max_tool_calls: 50 # Max tool calls per execution (default: 50)
```

## How Tool Calls Work Inside Scripts

When your script calls a function like `web_search("query")`:

1. The call is serialized to JSON and sent over a Unix domain socket to the parent process
2. The parent dispatches through the standard `handle_function_call` handler
3. The result is sent back over the socket
4. The function returns the parsed result

This means tool calls inside scripts behave identically to normal tool calls — same rate limits, same error handling, same capabilities. The only restriction is that `terminal()` is foreground-only (no `background` or `pty` parameters).

## Error Handling

When a script fails, the agent receives structured error information:

- **Non-zero exit code**: stderr is included in the output so the agent sees the full traceback
- **Timeout**: Script is killed and the agent sees `"Script timed out after 300s and was killed."`
- **Interruption**: If the user sends a new message during execution, the script is terminated and the agent sees `[execution interrupted — user sent a new message]`
- **Tool call limit**: When the 50-call limit is hit, subsequent tool calls return an error message

The response always includes `status` (success/error/timeout/interrupted), `output`, `tool_calls_made`, and `duration_seconds`.

## Security

:::danger Security Model
The child process runs with a **minimal environment**. API keys, tokens, and credentials are stripped by default. The script accesses tools exclusively via the RPC channel — it cannot read secrets from environment variables unless explicitly allowed.
:::

Environment variables containing `KEY`, `TOKEN`, `SECRET`, `PASSWORD`, `CREDENTIAL`, `PASSWD`, or `AUTH` in their names are excluded. Only safe system variables (`PATH`, `HOME`, `LANG`, `SHELL`, `PYTHONPATH`, `VIRTUAL_ENV`, etc.) are passed through.

### Skill Environment Variable Passthrough

When a skill declares `required_environment_variables` in its frontmatter, those variables are **automatically passed through** to both `execute_code` and `terminal` child processes after the skill is loaded. This lets skills use their declared API keys without weakening the security posture for arbitrary code.

For non-skill use cases, you can explicitly allowlist variables in `config.yaml`:

```yaml
terminal:
  env_passthrough:
    - MY_CUSTOM_KEY
    - ANOTHER_TOKEN
```

See the [Security guide](/docs/user-guide/security#environment-variable-passthrough) for full details.

Jarvis always writes the script and the auto-generated `jarvis_tools.py` RPC stub into a temp staging directory that is cleaned up after execution. In `strict` mode the script also *runs* there; in `project` mode it runs in the session's working directory (the staging directory stays on `PYTHONPATH` so imports still resolve). The child process runs in its own process group so it can be cleanly killed on timeout or interruption.

## execute_code vs terminal

| Use Case | execute_code | terminal |
|----------|-------------|----------|
| Multi-step workflows with tool calls between | ✅ | ❌ |
| Simple shell command | ❌ | ✅ |
| Filtering/processing large tool outputs | ✅ | ❌ |
| Running a build or test suite | ❌ | ✅ |
| Looping over search results | ✅ | ❌ |
| Interactive/background processes | ❌ | ✅ |
| Needs API keys in environment | ⚠️ Only via [passthrough](/docs/user-guide/security#environment-variable-passthrough) | ✅ (most pass through) |

**Rule of thumb:** Use `execute_code` when you need to call Jarvis tools programmatically with logic between calls. Use `terminal` for running shell commands, builds, and processes.

## Platform Support

Code execution requires Unix domain sockets and is available on **Linux and macOS only**. It is automatically disabled on Windows — the agent falls back to regular sequential tool calls.

## Source: `user-guide/features/browser.md`

---
title: Browser Automation
description: Control browsers with multiple providers, local Chromium-family browsers via CDP, or cloud browsers for web interaction, form filling, scraping, and more.
sidebar_label: Browser
sidebar_position: 5
---

# Browser Automation

JARVIS includes a full browser automation toolset with multiple backend options:

- **Browserbase cloud mode** via [Browserbase](https://browserbase.com) for managed cloud browsers and anti-bot tooling
- **Browser Use cloud mode** via [Browser Use](https://browser-use.com) as an alternative cloud browser provider
- **Firecrawl cloud mode** via [Firecrawl](https://firecrawl.dev) for cloud browsers with built-in scraping
- **Camofox local mode** via [Camofox](https://github.com/jo-inc/camofox-browser) for local anti-detection browsing (Firefox-based fingerprint spoofing)
- **Local Chromium-family CDP** — connect browser tools to your own Chrome, Brave, Chromium, or Edge instance using `/browser connect`
- **Local browser mode** via the `agent-browser` CLI and a local Chromium installation

In all modes, the agent can navigate websites, interact with page elements, fill forms, and extract information.

## Overview

Pages are represented as **accessibility trees** (text-based snapshots), making them ideal for LLM agents. Interactive elements get ref IDs (like `@e1`, `@e2`) that the agent uses for clicking and typing.

Key capabilities:

- **Multi-provider cloud execution** — Browserbase, Browser Use, or Firecrawl — no local browser needed
- **Local Chromium-family integration** — attach to your running Chrome, Brave, Chromium, or Edge browser via CDP for hands-on browsing
- **Built-in stealth** — random fingerprints, CAPTCHA solving, residential proxies (Browserbase)
- **Session isolation** — each task gets its own browser session
- **Automatic cleanup** — inactive sessions are closed after a timeout
- **Vision analysis** — screenshot + AI analysis for visual understanding

## Setup

:::tip Nous Subscribers
If you have a paid [Nous Portal](https://portal.jarvis.local) subscription, you can use browser automation through the **[Tool Gateway](tool-gateway.md)** without any separate API keys. Run `jarvis model` or `jarvis tools` to enable it.
:::

### Browserbase cloud mode

To use Browserbase-managed cloud browsers, add:

```bash
# Add to ~/.jarvis/.env
BROWSERBASE_API_KEY=***
BROWSERBASE_PROJECT_ID=your-project-id-here
```

Get your credentials at [browserbase.com](https://browserbase.com).

### Browser Use cloud mode

To use Browser Use as your cloud browser provider, add:

```bash
# Add to ~/.jarvis/.env
BROWSER_USE_API_KEY=***
```

Get your API key at [browser-use.com](https://browser-use.com). Browser Use provides a cloud browser via its REST API. If both Browserbase and Browser Use credentials are set, Browserbase takes priority.

### Firecrawl cloud mode

To use Firecrawl as your cloud browser provider, add:

```bash
# Add to ~/.jarvis/.env
FIRECRAWL_API_KEY=fc-***
```

Get your API key at [firecrawl.dev](https://firecrawl.dev). Then select Firecrawl as your browser provider:

```bash
jarvis setup tools
# → Browser Automation → Firecrawl
```

Optional settings:

```bash
# Self-hosted Firecrawl instance (default: https://api.firecrawl.dev)
FIRECRAWL_API_URL=http://localhost:3002

# Session TTL in seconds (default: 300)
FIRECRAWL_BROWSER_TTL=600
```

### Hybrid routing: cloud for public URLs, local for LAN/localhost

When a cloud provider is configured, Jarvis auto-spawns a **local Chromium sidecar**
for URLs that resolve to a private/loopback/LAN address (`localhost`, `127.0.0.1`,
`192.168.x.x`, `10.x.x.x`, `172.16-31.x.x`, `*.local`, `*.lan`, `*.internal`,
IPv6 loopback `::1`, link-local `169.254.x.x`). Public URLs continue to use the
cloud provider in the same conversation.

This solves the common "I'm developing locally but using Browserbase" workflow —
the agent can screenshot your dashboard at `http://localhost:3000` AND scrape
`https://github.com` without you switching providers or disabling the SSRF guard.
The cloud provider never sees the private URL.

The feature is **on by default**. To disable it (all URLs go to the configured
cloud provider, as before):

```yaml
# ~/.jarvis/config.yaml
browser:
  cloud_provider: browserbase
  auto_local_for_private_urls: false
```

With auto-routing disabled, private URLs are rejected with
`"Blocked: URL targets a private or internal address"` unless you also set
`browser.allow_private_urls: true` (which lets the cloud provider attempt them —
usually won't work since Browserbase etc. can't reach your LAN).

Requirements: the local sidecar uses the same `agent-browser` CLI as pure local
mode, so you need it installed (`jarvis setup tools → Browser Automation`
auto-installs it). Post-navigation redirects from a public URL onto a private
address are still blocked (you can't use a redirect-to-internal trick to reach
your LAN through the public path).

### Camofox local mode

[Camofox](https://github.com/jo-inc/camofox-browser) is a self-hosted Node.js server wrapping Camoufox (a Firefox fork with C++ fingerprint spoofing). It provides local anti-detection browsing without cloud dependencies.

```bash
# Clone the Camofox browser server first
git clone https://github.com/jo-inc/camofox-browser
cd camofox-browser

# Build and start with Docker using the default container settings
# (auto-detects arch: aarch64 on M1/M2, x86_64 on Intel)
make up

# Stop and remove the default container
make down

# Force a clean rebuild (for example, after upgrading VERSION/RELEASE)
make reset

# Just download binaries without building
make fetch

# Override arch or version explicitly
make up ARCH=x86_64
make up VERSION=135.0.1 RELEASE=beta.24
```

`make up` starts the default container immediately. If you want custom runtime settings such as a larger Node heap, VNC, or a persistent profile directory, build the image first and then run it yourself:

```bash
# Build the image without starting the default container
make build

# Start with persistence, VNC live view, and a larger Node heap
mkdir -p ~/.camofox-docker
docker run -d \
  --name camofox-browser \
  --restart unless-stopped \
  -p 9377:9377 \
  -p 6080:6080 \
  -p 5901:5900 \
  -e CAMOFOX_PORT=9377 \
  -e ENABLE_VNC=1 \
  -e VNC_BIND=0.0.0.0 \
  -e VNC_RESOLUTION=1920x1080 \
  -e MAX_OLD_SPACE_SIZE=2048 \
  -v ~/.camofox-docker:/root/.camofox \
  camofox-browser:135.0.1-aarch64
```

With VNC enabled, the browser runs in headed mode and can be watched live in your browser at `http://localhost:6080` (noVNC). You can also connect a native VNC client to `localhost:5901`.

If you already ran `make up`, stop and remove that default container before starting the custom one:

```bash
make down
# then run the custom docker run command above
```

Then set in `~/.jarvis/.env`:

```bash
CAMOFOX_URL=http://localhost:9377
```

Or configure via `jarvis tools` → Browser Automation → Camofox.

When `CAMOFOX_URL` is set, all browser tools automatically route through Camofox instead of Browserbase or agent-browser.

#### Persistent browser sessions

By default, each Camofox session gets a random identity — cookies and logins don't survive across agent restarts. To enable persistent browser sessions, add the following to `~/.jarvis/config.yaml`:

```yaml
browser:
  camofox:
    managed_persistence: true
```

Then fully restart Jarvis so the new config is picked up.

:::warning Nested path matters
Jarvis reads `browser.camofox.managed_persistence`, **not** a top-level `managed_persistence`. A common mistake is writing:

```yaml
# ❌ Wrong — Jarvis ignores this
managed_persistence: true
```

If the flag is placed at the wrong path, Jarvis silently falls back to a random ephemeral `userId` and your login state will be lost on every session.
:::

##### What Jarvis does
- Sends a deterministic profile-scoped `userId` to Camofox so the server can reuse the same Firefox profile across sessions.
- Skips server-side context destruction on cleanup, so cookies and logins survive between agent tasks.
- Scopes the `userId` to the active Jarvis profile, so different Jarvis profiles get different browser profiles (profile isolation).

##### What Jarvis does not do
- It does not force persistence on the Camofox server. Jarvis only sends a stable `userId`; the server must honor it by mapping that `userId` to a persistent Firefox profile directory.
- If your Camofox server build treats every request as ephemeral (e.g. always calls `browser.newContext()` without loading a stored profile), Jarvis cannot make those sessions persist. Make sure you are running a Camofox build that implements userId-based profile persistence.

##### Verify it's working

1. Start Jarvis and your Camofox server.
2. Open Google (or any login site) in a browser task and sign in manually.
3. End the browser task normally.
4. Start a new browser task.
5. Open the same site again — you should still be signed in.

If step 5 logs you out, the Camofox server isn't honoring the stable `userId`. Double-check your config path, confirm you fully restarted Jarvis after editing `config.yaml`, and verify your Camofox server version supports persistent per-user profiles.

##### Where state lives

Jarvis derives the stable `userId` from the profile-scoped directory `~/.jarvis/browser_auth/camofox/` (or the equivalent under `$JARVIS_HOME` for non-default profiles). The actual browser profile data lives on the Camofox server side, keyed by that `userId`. To fully reset a persistent profile, clear it on the Camofox server and remove the corresponding Jarvis profile's state directory.

#### Externally managed Camofox sessions

When another app drives the visible Camofox browser (a desktop assistant, a custom integration, another agent), configure Jarvis to operate inside that same identity instead of spawning its own isolated profile.

Three knobs control the behavior:

| Setting | Env var | Effect |
|---------|---------|--------|
| `browser.camofox.user_id` | `CAMOFOX_USER_ID` | Camofox `userId` Jarvis uses when creating tabs. Setting this opts the session into "externally managed" mode. |
| `browser.camofox.session_key` | `CAMOFOX_SESSION_KEY` | `sessionKey` (a.k.a. `listItemId`) sent on tab creation. Used to match an existing tab during adoption. Defaults to a per-task value if unset. |
| `browser.camofox.adopt_existing_tab` | `CAMOFOX_ADOPT_EXISTING_TAB` | When true, Jarvis calls `GET /tabs?userId=<user_id>` on first use and reuses an existing tab before creating a new one. |

Env vars take precedence over `config.yaml`. Either form works:

```yaml
browser:
  camofox:
    user_id: shared-camofox
    session_key: visible-tab
    adopt_existing_tab: true
```

```bash
CAMOFOX_USER_ID=shared-camofox
CAMOFOX_SESSION_KEY=visible-tab
CAMOFOX_ADOPT_EXISTING_TAB=true
```

**What changes when `user_id` is set:**

- Jarvis skips destructive cleanup at task end (same as `managed_persistence: true`). The other app's tab/cookies/profile survive.
- Jarvis does **not** call `DELETE /sessions/<user_id>` — that endpoint wipes all user data, so it would nuke the external app's session if it fired.

**How tab adoption works (when `adopt_existing_tab: true`):**

1. On the first browser tool call after a process start, Jarvis issues `GET /tabs?userId=<user_id>` (5-second timeout).
2. If any tab in the response has `listItemId == session_key`, Jarvis adopts the most recently created one in that group.
3. Otherwise, Jarvis adopts the most recently created tab for the user (any `listItemId`).
4. If no tabs exist or the request fails, Jarvis falls back to creating a new tab on the next operation.

Adoption only fires until `tab_id` is populated for the session. If the external app closes the adopted tab mid-run, the next browser tool call will surface a Camofox error — Jarvis does not re-poll for a fresh tab on every call.

**Picking `session_key`:** if you want Jarvis to reliably attach to a *specific* existing tab, set `session_key` to the `listItemId` the external app used when creating it. If you leave `session_key` unset and only set `user_id`, Jarvis generates a per-task `session_key` (`task_<id>`) — Jarvis will share cookies and the profile with the external app, but will open its own tab alongside instead of reusing one.

**Concurrency note:** the external app and Jarvis can drive the same Camofox `userId` simultaneously, but Camofox does not coordinate per-tab focus between clients. Coordinate ownership at the application layer (e.g. the external app pauses while Jarvis runs).

#### VNC live view

When Camofox runs in headed mode (with a visible browser window), it exposes a VNC port in its health check response. Jarvis automatically discovers this and includes the VNC URL in navigation responses, so the agent can share a link for you to watch the browser live.

### Local Chromium-family browser via CDP (`/browser connect`)

Instead of a cloud provider, you can attach Jarvis browser tools to your own running Chrome, Brave, Chromium, or Edge instance via the Chrome DevTools Protocol (CDP). This is useful when you want to see what the agent is doing in real-time, interact with pages that require your own cookies/sessions, or avoid cloud browser costs.

:::note
`/browser connect` is an **interactive-CLI slash command** — it is not dispatched by the gateway. If you try to run it inside a WebUI, Telegram, Discord, or other gateway chat, the message will be sent to the agent as plain text and the command will not execute. Start Jarvis from the terminal (`jarvis` or `jarvis chat`) and issue `/browser connect` there.
:::

In the CLI, use:

```
/browser connect                 # Auto-launch/connect to a local Chromium-family browser at http://127.0.0.1:9222
/browser connect ws://host:port  # Connect to a specific CDP endpoint
/browser status                  # Check current connection
/browser disconnect              # Detach and return to cloud/local mode
```

If a browser isn't already running with remote debugging, Jarvis will attempt to auto-launch a supported Chromium-family browser with `--remote-debugging-port=9222`. Detection includes Brave, Google Chrome, Chromium, and Microsoft Edge, with common Linux install paths such as `/opt/brave-bin/brave` and `/snap/bin/brave`.

:::tip
To start a Chromium-family browser manually with CDP enabled, use a dedicated user-data-dir so the debug port actually comes up even if the browser is already running with your normal profile:

```bash
# Linux — Brave
brave-browser \
  --remote-debugging-port=9222 \
  --user-data-dir=$HOME/.jarvis/chrome-debug \
  --no-first-run \
  --no-default-browser-check &

# Linux — Google Chrome
google-chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=$HOME/.jarvis/chrome-debug \
  --no-first-run \
  --no-default-browser-check &

# macOS — Brave
"/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.jarvis/chrome-debug" \
  --no-first-run \
  --no-default-browser-check &

# macOS — Google Chrome
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.jarvis/chrome-debug" \
  --no-first-run \
  --no-default-browser-check &
```

Then launch the Jarvis CLI and run `/browser connect`.

**Why `--user-data-dir`?** Without it, launching a Chromium-family browser while a regular instance is already running typically opens a new window on the existing process — and that existing process was not started with `--remote-debugging-port`, so port 9222 never opens. A dedicated user-data-dir forces a fresh browser process where the debug port actually listens. `--no-first-run --no-default-browser-check` skips the first-launch wizard for the fresh profile.
:::

When connected via CDP, all browser tools (`browser_navigate`, `browser_click`, etc.) operate on your live browser instance instead of spinning up a cloud session.

### WSL2 + Windows Chrome: prefer MCP over `/browser connect`

If Jarvis runs inside WSL2 but the Chrome window you want to control runs on the Windows host, `/browser connect` is often not the best path.

Why:

- `/browser connect` expects Jarvis itself to reach a usable CDP endpoint
- modern Chrome live-debugging sessions often expose a host-local endpoint that is not directly reachable from WSL the same way a classic `9222` port is
- even when Windows Chrome is debuggable, the cleanest integration is often to let a Windows-side browser MCP server attach to Chrome and let Jarvis talk to that MCP server

For that setup, prefer `chrome-devtools-mcp` through Jarvis MCP support.

See the MCP guide for the practical setup:

- [Use MCP with Jarvis](../../guides/use-mcp-with-jarvis.md#wsl2-bridge-jarvis-in-wsl-to-windows-chrome)

### Local browser mode

If you do **not** set any cloud credentials and don't use `/browser connect`, Jarvis can still use the browser tools through a local Chromium install driven by `agent-browser`.

### Optional Environment Variables

```bash
# Residential proxies for better CAPTCHA solving (default: "true")
BROWSERBASE_PROXIES=true

# Advanced stealth with custom Chromium — requires Scale Plan (default: "false")
BROWSERBASE_ADVANCED_STEALTH=false

# Session reconnection after disconnects — requires paid plan (default: "true")
BROWSERBASE_KEEP_ALIVE=true

# Custom session timeout in milliseconds (default: project default)
# Examples: 600000 (10min), 1800000 (30min)
BROWSERBASE_SESSION_TIMEOUT=600000

# Inactivity timeout before auto-cleanup in seconds (default: 120)
BROWSER_INACTIVITY_TIMEOUT=120

# Extra Chromium launch flags (comma- or newline-separated). Jarvis auto-injects
# `--no-sandbox,--disable-dev-shm-usage` when it detects root or AppArmor-restricted
# unprivileged user namespaces (Ubuntu 23.10+, DGX Spark, many container images),
# so most users don't need to set this. Set it manually only if you need a flag
# Jarvis doesn't add automatically; setting it disables the auto-injection.
AGENT_BROWSER_ARGS=--no-sandbox
```

### Install agent-browser CLI

```bash
npm install -g agent-browser
# Or install locally in the repo:
npm install
```

:::info
The `browser` toolset must be included in your config's `toolsets` list or enabled via `jarvis config set toolsets '["jarvis-cli", "browser"]'`.
:::

## Available Tools

### `browser_navigate`

Navigate to a URL. Must be called before any other browser tool. Initializes the Browserbase session.

```
Navigate to https://github.com/JARVISProject
```

:::tip
For simple information retrieval, prefer `web_search` or `web_extract` — they are faster and cheaper. Use browser tools when you need to **interact** with a page (click buttons, fill forms, handle dynamic content).
:::

### `browser_snapshot`

Get a text-based snapshot of the current page's accessibility tree. Returns interactive elements with ref IDs like `@e1`, `@e2` for use with `browser_click` and `browser_type`.

- **`full=false`** (default): Compact view showing only interactive elements
- **`full=true`**: Complete page content

Snapshots over 8000 characters are automatically summarized by an LLM.

### `browser_click`

Click an element identified by its ref ID from the snapshot.

```
Click @e5 to press the "Sign In" button
```

### `browser_type`

Type text into an input field. Clears the field first, then types the new text.

```
Type "jarvis agent" into the search field @e3
```

### `browser_scroll`

Scroll the page up or down to reveal more content.

```
Scroll down to see more results
```

### `browser_press`

Press a keyboard key. Useful for submitting forms or navigation.

```
Press Enter to submit the form
```

Supported keys: `Enter`, `Tab`, `Escape`, `ArrowDown`, `ArrowUp`, and more.

### `browser_back`

Navigate back to the previous page in browser history.

### `browser_get_images`

List all images on the current page with their URLs and alt text. Useful for finding images to analyze.

### `browser_vision`

Take a screenshot and analyze it with vision AI. Use this when text snapshots don't capture important visual information — especially useful for CAPTCHAs, complex layouts, or visual verification challenges.

The screenshot is saved persistently and the file path is returned alongside the AI analysis. On messaging platforms (Telegram, Discord, Slack, WhatsApp), you can ask the agent to share the screenshot — it will be sent as a native photo attachment via the `MEDIA:` mechanism.

```
What does the chart on this page show?
```

Screenshots are stored in `~/.jarvis/cache/screenshots/` and automatically cleaned up after 24 hours.

### `browser_console`

Get browser console output (log/warn/error messages) and uncaught JavaScript exceptions from the current page. Essential for detecting silent JS errors that don't appear in the accessibility tree.

```
Check the browser console for any JavaScript errors
```

Use `clear=True` to clear the console after reading, so subsequent calls only show new messages.

`browser_console` also evaluates JavaScript when called with an `expression` argument — same shape as DevTools console, the result comes back parsed (JSON-serialized objects become dicts; primitive values stay primitive).

```
browser_console(expression="document.querySelector('h1').textContent")
browser_console(expression="JSON.stringify(performance.timing)")
```

When a CDP supervisor is active for the current session (typical for any session that's run `browser_navigate` against a CDP-capable backend), evaluation runs over the supervisor's persistent WebSocket — no subprocess startup cost. Falls through to the standard agent-browser CLI path otherwise. Behaviour is identical either way; only latency changes.

### `browser_cdp`

Raw Chrome DevTools Protocol passthrough — the escape hatch for browser operations not covered by the other tools. Use for native dialog handling, iframe-scoped evaluation, cookie/network control, or any CDP verb the agent needs.

**Only available when a CDP endpoint is reachable at session start** — meaning `/browser connect` has attached to a running Chrome, Brave, Chromium, or Edge browser, or `browser.cdp_url` is set in `config.yaml`. The default local agent-browser mode, Camofox, and cloud providers (Browserbase, Browser Use, Firecrawl) do not currently expose CDP to this tool — cloud providers have per-session CDP URLs but live-session routing is a follow-up.

**CDP method reference:** https://chromedevtools.github.io/devtools-protocol/ — the agent can `web_extract` a specific method's page to look up parameters and return shape.

Common patterns:

```
# List tabs (browser-level, no target_id)
browser_cdp(method="Target.getTargets")

# Handle a native JS dialog on a tab
browser_cdp(method="Page.handleJavaScriptDialog",
            params={"accept": true, "promptText": ""},
            target_id="<tabId>")

# Evaluate JS in a specific tab
browser_cdp(method="Runtime.evaluate",
            params={"expression": "document.title", "returnByValue": true},
            target_id="<tabId>")

# Get all cookies
browser_cdp(method="Network.getAllCookies")
```

Browser-level methods (`Target.*`, `Browser.*`, `Storage.*`) omit `target_id`. Page-level methods (`Page.*`, `Runtime.*`, `DOM.*`, `Emulation.*`) require a `target_id` from `Target.getTargets`. Each stateless call is independent — sessions do not persist between calls.

**Cross-origin iframes:** pass `frame_id` (from `browser_snapshot.frame_tree.children[]` where `is_oopif=true`) to route the CDP call through the supervisor's live session for that iframe. This is how `Runtime.evaluate` inside a cross-origin iframe works on Browserbase, where stateless CDP connections would hit signed-URL expiry. Example:

```
browser_cdp(
  method="Runtime.evaluate",
  params={"expression": "document.title", "returnByValue": True},
  frame_id="<frame_id from browser_snapshot>",
)
```

Same-origin iframes don't need `frame_id` — use `document.querySelector('iframe').contentDocument` from a top-level `Runtime.evaluate` instead.

### `browser_dialog`

Responds to a native JS dialog (`alert` / `confirm` / `prompt` / `beforeunload`). Before this tool existed, dialogs would silently block the page's JavaScript thread and subsequent `browser_*` calls would hang or throw; now the agent sees pending dialogs in `browser_snapshot` output and responds explicitly.

**Workflow:**
1. Call `browser_snapshot`. If a dialog is blocking the page, it shows up as `pending_dialogs: [{"id": "d-1", "type": "alert", "message": "..."}]`.
2. Call `browser_dialog(action="accept")` or `browser_dialog(action="dismiss")`. For `prompt()` dialogs, pass `prompt_text="..."` to supply the response.
3. Re-snapshot — `pending_dialogs` is empty; the page's JS thread has resumed.

**Detection happens automatically** via a persistent CDP supervisor — one WebSocket per task that subscribes to Page/Runtime/Target events. The supervisor also populates a `frame_tree` field in the snapshot so the agent can see the iframe structure of the current page, including cross-origin (OOPIF) iframes.

**Availability matrix:**

| Backend | Detection via `pending_dialogs` | Response (`browser_dialog` tool) |
|---|---|---|
| Local Chrome via `/browser connect` or `browser.cdp_url` | ✓ | ✓ full workflow |
| Browserbase | ✓ | ✓ full workflow (via injected XHR bridge) |
| Camofox / default local agent-browser | ✗ | ✗ (no CDP endpoint) |

**How it works on Browserbase.** Browserbase's CDP proxy auto-dismisses real native dialogs server-side within ~10ms, so we can't use `Page.handleJavaScriptDialog`. The supervisor injects a small script via `Page.addScriptToEvaluateOnNewDocument` that overrides `window.alert`/`confirm`/`prompt` with a synchronous XHR. We intercept those XHRs via `Fetch.enable` — the page's JS thread stays blocked on the XHR until we call `Fetch.fulfillRequest` with the agent's response. `prompt()` return values round-trip back into page JS unchanged.

**Dialog policy** is configured in `config.yaml` under `browser.dialog_policy`:

| Policy | Behavior |
|--------|----------|
| `must_respond` (default) | Capture, surface in snapshot, wait for explicit `browser_dialog()` call. Safety auto-dismiss after `browser.dialog_timeout_s` (default 300s) so a buggy agent can't stall forever. |
| `auto_dismiss` | Capture, dismiss immediately. Agent still sees the dialog in `browser_state` history but doesn't have to act. |
| `auto_accept` | Capture, accept immediately. Useful when navigating pages with aggressive `beforeunload` prompts. |

**Frame tree** inside `browser_snapshot.frame_tree` is capped to 30 frames and OOPIF depth 2 to keep payloads bounded on ad-heavy pages. A `truncated: true` flag surfaces when limits were hit; agents needing the full tree can use `browser_cdp` with `Page.getFrameTree`.

## Practical Examples

### Filling Out a Web Form

```
User: Sign up for an account on example.com with my email john@example.com

Agent workflow:
1. browser_navigate("https://example.com/signup")
2. browser_snapshot()  → sees form fields with refs
3. browser_type(ref="@e3", text="john@example.com")
4. browser_type(ref="@e5", text="SecurePass123")
5. browser_click(ref="@e8")  → clicks "Create Account"
6. browser_snapshot()  → confirms success
```

### Researching Dynamic Content

```
User: What are the top trending repos on GitHub right now?

Agent workflow:
1. browser_navigate("https://github.com/trending")
2. browser_snapshot(full=true)  → reads trending repo list
3. Returns formatted results
```

## Session Recording

Automatically record browser sessions as WebM video files:

```yaml
browser:
  record_sessions: true  # default: false
```

When enabled, recording starts automatically on the first `browser_navigate` and saves to `~/.jarvis/browser_recordings/` when the session closes. Works in both local and cloud (Browserbase) modes. Recordings older than 72 hours are automatically cleaned up.

## Stealth Features

Browserbase provides automatic stealth capabilities:

| Feature | Default | Notes |
|---------|---------|-------|
| Basic Stealth | Always on | Random fingerprints, viewport randomization, CAPTCHA solving |
| Residential Proxies | On | Routes through residential IPs for better access |
| Advanced Stealth | Off | Custom Chromium build, requires Scale Plan |
| Keep Alive | On | Session reconnection after network hiccups |

:::note
If paid features aren't available on your plan, Jarvis automatically falls back — first disabling `keepAlive`, then proxies — so browsing still works on free plans.
:::

## Session Management

- Each task gets an isolated browser session via Browserbase
- Sessions are automatically cleaned up after inactivity (default: 2 minutes)
- A background thread checks every 30 seconds for stale sessions
- Emergency cleanup runs on process exit to prevent orphaned sessions
- Sessions are released via the Browserbase API (`REQUEST_RELEASE` status)

## Limitations

- **Text-based interaction** — relies on accessibility tree, not pixel coordinates
- **Snapshot size** — large pages may be truncated or LLM-summarized at 8000 characters
- **Session timeout** — cloud sessions expire based on your provider's plan settings
- **Cost** — cloud sessions consume provider credits; sessions are automatically cleaned up when the conversation ends or after inactivity. Use `/browser connect` for free local browsing.
- **No file downloads** — cannot download files from the browser
