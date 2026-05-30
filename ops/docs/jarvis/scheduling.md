# Scheduling

> Imported from the local source documentation and rewritten for the JARVIS desktop-first app. Run commands from the integrated Home terminal unless a section explicitly refers to packaging or automation.

## Source: `user-guide/features/cron.md`

---
sidebar_position: 5
title: "Scheduled Tasks (Cron)"
description: "Schedule automated tasks with natural language, manage them with one cron tool, and attach one or more skills"
---

# Scheduled Tasks (Cron)

Schedule tasks to run automatically with natural language or cron expressions. Jarvis exposes cron management through a single `cronjob` tool with action-style operations instead of separate schedule/list/remove tools.

## What cron can do now

Cron jobs can:

- schedule one-shot or recurring tasks
- pause, resume, edit, trigger, and remove jobs
- attach zero, one, or multiple skills to a job
- deliver results back to the origin chat, local files, or configured platform targets
- run in fresh agent sessions with the normal static tool list
- run in **no-agent mode** — a script on a schedule, its stdout delivered verbatim, zero LLM involvement (see the [no-agent mode](#no-agent-mode-script-only-jobs) section below)

All of this is available to Jarvis itself through the `cronjob` tool, so you can create, pause, edit, and remove jobs by asking in plain language — no CLI required.

:::warning
Cron-run sessions cannot recursively create more cron jobs. Jarvis disables cron management tools inside cron executions to prevent runaway scheduling loops.
:::

## Creating scheduled tasks

### In chat with `/cron`

```bash
/cron add 30m "Remind me to check the build"
/cron add "every 2h" "Check server status"
/cron add "every 1h" "Summarize new feed items" --skill blogwatcher
/cron add "every 1h" "Use both skills and combine the result" --skill blogwatcher --skill maps
```

### From the standalone CLI

```bash
jarvis cron create "every 2h" "Check server status"
jarvis cron create "every 1h" "Summarize new feed items" --skill blogwatcher
jarvis cron create "every 1h" "Use both skills and combine the result" \
  --skill blogwatcher \
  --skill maps \
  --name "Skill combo"
```

### Through natural conversation

Ask Jarvis normally:

```text
Every morning at 9am, check Hacker News for AI news and send me a summary on Telegram.
```

Jarvis will use the unified `cronjob` tool internally.

## Skill-backed cron jobs

A cron job can load one or more skills before it runs the prompt.

### Single skill

```python
cronjob(
    action="create",
    skill="blogwatcher",
    prompt="Check the configured feeds and summarize anything new.",
    schedule="0 9 * * *",
    name="Morning feeds",
)
```

### Multiple skills

Skills are loaded in order. The prompt becomes the task instruction layered on top of those skills.

```python
cronjob(
    action="create",
    skills=["blogwatcher", "maps"],
    prompt="Look for new local events and interesting nearby places, then combine them into one short brief.",
    schedule="every 6h",
    name="Local brief",
)
```

This is useful when you want a scheduled agent to inherit reusable workflows without stuffing the full skill text into the cron prompt itself.

## Running a job inside a project directory

Cron jobs default to running detached from any repo — no `AGENTS.md`, `CLAUDE.md`, or `.cursorrules` is loaded, and the terminal / file / code-exec tools run from whatever working directory the gateway started in. Pass `--workdir` (CLI) or `workdir=` (tool call) to change that:

```bash
# Standalone CLI (schedule and prompt are positional)
jarvis cron create "every 1d at 09:00" \
  "Audit open PRs, summarize CI health, and post to #eng" \
  --workdir /home/me/projects/acme
```

```python
# From a chat, via the cronjob tool
cronjob(
    action="create",
    schedule="every 1d at 09:00",
    workdir="/home/me/projects/acme",
    prompt="Audit open PRs, summarize CI health, and post to #eng",
)
```

When `workdir` is set:

- `AGENTS.md`, `CLAUDE.md`, and `.cursorrules` from that directory are injected into the system prompt (same discovery order as the interactive CLI)
- `terminal`, `read_file`, `write_file`, `patch`, `search_files`, and `execute_code` all use that directory as their working directory (via `TERMINAL_CWD`)
- The path must be an absolute directory that exists — relative paths and missing directories are rejected at create / update time
- Pass `--workdir ""` (or `workdir=""` via the tool) on edit to clear it and restore the old behaviour

:::note Serialization
Jobs with a `workdir` run sequentially on the scheduler tick, not in the parallel pool. This is deliberate — `TERMINAL_CWD` is process-global, so two workdir jobs running at the same time would corrupt each other's cwd. Workdir-less jobs still run in parallel as before.
:::

## Running cron jobs in a specific profile

By default a cron job inherits whichever Jarvis profile owned the gateway / CLI that created it. Pass `--profile <name>` (CLI) or `profile=` (cronjob tool) to re-target the job at a different profile — the scheduler resolves that profile's `JARVIS_HOME`, temporarily switches into it for the duration of the run, loads its `.env` + `config.yaml`, and executes the job there:

```bash
# Pin a job to the `night-ops` profile regardless of where it was scheduled
jarvis cron create "every 1d at 03:00" \
  "Tail the security log and flag anomalies" \
  --profile night-ops
```

```python
# From a chat, via the cronjob tool
cronjob(
    action="create",
    schedule="every 1d at 03:00",
    prompt="Tail the security log and flag anomalies",
    profile="night-ops",
)
```

Use `--profile default` to explicitly pin to the root Jarvis profile. The named profile must already exist; the scheduler refuses to create profiles on the fly. To clear a profile pin during `cron edit`, pass an empty string (`--profile ""` or `profile=""`) — the job reverts to running in whatever profile the scheduler itself is in.

If the pinned profile is later deleted, the scheduler logs a warning and falls back to running the job in its current profile rather than crashing — so a stale `profile` reference never wedges a job.

:::note Serialization
Jobs with a `profile` set also run sequentially, for the same reason as `workdir`-pinned jobs: switching `JARVIS_HOME` is a process-global mutation, so two profile-pinned jobs running in parallel would race each other. Unpinned jobs still run in the normal parallel pool.
:::

## Editing jobs

You do not need to delete and recreate jobs just to change them.

:::tip Job reference
The `<job_id>` placeholder below (and in [Lifecycle actions](#lifecycle-actions)) also accepts the job's name (case-insensitive) — handy when you remember `morning-digest` but not the hex ID. An exact job ID takes precedence over name matches; if the reference is not an ID and a name matches more than one job, the command refuses and prints the candidate IDs so you can disambiguate.
:::

### Chat

```bash
/cron edit <job_id> --schedule "every 4h"
/cron edit <job_id> --prompt "Use the revised task"
/cron edit <job_id> --skill blogwatcher --skill maps
/cron edit <job_id> --remove-skill blogwatcher
/cron edit <job_id> --clear-skills
```

### Standalone CLI

```bash
jarvis cron edit <job_id> --schedule "every 4h"
jarvis cron edit <job_id> --prompt "Use the revised task"
jarvis cron edit <job_id> --skill blogwatcher --skill maps
jarvis cron edit <job_id> --add-skill maps
jarvis cron edit <job_id> --remove-skill blogwatcher
jarvis cron edit <job_id> --clear-skills
```

Notes:

- repeated `--skill` replaces the job's attached skill list
- `--add-skill` appends to the existing list without replacing it
- `--remove-skill` removes specific attached skills
- `--clear-skills` removes all attached skills

## Lifecycle actions

Cron jobs now have a fuller lifecycle than just create/remove.

### Chat

```bash
/cron list
/cron pause <job_id>
/cron resume <job_id>
/cron run <job_id>
/cron remove <job_id>
```

### Standalone CLI

```bash
jarvis cron list
jarvis cron pause <job_id>
jarvis cron resume <job_id>
jarvis cron run <job_id>
jarvis cron remove <job_id>
jarvis cron status
jarvis cron tick
```

What they do:

- `pause` — keep the job but stop scheduling it
- `resume` — re-enable the job and compute the next future run
- `run` — trigger the job on the next scheduler tick
- `remove` — delete it entirely

## How it works

**Cron execution is handled by the gateway daemon.** The gateway ticks the scheduler every 60 seconds, running any due jobs in isolated agent sessions.

```bash
jarvis gateway install     # Install as a user service
sudo jarvis gateway install --system   # Linux: boot-time system service for servers
jarvis gateway             # Or run in foreground

jarvis cron list
jarvis cron status
```

### Gateway scheduler behavior

On each tick Jarvis:

1. loads jobs from `~/.jarvis/src/cron/jobs.json`
2. checks `next_run_at` against the current time
3. starts a fresh `AIAgent` session for each due job
4. optionally injects one or more attached skills into that fresh session
5. runs the prompt to completion
6. delivers the final response
7. updates run metadata and the next scheduled time

A file lock at `~/.jarvis/src/cron/.tick.lock` prevents overlapping scheduler ticks from double-running the same job batch.

## Delivery options

When scheduling jobs, you specify where the output goes:

| Option | Description | Example |
|--------|-------------|---------|
| `"origin"` | Back to where the job was created | Default on messaging platforms |
| `"local"` | Save to local files only (`~/.jarvis/src/cron/output/`) | Default on CLI |
| `"telegram"` | Telegram home channel | Uses `TELEGRAM_HOME_CHANNEL` |
| `"telegram:123456"` | Specific Telegram chat by ID | Direct delivery |
| `"telegram:-100123:17585"` | Specific Telegram topic | `chat_id:thread_id` format |
| `"discord"` | Discord home channel | Uses `DISCORD_HOME_CHANNEL` |
| `"discord:#engineering"` | Specific Discord channel | By channel name |
| `"slack"` | Slack home channel | |
| `"whatsapp"` | WhatsApp home | |
| `"signal"` | Signal | |
| `"matrix"` | Matrix home room | |
| `"mattermost"` | Mattermost home channel | |
| `"email"` | Email | |
| `"sms"` | SMS via Twilio | |
| `"homeassistant"` | Home Assistant | |
| `"dingtalk"` | DingTalk | |
| `"feishu"` | Feishu/Lark | |
| `"wecom"` | WeCom | |
| `"weixin"` | Weixin (WeChat) | |
| `"bluebubbles"` | BlueBubbles (iMessage) | |
| `"qqbot"` | QQ Bot (Tencent QQ) | |
| `"all"` | Fan out to every connected home channel | Resolved at fire time |
| `"telegram,discord"` | Fan out to a specific set of channels | Comma-separated list |
| `"origin,all"` | Deliver to the origin **plus** every other connected channel | Combine any tokens |

The agent's final response is automatically delivered. You do not need to call `send_message` in the cron prompt.

### Routing intent (`all`)

`all` lets you ship one cron job to every messaging channel you have configured, without having to enumerate them by name. It is **resolved at fire time**, so a job created before you wired up Telegram will pick up Telegram on the next tick after you set `TELEGRAM_HOME_CHANNEL`.

Semantics: `all` expands to every platform with a configured home channel. Zero is fine; the job simply produces no delivery targets and is recorded as a delivery failure upstream.

`all` composes with explicit targets. `origin,all` delivers to the origin chat *plus* every other connected home channel, de-duplicating by `(platform, chat_id, thread_id)`.

### Telegram cron topic (`TELEGRAM_CRON_THREAD_ID`)

When Telegram topic mode is enabled, the root DM is reserved as a system lobby — replies sent there are rebuffed with a lobby reminder and `reply_to_message_id` is dropped, so you cannot reply to a cron message that landed in the main chat.

Point cron at a dedicated forum topic instead:

1. In Telegram, open the bot DM and create a topic named e.g. `Cron`. Long-press the topic header → **Copy link**; the trailing integer is the topic's `message_thread_id`.
2. Set `TELEGRAM_CRON_THREAD_ID=<that id>` in your `.env`.

This applies only to cron deliveries. `TELEGRAM_HOME_CHANNEL_THREAD_ID` (used elsewhere, e.g. restart notifications) is unchanged. Explicit `deliver="telegram:chat_id:thread_id"` targets continue to win over the env var. Replies to cron messages now arrive in the existing topic session, so you can act on them directly.

### Response wrapping

By default, delivered cron output is wrapped with a header and footer so the recipient knows it came from a scheduled task:

```
Cronjob Response: Morning feeds
-------------

<agent output here>

Note: The agent cannot see this message, and therefore cannot respond to it.
```

To deliver the raw agent output without the wrapper, set `cron.wrap_response` to `false`:

```yaml
# ~/.jarvis/config.yaml
cron:
  wrap_response: false
```

### Silent suppression

If the agent's final response starts with `[SILENT]`, delivery is suppressed entirely. The output is still saved locally for audit (in `~/.jarvis/src/cron/output/`), but no message is sent to the delivery target.

This is useful for monitoring jobs that should only report when something is wrong:

```text
Check if nginx is running. If everything is healthy, respond with only [SILENT].
Otherwise, report the issue.
```

Failed jobs always deliver regardless of the `[SILENT]` marker — only successful runs can be silenced.

## Script timeout

Pre-run scripts (attached via the `script` parameter) have a default timeout of 120 seconds. If your scripts need longer — for example, to include randomized delays that avoid bot-like timing patterns — you can increase this:

```yaml
# ~/.jarvis/config.yaml
cron:
  script_timeout_seconds: 300   # 5 minutes
```

Or set the `JARVIS_CRON_SCRIPT_TIMEOUT` environment variable. The resolution order is: env var → config.yaml → 120s default.

## No-agent mode (script-only jobs)

For recurring jobs that don't need LLM reasoning — classic watchdogs, disk/memory alerts, heartbeats, CI pings — pass `no_agent=True` at creation time. The scheduler runs your script on schedule and delivers its stdout directly, skipping the agent entirely:

```bash
jarvis cron create "every 5m" \
  --no-agent \
  --script memory-watchdog.sh \
  --deliver telegram \
  --name "memory-watchdog"
```

Semantics:

- Script stdout (trimmed) → delivered verbatim as the message.
- **Empty stdout → silent tick**, no delivery. This is the watchdog pattern: "only say something when something is wrong".
- Non-zero exit or timeout → an error alert is delivered, so a broken watchdog can't fail silently.
- `{"wakeAgent": false}` on the last line → silent tick (same gate LLM jobs use).
- No tokens, no model, no provider fallback — the job never touches the inference layer.

`.sh` / `.bash` files run under `/bin/bash`; anything else under the current Python interpreter (`sys.executable`). Scripts must live in `~/.jarvis/scripts/` (same sandboxing rule as the pre-run script gate).

### The agent sets these up for you

The `cronjob` tool's schema exposes `no_agent` to Jarvis directly, so you can describe a watchdog in chat and let the agent wire it up:

```text
Ping me on Telegram if RAM is over 85%, every 5 minutes.
```

Jarvis will write the check script to `~/.jarvis/scripts/` via `write_file`, then call:

```python
cronjob(action="create", schedule="every 5m",
        script="memory-watchdog.sh", no_agent=True,
        deliver="telegram", name="memory-watchdog")
```

It picks `no_agent=True` automatically when the message content is fully determined by the script (watchdogs, threshold alerts, heartbeats). The same tool also lets the agent pause, resume, edit, and remove jobs — so the whole lifecycle is chat-driven without anyone touching the CLI.

See the [Script-Only Cron Jobs guide](/docs/guides/cron-script-only) for worked examples.

## Chaining jobs with `context_from`

Cron jobs run in isolated sessions with no memory of previous runs. But sometimes one job's output is exactly what the next job needs. The `context_from` parameter wires that connection automatically — Job B's prompt gets Job A's most recent output prepended as context at runtime.

```python
# Job 1: Collect raw data
cronjob(
    action="create",
    prompt="Fetch the top 10 AI/ML stories from Hacker News. Save them to ~/.jarvis/data/briefs/raw.md in markdown format with title, URL, and score.",
    schedule="0 7 * * *",
    name="AI News Collector",
)

# Job 2: Triage — receives Job 1's output as context
# Get Job 1's ID from: cronjob(action="list")
cronjob(
    action="create",
    prompt="Read ~/.jarvis/data/briefs/raw.md. Score each story 1–10 for engagement potential and novelty. Output the top 5 to ~/.jarvis/data/briefs/ranked.md.",
    schedule="30 7 * * *",
    context_from="<job1_id>",
    name="AI News Triage",
)

# Job 3: Ship — receives Job 2's output as context
cronjob(
    action="create",
    prompt="Read ~/.jarvis/data/briefs/ranked.md. Write 3 tweet drafts (hook + body + hashtags). Deliver to telegram:7976161601.",
    schedule="0 8 * * *",
    context_from="<job2_id>",
    name="AI News Brief",
)
```

**How it works:**

- When Job 2 fires, Jarvis reads Job 1's most recent output from `~/.jarvis/src/cron/output/{job1_id}/*.md`
- That output is prepended to Job 2's prompt automatically
- Job 2 doesn't need to hardcode "read this file" — it receives the content as context
- The chain can be any length: Job 1 → Job 2 → Job 3 → ...

**What `context_from` accepts:**

| Format | Example |
|--------|---------|
| Single job ID (string) | `context_from="a1b2c3d4"` |
| Multiple job IDs (list) | `context_from=["job_a", "job_b"]` |

Outputs are concatenated in the order listed.

**When to use it:**

- Multi-stage pipelines (collect → filter → format → deliver)
- Dependent tasks where step N's work depends on step N−1's output
- Fan-out/fan-in patterns where one job aggregates results from several others

## Provider recovery

Cron jobs inherit your configured fallback providers and credential pool rotation. If the primary API key is rate-limited or the provider returns an error, the cron agent can:

- **Fall back to an alternate provider** if you have `fallback_providers` (or the legacy `fallback_model`) configured in `config.yaml`
- **Rotate to the next credential** in your [credential pool](/docs/user-guide/configuration#credential-pool-strategies) for the same provider

This means cron jobs that run at high frequency or during peak hours are more resilient — a single rate-limited key won't fail the entire run.

## Schedule formats

The agent's final response is automatically delivered — you do **not** need to include `send_message` in the cron prompt for that same destination. If a cron run calls `send_message` to the exact target the scheduler will already deliver to, Jarvis skips that duplicate send and tells the model to put the user-facing content in the final response instead. Use `send_message` only for additional or different targets.

### Relative delays (one-shot)

```text
30m     → Run once in 30 minutes
2h      → Run once in 2 hours
1d      → Run once in 1 day
```

### Intervals (recurring)

```text
every 30m    → Every 30 minutes
every 2h     → Every 2 hours
every 1d     → Every day
```

### Cron expressions

```text
0 9 * * *       → Daily at 9:00 AM
0 9 * * 1-5     → Weekdays at 9:00 AM
0 */6 * * *     → Every 6 hours
30 8 1 * *      → First of every month at 8:30 AM
0 0 * * 0       → Every Sunday at midnight
```

### ISO timestamps

```text
2026-03-15T09:00:00    → One-time at March 15, 2026 9:00 AM
```

## Repeat behavior

| Schedule type | Default repeat | Behavior |
|--------------|----------------|----------|
| One-shot (`30m`, timestamp) | 1 | Runs once |
| Interval (`every 2h`) | forever | Runs until removed |
| Cron expression | forever | Runs until removed |

You can override it:

```python
cronjob(
    action="create",
    prompt="...",
    schedule="every 2h",
    repeat=5,
)
```

## Managing jobs programmatically

The agent-facing API is one tool:

```python
cronjob(action="create", ...)
cronjob(action="list")
cronjob(action="update", job_id="...")
cronjob(action="pause", job_id="...")
cronjob(action="resume", job_id="...")
cronjob(action="run", job_id="...")
cronjob(action="remove", job_id="...")
```

For `update`, pass `skills=[]` to remove all attached skills.

## Toolsets available to cron jobs

Cron runs each job in a fresh agent session with no chat platform attached. By default the cron agent gets **the toolset you configured for the `cron` platform in `jarvis tools`** — not the CLI default, not everything under the sun.

```bash
jarvis tools
# → pick the "cron" platform in the curses UI
# → toggle toolsets on/off just like you would for Telegram/Discord/etc.
```

Tighter per-job control is available via the `enabled_toolsets` field on `cronjob.create` (or on an existing job via `cronjob.update`):

```text
cronjob(action="create", name="weekly-news-summary",
        schedule="every sunday 9am",
        enabled_toolsets=["web", "file"],      # just web + file, no terminal/browser/etc.
        prompt="Summarize this week's AI news: ...")
```

When `enabled_toolsets` is set on a job it wins; otherwise the `jarvis tools` cron-platform config wins; otherwise Jarvis falls back to the built-in defaults. This matters for cost control: carrying `moa`, `browser`, `delegation` into every tiny "fetch news" job bloats the tool-schema prompt on every LLM call.

### Skipping the agent entirely: `wakeAgent`

If your cron job attaches a pre-check script (via `script=`), the script can decide at runtime whether Jarvis should even invoke the agent. Emit a final stdout line of the form:

```text
{"wakeAgent": false}
```

…and cron skips the agent run entirely for this tick. Useful for frequent polls (every 1–5 min) that only need to wake the LLM when state actually changed — otherwise you pay for zero-content agent turns over and over.

```python
# pre-check script
import json, sys
latest = fetch_latest_issue_count()
prev = read_state("issue_count")
if latest == prev:
    print(json.dumps({"wakeAgent": False}))   # skip this tick
    sys.exit(0)
write_state("issue_count", latest)
print(json.dumps({"wakeAgent": True, "context": {"new_issues": latest - prev}}))
```

When `wakeAgent` is omitted, the default is `true` (wake the agent as usual).

#### Recipes: cheap pre-run gates

The `wakeAgent` gate gives you a $0 way to decide whether a scheduled job should spend any LLM tokens at all. Three patterns cover most use cases.

**File-change gate** — only run when a watched file has new content since the last successful tick. The scheduler records each job's `last_run_at`; compare it against the file's mtime.

```bash
#!/bin/bash
# ~/.jarvis/scripts/feed-changed.sh
FEED="$HOME/data/feed.json"
STATE="$HOME/.jarvis/scripts/.feed-changed.last"
test -f "$FEED" || { echo '{"wakeAgent": false}'; exit 0; }
mtime=$(stat -c %Y "$FEED")
last=$(cat "$STATE" 2>/dev/null || echo 0)
if [ "$mtime" -le "$last" ]; then
  echo '{"wakeAgent": false}'
else
  echo "$mtime" > "$STATE"
  echo '{"wakeAgent": true}'
fi
```

```text
cronjob(action="create", name="process-feed",
        schedule="every 30m",
        script="feed-changed.sh",
        prompt="A new ~/data/feed.json has landed. Summarize what changed.")
```

**External-flag gate** — only run when some other process has signalled readiness (e.g. a deploy hook drops a file, a CI job sets a value in your state store).

```bash
#!/bin/bash
# ~/.jarvis/scripts/flag-ready.sh
if test -f /tmp/new-data-ready; then
  rm -f /tmp/new-data-ready
  echo '{"wakeAgent": true}'
else
  echo '{"wakeAgent": false}'
fi
```

```text
cronjob(action="create", name="nightly-analysis",
        schedule="0 9 * * *",
        script="flag-ready.sh",
        prompt="Run the nightly analysis over today's batch.")
```

**SQL-count gate** — only run when there are new rows to process in your own database. The script can also pass the count through to the agent via `context`, so the agent knows how much it's looking at without re-querying.

```python
#!/usr/bin/env python
# ~/.jarvis/scripts/new-rows.py
import json, sqlite3
conn = sqlite3.connect("/home/me/data/app.db")
n = conn.execute(
    "SELECT COUNT(*) FROM messages WHERE ts > strftime('%s','now','-2 hours')"
).fetchone()[0]
if n < 1:
    print(json.dumps({"wakeAgent": False}))
else:
    print(json.dumps({"wakeAgent": True, "context": {"new_rows": n}}))
```

```text
cronjob(action="create", name="summarize-new-msgs",
        schedule="every 2h",
        script="new-rows.py",
        prompt="Summarize the new messages from the last 2 hours.")
```

The same pattern works for any data source you can query from a script — Postgres, an HTTP API, your own state store — without baking a SQL evaluator into the cron subsystem.

:::tip
Jarvis's own `~/.jarvis/state.db` is an internal schema that changes between releases. Don't query it from a pre-run gate — point at your own database or feed instead.
:::

Credit: this recipe set was prompted by @iankar8's exploration in [#2654](https://github.com/SethyPagna/Secretary-Jarvis/pull/2654), which proposed adding sql/file/command triggers as a parallel mechanism. The `script` + `wakeAgent` gate already covers all three cases at $0, so the work landed as documentation instead.

### Chaining jobs: `context_from`

A cron job can consume the most recent successful output of one or more other jobs by listing their names (or IDs) in `context_from`:

```text
cronjob(action="create", name="daily-digest",
        schedule="every day 7am",
        context_from=["ai-news-fetch", "github-prs-fetch"],
        prompt="Write the daily digest using the outputs above.")
```

The referenced jobs' most recent completed outputs are injected above the prompt as context for this run. Each upstream entry must be a valid job ID or name (see `cronjob action="list"`). Note: chaining reads the *most recent completed* output — it does not wait for upstream jobs that are running in the same tick.

## Job storage

Jobs are stored in `~/.jarvis/src/cron/jobs.json`. Output from job runs is saved to `~/.jarvis/src/cron/output/{job_id}/{timestamp}.md`.

Jobs may store `model` and `provider` as `null`. When those fields are omitted, Jarvis resolves them at execution time from the global configuration. They only appear in the job record when a per-job override is set.

The storage uses atomic file writes so interrupted writes do not leave a partially written job file behind.

## Self-contained prompts still matter

:::warning Important
Cron jobs run in a completely fresh agent session. The prompt must contain everything the agent needs that is not already provided by attached skills.
:::

**BAD:** `"Check on that server issue"`

**GOOD:** `"SSH into server 192.168.1.100 as user 'deploy', check if nginx is running with 'systemctl status nginx', and verify https://example.com returns HTTP 200."`

## Security

Scheduled task prompts are scanned for prompt-injection and credential-exfiltration patterns at creation and update time. Prompts containing invisible Unicode tricks, SSH backdoor attempts, or obvious secret-exfiltration payloads are blocked.

## Source: `guides/automate-with-cron.md`

---
sidebar_position: 11
title: "Automate Anything with Cron"
description: "Real-world automation patterns using Jarvis cron — monitoring, reports, pipelines, and multi-skill workflows"
---

# Automate Anything with Cron

The [daily briefing bot tutorial](/docs/guides/daily-briefing-bot) covers the basics. This guide goes further — five real-world automation patterns you can adapt for your own workflows.

For the full feature reference, see [Scheduled Tasks (Cron)](/docs/user-guide/features/cron).

:::info Key Concept
Cron jobs run in fresh agent sessions with no memory of your current chat. Prompts must be **completely self-contained** — include everything the agent needs to know.
:::

:::tip Don't need the LLM? You have two zero-token options.
- **Recurring watchdog** where the script already produces the exact message (memory alerts, disk alerts, heartbeats): use [script-only cron jobs](/docs/guides/cron-script-only). Same scheduler, no LLM. You can ask Jarvis to set one up for you in chat — the `cronjob` tool knows when to pick `no_agent=True` and writes the script for you.
- **One-shot from a script that's already running** (CI step, post-commit hook, deploy script, externally-scheduled monitor): use [`jarvis send`](/docs/guides/pipe-script-output) to pipe stdout or a file straight to Telegram / Discord / Slack / etc. without setting up a cron entry.
:::

---

## Pattern 1: Website Change Monitor

Watch a URL for changes and get notified only when something is different.

The `script` parameter is the secret weapon here. A Python script runs before each execution, and its stdout becomes context for the agent. The script handles the mechanical work (fetching, diffing); the agent handles the reasoning (is this change interesting?).

Create the monitoring script:

```bash
mkdir -p ~/.jarvis/scripts
```

```python title="~/.jarvis/scripts/watch-site.py"
import hashlib, json, os, urllib.request

URL = "https://example.com/pricing"
STATE_FILE = os.path.expanduser("~/.jarvis/scripts/.watch-site-state.json")

# Fetch current content
req = urllib.request.Request(URL, headers={"User-Agent": "Jarvis-Monitor/1.0"})
content = urllib.request.urlopen(req, timeout=30).read().decode()
current_hash = hashlib.sha256(content.encode()).hexdigest()

# Load previous state
prev_hash = None
if os.path.exists(STATE_FILE):
    with open(STATE_FILE) as f:
        prev_hash = json.load(f).get("hash")

# Save current state
with open(STATE_FILE, "w") as f:
    json.dump({"hash": current_hash, "url": URL}, f)

# Output for the agent
if prev_hash and prev_hash != current_hash:
    print(f"CHANGE DETECTED on {URL}")
    print(f"Previous hash: {prev_hash}")
    print(f"Current hash: {current_hash}")
    print(f"\nCurrent content (first 2000 chars):\n{content[:2000]}")
else:
    print("NO_CHANGE")
```

Set up the cron job:

```bash
/cron add "every 1h" "If the script output says CHANGE DETECTED, summarize what changed on the page and why it might matter. If it says NO_CHANGE, respond with just [SILENT]." --script ~/.jarvis/scripts/watch-site.py --name "Pricing monitor" --deliver telegram
```

:::tip The [SILENT] Trick
When the agent's final response contains `[SILENT]`, delivery is suppressed. This means you only get notified when something actually happens — no spam on quiet hours.
:::

---

## Pattern 2: Weekly Report

Compile information from multiple sources into a formatted summary. This runs once a week and delivers to your home channel.

```bash
/cron add "0 9 * * 1" "Generate a weekly report covering:

1. Search the web for the top 5 AI news stories from the past week
2. Search GitHub for trending repositories in the 'machine-learning' topic
3. Check Hacker News for the most discussed AI/ML posts

Format as a clean summary with sections for each source. Include links.
Keep it under 500 words — highlight only what matters." --name "Weekly AI digest" --deliver telegram
```

From the CLI:

```bash
jarvis cron create "0 9 * * 1" \
  "Generate a weekly report covering the top AI news, trending ML GitHub repos, and most-discussed HN posts. Format with sections, include links, keep under 500 words." \
  --name "Weekly AI digest" \
  --deliver telegram
```

The `0 9 * * 1` is a standard cron expression: 9:00 AM every Monday.

---

## Pattern 3: GitHub Repository Watcher

Monitor a repository for new issues, PRs, or releases.

```bash
/cron add "every 6h" "Check the GitHub repository JARVISProject/jarvis-agent for:
- New issues opened in the last 6 hours
- New PRs opened or merged in the last 6 hours
- Any new releases

Use the terminal to run gh commands:
  gh issue list --repo JARVISProject/jarvis-agent --state open --json number,title,author,createdAt --limit 10
  gh pr list --repo JARVISProject/jarvis-agent --state all --json number,title,author,createdAt,mergedAt --limit 10

Filter to only items from the last 6 hours. If nothing new, respond with [SILENT].
Otherwise, provide a concise summary of the activity." --name "Repo watcher" --deliver discord
```

:::warning Self-Contained Prompts
Notice how the prompt includes the exact `gh` commands. The cron agent has no memory of previous runs or your preferences — spell everything out.
:::

---

## Pattern 4: Data Collection Pipeline

Scrape data at regular intervals, save to files, and detect trends over time. This pattern combines a script (for collection) with the agent (for analysis).

```python title="~/.jarvis/scripts/collect-prices.py"
import json, os, urllib.request
from datetime import datetime

DATA_DIR = os.path.expanduser("~/.jarvis/data/prices")
os.makedirs(DATA_DIR, exist_ok=True)

# Fetch current data (example: crypto prices)
url = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd"
data = json.loads(urllib.request.urlopen(url, timeout=30).read())

# Append to history file
entry = {"timestamp": datetime.now().isoformat(), "prices": data}
history_file = os.path.join(DATA_DIR, "history.jsonl")
with open(history_file, "a") as f:
    f.write(json.dumps(entry) + "\n")

# Load recent history for analysis
lines = open(history_file).readlines()
recent = [json.loads(l) for l in lines[-24:]]  # Last 24 data points

# Output for the agent
print(f"Current: BTC=${data['bitcoin']['usd']}, ETH=${data['ethereum']['usd']}")
print(f"Data points collected: {len(lines)} total, showing last {len(recent)}")
print(f"\nRecent history:")
for r in recent[-6:]:
    print(f"  {r['timestamp']}: BTC=${r['prices']['bitcoin']['usd']}, ETH=${r['prices']['ethereum']['usd']}")
```

```bash
/cron add "every 1h" "Analyze the price data from the script output. Report:
1. Current prices
2. Trend direction over the last 6 data points (up/down/flat)
3. Any notable movements (>5% change)

If prices are flat and nothing notable, respond with [SILENT].
If there's a significant move, explain what happened." \
  --script ~/.jarvis/scripts/collect-prices.py \
  --name "Price tracker" \
  --deliver telegram
```

The script does the mechanical collection; the agent adds the reasoning layer.

---

## Pattern 5: Multi-Skill Workflow

Chain skills together for complex scheduled tasks. Skills are loaded in order before the prompt executes.

```bash
# Use the arxiv skill to find papers, then the obsidian skill to save notes
/cron add "0 8 * * *" "Search arXiv for the 3 most interesting papers on 'language model reasoning' from the past day. For each paper, create an Obsidian note with the title, authors, abstract summary, and key contribution." \
  --skill arxiv \
  --skill obsidian \
  --name "Paper digest"
```

From the tool directly:

```python
cronjob(
    action="create",
    skills=["arxiv", "obsidian"],
    prompt="Search arXiv for papers on 'language model reasoning' from the past day. Save the top 3 as Obsidian notes.",
    schedule="0 8 * * *",
    name="Paper digest",
    deliver="local"
)
```

Skills are loaded in order — `arxiv` first (teaches the agent how to search papers), then `obsidian` (teaches how to write notes). The prompt ties them together.

---

## Managing Your Jobs

```bash
# List all active jobs
/cron list

# Trigger a job immediately (for testing)
/cron run <job_id>

# Pause a job without deleting it
/cron pause <job_id>

# Edit a running job's schedule or prompt
/cron edit <job_id> --schedule "every 4h"
/cron edit <job_id> --prompt "Updated task description"

# Add or remove skills from an existing job
/cron edit <job_id> --skill arxiv --skill obsidian
/cron edit <job_id> --clear-skills

# Remove a job permanently
/cron remove <job_id>
```

---

## Delivery Targets

The `--deliver` flag controls where results go:

| Target | Example | Use case |
|--------|---------|----------|
| `origin` | `--deliver origin` | Same chat that created the job (default) |
| `local` | `--deliver local` | Save to local file only |
| `telegram` | `--deliver telegram` | Your Telegram home channel |
| `discord` | `--deliver discord` | Your Discord home channel |
| `slack` | `--deliver slack` | Your Slack home channel |
| Specific chat | `--deliver telegram:-1001234567890` | A specific Telegram group |
| Threaded | `--deliver telegram:-1001234567890:17585` | A specific Telegram topic thread |

---

## Tips

**Make prompts self-contained.** The agent in a cron job has no memory of your conversations. Include URLs, repo names, format preferences, and delivery instructions directly in the prompt.

**Use `[SILENT]` liberally.** For monitoring jobs, always include instructions like "if nothing changed, respond with `[SILENT]`." This prevents notification noise.

**Use scripts for data collection.** The `script` parameter lets a Python script handle the boring parts (HTTP requests, file I/O, state tracking). The agent only sees the script's stdout and applies reasoning to it. This is cheaper and more reliable than having the agent do the fetching itself.

**Test with `/cron run`.** Before waiting for the schedule to trigger, use `/cron run <job_id>` to execute immediately and verify the output looks right.

**Schedule expressions.** Supported formats: relative delays (`30m`), intervals (`every 2h`), standard cron expressions (`0 9 * * *`), and ISO timestamps (`2025-06-15T09:00:00`). Natural language like `daily at 9am` is not supported — use `0 9 * * *` instead.

---

*For the complete cron reference — all parameters, edge cases, and internals — see [Scheduled Tasks (Cron)](/docs/user-guide/features/cron).*

## Source: `guides/cron-troubleshooting.md`

---
sidebar_position: 12
title: "Cron Troubleshooting"
description: "Diagnose and fix common Jarvis cron issues — jobs not firing, delivery failures, skill loading errors, and performance problems"
---

# Cron Troubleshooting

When a cron job isn't behaving as expected, work through these checks in order. Most issues fall into one of four categories: timing, delivery, permissions, or skill loading.

---

## Jobs Not Firing

### Check 1: Verify the job exists and is active

```bash
jarvis cron list
```

Look for the job and confirm its state is `[active]` (not `[paused]` or `[completed]`). If it shows `[completed]`, the repeat count may be exhausted — edit the job to reset it.

### Check 2: Confirm the schedule is correct

A misformatted schedule silently defaults to one-shot or is rejected entirely. Test your expression:

| Your expression | Should evaluate to |
|----------------|-------------------|
| `0 9 * * *` | 9:00 AM every day |
| `0 9 * * 1` | 9:00 AM every Monday |
| `every 2h` | Every 2 hours from now |
| `30m` | 30 minutes from now |
| `2025-06-01T09:00:00` | June 1, 2025 at 9:00 AM UTC |

If the job fires once and then disappears from the list, it's a one-shot schedule (`30m`, `1d`, or an ISO timestamp) — expected behavior.

### Check 3: Is the gateway running?

Cron jobs are fired by the gateway's background ticker thread, which ticks every 60 seconds. A regular CLI chat session does **not** automatically fire cron jobs.

If you're expecting jobs to fire automatically, you need a running gateway (`jarvis gateway` for foreground, or `jarvis gateway start` for the installed service). For one-off debugging, you can manually trigger a tick with `jarvis cron tick`.

### Check 4: Check the system clock and timezone

Jobs use the local timezone. If your machine's clock is wrong or in a different timezone than expected, jobs will fire at the wrong times. Verify:

```bash
date
jarvis cron list   # Compare next_run times with local time
```

---

## Delivery Failures

### Check 1: Verify the deliver target is correct

Delivery targets are case-sensitive and require the correct platform to be configured. A misconfigured target silently drops the response.

| Target | Requires |
|--------|----------|
| `telegram` | `TELEGRAM_BOT_TOKEN` in `~/.jarvis/.env` |
| `discord` | `DISCORD_BOT_TOKEN` in `~/.jarvis/.env` |
| `slack` | `SLACK_BOT_TOKEN` in `~/.jarvis/.env` |
| `whatsapp` | WhatsApp gateway configured |
| `signal` | Signal gateway configured |
| `matrix` | Matrix homeserver configured |
| `email` | SMTP configured in `config.yaml` |
| `sms` | SMS provider configured |
| `local` | Write access to `~/.jarvis/src/cron/output/` |
| `origin` | Delivers to the chat where the job was created |

Other supported platforms include `mattermost`, `homeassistant`, `dingtalk`, `feishu`, `wecom`, `weixin`, `bluebubbles`, `qqbot`, and `webhook`. You can also target a specific chat with `platform:chat_id` syntax (e.g., `telegram:-1001234567890`).

If delivery fails, the job still runs — it just won't send anywhere. Check `jarvis cron list` for updated `last_error` field (if available).

### Check 2: Check `[SILENT]` usage

If your cron job produces no output or the agent responds with `[SILENT]`, delivery is suppressed. This is intentional for monitoring jobs — but make sure your prompt isn't accidentally suppressing everything.

A prompt that says "respond with [SILENT] if nothing changed" will silently swallow non-empty responses too. Check your conditional logic.

### Check 3: Platform token permissions

Each messaging platform bot needs specific permissions to receive messages. If delivery silently fails:

- **Telegram**: Bot must be an admin in the target group/channel
- **Discord**: Bot must have permission to send in the target channel
- **Slack**: Bot must be added to the workspace and have `chat:write` scope

### Check 4: Response wrapping

By default, cron responses are wrapped with a header and footer (`cron.wrap_response: true` in `config.yaml`). Some platforms or integrations may not handle this well. To disable:

```yaml
cron:
  wrap_response: false
```

---

## Skill Loading Failures

### Check 1: Verify skills are installed

```bash
jarvis skills list
```

Skills must be installed before they can be attached to cron jobs. If a skill is missing, install it first with `jarvis skills install <skill-name>` or via `/skills` in the CLI.

### Check 2: Check skill name vs. skill folder name

Skill names are case-sensitive and must match the installed skill's folder name. If your job specifies `ai-funding-daily-report` but the skill folder is `ai-funding-daily-report`, confirm the exact name from `jarvis skills list`.

### Check 3: Skills that require interactive tools

Cron jobs run with the `cronjob`, `messaging`, and `clarify` toolsets disabled. This prevents recursive cron creation, direct message sending (delivery is handled by the scheduler), and interactive prompts. If a skill relies on these toolsets, it won't work in a cron context.

Check the skill's documentation to confirm it works in non-interactive (headless) mode.

### Check 4: Multi-skill ordering

When using multiple skills, they load in order. If Skill A depends on context from Skill B, make sure B loads first:

```bash
/cron add "0 9 * * *" "..." --skill context-skill --skill target-skill
```

In this example, `context-skill` loads before `target-skill`.

---

## Job Errors and Failures

### Check 1: Review recent job output

If a job ran and failed, you may see error context in:

1. The chat where the job delivers (if delivery succeeded)
2. `~/.jarvis/logs/agent.log` for scheduler messages (or `errors.log` for warnings)
3. The job's `last_run` metadata via `jarvis cron list`

### Check 2: Common error patterns

**"No such file or directory" for scripts**
The `script` path must be an absolute path (or relative to the Jarvis config directory). Verify:
```bash
ls ~/.jarvis/scripts/your-script.py   # Must exist
jarvis cron edit <job_id> --script ~/.jarvis/scripts/your-script.py
```

**"Skill not found" at job execution**
The skill must be installed on the machine running the scheduler. If you move between machines, skills don't automatically sync — reinstall them with `jarvis skills install <skill-name>`.

**Job runs but delivers nothing**
Likely a delivery target issue (see Delivery Failures above) or a silently suppressed response (`[SILENT]`).

**Job hangs or times out**
The scheduler uses an inactivity-based timeout (default 600s, configurable via `JARVIS_CRON_TIMEOUT` env var, `0` for unlimited). The agent can run as long as it's actively calling tools — the timer only fires after sustained inactivity. Long-running jobs should use scripts to handle data collection and deliver only the result.

### Check 3: Lock contention

The scheduler uses file-based locking to prevent overlapping ticks. If two gateway instances are running (or a CLI session conflicts with a gateway), jobs may be delayed or skipped.

Kill duplicate gateway processes:
```bash
ps aux | grep jarvis
# Kill duplicate processes, keep only one
```

### Check 4: Permissions on jobs.json

Jobs are stored in `~/.jarvis/src/cron/jobs.json`. If this file is not readable/writable by your user, the scheduler will fail silently:

```bash
ls -la ~/.jarvis/src/cron/jobs.json
chmod 600 ~/.jarvis/src/cron/jobs.json   # Your user should own it
```

---

## Performance Issues

### Slow job startup

Each cron job creates a fresh AIAgent session, which may involve provider authentication and model loading. For time-sensitive schedules, add buffer time (e.g., `0 8 * * *` instead of `0 9 * * *`).

### Too many overlapping jobs

The scheduler executes jobs sequentially within each tick. If multiple jobs are due at the same time, they run one after another. Consider staggering schedules (e.g., `0 9 * * *` and `5 9 * * *` instead of both at `0 9 * * *`) to avoid delays.

### Large script output

Scripts that dump megabytes of output will slow down the agent and may hit token limits. Filter/summarize at the script level — emit only what the agent needs to reason about.

---

## Diagnostic Commands

```bash
jarvis cron list                    # Show all jobs, states, next_run times
jarvis cron run <job_id>            # Schedule for next tick (for testing)
jarvis cron edit <job_id>           # Fix configuration issues
jarvis logs                         # View recent Jarvis logs
jarvis skills list                  # Verify installed skills
```

---

## Getting More Help

If you've worked through this guide and the issue persists:

1. Run the job with `jarvis cron run <job_id>` (fires on next gateway tick) and watch for errors in the chat output
2. Check `~/.jarvis/logs/agent.log` for scheduler messages and `~/.jarvis/logs/errors.log` for warnings
3. Open an issue at [github.com/JARVISProject/jarvis-agent](https://github.com/SethyPagna/Secretary-Jarvis) with:
   - The job ID and schedule
   - The delivery target
   - What you expected vs. what happened
   - Relevant error messages from the logs

---

*For the complete cron reference, see [Automate Anything with Cron](/docs/guides/automate-with-cron) and [Scheduled Tasks (Cron)](/docs/user-guide/features/cron).*

## Source: `developer-guide/cron-internals.md`

---
sidebar_position: 11
title: "Cron Internals"
description: "How Jarvis stores, schedules, edits, pauses, skill-loads, and delivers cron jobs"
---

# Cron Internals

The cron subsystem provides scheduled task execution — from simple one-shot delays to recurring cron-expression jobs with skill injection and cross-platform delivery.

## Key Files

| File | Purpose |
|------|---------|
| `src/cron/jobs.py` | Job model, storage, atomic read/write to `jobs.json` |
| `src/cron/scheduler.py` | Scheduler loop — due-job detection, execution, repeat tracking |
| `src/tools/cronjob_tools.py` | Model-facing `cronjob` tool registration and handler |
| `src/gateway/run.py` | Gateway integration — cron ticking in the long-running loop |
| `src/jarvis_cli/cron.py` | CLI `jarvis cron` subcommands |

## Scheduling Model

Four schedule formats are supported:

| Format | Example | Behavior |
|--------|---------|----------|
| **Relative delay** | `30m`, `2h`, `1d` | One-shot, fires after the specified duration |
| **Interval** | `every 2h`, `every 30m` | Recurring, fires at regular intervals |
| **Cron expression** | `0 9 * * *` | Standard 5-field cron syntax (minute, hour, day, month, weekday) |
| **ISO timestamp** | `2025-01-15T09:00:00` | One-shot, fires at the exact time |

The model-facing surface is a single `cronjob` tool with action-style operations: `create`, `list`, `update`, `pause`, `resume`, `run`, `remove`.

## Job Storage

Jobs are stored in `~/.jarvis/src/cron/jobs.json` with atomic write semantics (write to temp file, then rename). Each job record contains:

```json
{
  "id": "a1b2c3d4e5f6",
  "name": "Daily briefing",
  "prompt": "Summarize today's AI news and funding rounds",
  "schedule": {
    "kind": "cron",
    "expr": "0 9 * * *",
    "display": "0 9 * * *"
  },
  "skills": ["ai-funding-daily-report"],
  "deliver": "telegram:-1001234567890",
  "repeat": {
    "times": null,
    "completed": 42
  },
  "state": "scheduled",
  "enabled": true,
  "next_run_at": "2025-01-16T09:00:00Z",
  "last_run_at": "2025-01-15T09:00:00Z",
  "last_status": "ok",
  "created_at": "2025-01-01T00:00:00Z",
  "model": null,
  "provider": null,
  "script": null
}
```

### Job Lifecycle States

| State | Meaning |
|-------|---------|
| `scheduled` | Active, will fire at next scheduled time |
| `paused` | Suspended — won't fire until resumed |
| `completed` | Repeat count exhausted or one-shot that has fired |
| `running` | Currently executing (transient state) |

### Backward Compatibility

Older jobs may have a single `skill` field instead of the `skills` array. The scheduler normalizes this at load time — single `skill` is promoted to `skills: [skill]`.

## Scheduler Runtime

### Tick Cycle

The scheduler runs on a periodic tick (default: every 60 seconds):

```text
tick()
  1. Acquire scheduler lock (prevents overlapping ticks)
  2. Load all jobs from jobs.json
  3. Filter to due jobs (next_run <= now AND state == "scheduled")
  4. For each due job:
     a. Set state to "running"
     b. Create fresh AIAgent session (no conversation history)
     c. Load attached skills in order (injected as user messages)
     d. Run the job prompt through the agent
     e. Deliver the response to the configured target
     f. Update run_count, compute next_run
     g. If repeat count exhausted → state = "completed"
     h. Otherwise → state = "scheduled"
  5. Write updated jobs back to jobs.json
  6. Release scheduler lock
```

### Gateway Integration

In gateway mode, the scheduler runs in a dedicated background thread (`_start_cron_ticker` in `src/gateway/run.py`) that calls `scheduler.tick()` every 60 seconds alongside message handling.

In CLI mode, cron jobs only fire when `jarvis cron` commands are run or during active CLI sessions.

### Fresh Session Isolation

Each cron job runs in a completely fresh agent session:

- No conversation history from previous runs
- No memory of previous cron executions (unless persisted to memory/files)
- The prompt must be self-contained — cron jobs cannot ask clarifying questions
- The `cronjob` toolset is disabled (recursion guard)

## Skill-Backed Jobs

A cron job can attach one or more skills via the `skills` field. At execution time:

1. Skills are loaded in the specified order
2. Each skill's SKILL.md content is injected as context
3. The job's prompt is appended as the task instruction
4. The agent processes the combined skill context + prompt

This enables reusable, tested workflows without pasting full instructions into cron prompts. For example:

```
Create a daily funding report → attach "ai-funding-daily-report" skill
```

### Script-Backed Jobs

Jobs can also attach a Python script via the `script` field. The script runs *before* each agent turn, and its stdout is injected into the prompt as context. This enables data collection and change detection patterns:

```python
# ~/.jarvis/scripts/check_competitors.py
import requests, json
# Fetch competitor release notes, diff against last run
# Print summary to stdout — agent analyzes and reports
```

The script timeout defaults to 120 seconds. `_get_script_timeout()` resolves the limit through a three-layer chain:

1. **Module-level override** — `_SCRIPT_TIMEOUT` (for tests/monkeypatching). Only used when it differs from the default.
2. **Environment variable** — `JARVIS_CRON_SCRIPT_TIMEOUT`
3. **Config** — `cron.script_timeout_seconds` in `config.yaml` (read via `load_config()`)
4. **Default** — 120 seconds

### Provider Recovery

`run_job()` passes the user's configured fallback providers and credential pool into the `AIAgent` instance:

- **Fallback providers** — reads `fallback_providers` (list) or `fallback_model` (legacy dict) from `config.yaml`, matching the gateway's `_load_fallback_model()` pattern. Passed as `fallback_model=` to `AIAgent.__init__`, which normalizes both formats into a fallback chain.
- **Credential pool** — loads via `load_pool(provider)` from `agent.credential_pool` using the resolved runtime provider name. Only passed when the pool has credentials (`pool.has_credentials()`). Enables same-provider key rotation on 429/rate-limit errors.

This mirrors the gateway's behavior — without it, cron agents would fail on rate limits without attempting recovery.

## Delivery Model

Cron job results can be delivered to any supported platform:

| Target | Syntax | Example |
|--------|--------|---------|
| Origin chat | `origin` | Deliver to the chat where the job was created |
| Local file | `local` | Save to `~/.jarvis/src/cron/output/` |
| Telegram | `telegram` or `telegram:<chat_id>` | `telegram:-1001234567890` |
| Discord | `discord` or `discord:#channel` | `discord:#engineering` |
| Slack | `slack` | Deliver to Slack home channel |
| WhatsApp | `whatsapp` | Deliver to WhatsApp home |
| Signal | `signal` | Deliver to Signal |
| Matrix | `matrix` | Deliver to Matrix home room |
| Mattermost | `mattermost` | Deliver to Mattermost home |
| Email | `email` | Deliver via email |
| SMS | `sms` | Deliver via SMS |
| Home Assistant | `homeassistant` | Deliver to HA conversation |
| DingTalk | `dingtalk` | Deliver to DingTalk |
| Feishu | `feishu` | Deliver to Feishu |
| WeCom | `wecom` | Deliver to WeCom |
| Weixin | `weixin` | Deliver to Weixin (WeChat) |
| BlueBubbles | `bluebubbles` | Deliver to iMessage via BlueBubbles |
| QQ Bot | `qqbot` | Deliver to QQ (Tencent) via Official API v2 |

For Telegram topics, use the format `telegram:<chat_id>:<thread_id>` (e.g., `telegram:-1001234567890:17585`).

### Response Wrapping

By default (`cron.wrap_response: true`), cron deliveries are wrapped with:
- A header identifying the cron job name and task
- A footer noting the agent cannot see the delivered message in conversation

The `[SILENT]` prefix in a cron response suppresses delivery entirely — useful for jobs that only need to write to files or perform side effects.

### Session Isolation

Cron deliveries are NOT mirrored into gateway session conversation history. They exist only in the cron job's own session. This prevents message alternation violations in the target chat's conversation.

## Recursion Guard

Cron-run sessions have the `cronjob` toolset disabled. This prevents:
- A scheduled job from creating new cron jobs
- Recursive scheduling that could explode token usage
- Accidental mutation of the job schedule from within a job

## Locking

The scheduler uses cross-process file-based locking (`fcntl.flock` on Unix, `msvcrt.locking` on Windows) to prevent overlapping ticks from executing the same due-job batch twice — even between the gateway's in-process ticker and a standalone `jarvis cron` / manual `tick()` call. If the lock cannot be acquired, `tick()` returns 0 immediately.

## CLI Interface

The `jarvis cron` CLI provides direct job management:

```bash
jarvis cron list                    # Show all jobs
jarvis cron create                  # Interactive job creation (alias: add)
jarvis cron edit <job_id>           # Edit job configuration
jarvis cron pause <job_id>          # Pause a running job
jarvis cron resume <job_id>         # Resume a paused job
jarvis cron run <job_id>            # Trigger immediate execution
jarvis cron remove <job_id>         # Delete a job
```

## Related Docs

- [Cron Feature Guide](/docs/user-guide/features/cron)
- [Gateway Internals](./gateway-internals.md)
- [Agent Loop Internals](./agent-loop.md)
