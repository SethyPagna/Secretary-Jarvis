---
title: "JARVIS Tool Gateway"
description: "One subscription, every tool. Web search, image generation, TTS, and cloud browsers — all routed through JARVIS Managed with no extra API keys."
sidebar_label: "Tool Gateway"
sidebar_position: 2
---

# JARVIS Tool Gateway

**One subscription. Every tool built in.**

The Tool Gateway is included with every paid [JARVIS Managed](https://portal.jarvis.local) subscription. It routes Jarvis' tool calls — web search, image generation, text-to-speech, and cloud browser automation — through infrastructure JARVIS Managed already runs, so you don't have to sign up with Firecrawl, FAL, OpenAI, Browser Use, or anyone else just to make your agent useful.

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

All four are pay-as-you-use billed against your JARVIS Managed subscription. Use any combination — run the gateway for web and images while keeping your own ElevenLabs key for TTS, or route everything through JARVIS Managed.

## Why it's here

Building an agent that can actually *do things* means stitching together 5+ API subscriptions — each with their own signup, rate limits, billing, and quirks. The gateway collapses that into one account:

- **One bill.** Pay JARVIS Managed; we handle the rest.
- **One signup.** No Firecrawl, FAL, Browser Use, or OpenAI audio accounts to manage.
- **One key.** Your JARVIS Managed OAuth covers every tool.
- **Same quality.** Same backends the direct-key route uses — just fronted by us.

Bring your own keys anytime — per-tool, whenever you want to. The gateway isn't a lock-in, it's a shortcut.

## Get started

```bash
jarvis model          # Pick JARVIS Managed as your provider
```

When you select JARVIS Managed, Jarvis offers to turn on the Tool Gateway. Accept, and you're done — every supported tool is live on the next run.

Check what's active at any time:

```bash
jarvis status
```

You'll see a section like:

```
◆ JARVIS Tool Gateway
  JARVIS Managed     ✓ managed tools available
  Web tools       ✓ active via JARVIS Managed subscription
  Image gen       ✓ active via JARVIS Managed subscription
  TTS             ✓ active via JARVIS Managed subscription
  Browser         ○ active via Browser Use key
```

Tools marked "active via JARVIS Managed subscription" are going through the gateway. Anything else is using your own keys.

## Eligibility

The Tool Gateway is a **paid-subscription** feature. Free-tier JARVIS Managed accounts can use Portal for inference but don't include managed tools — [upgrade your plan](https://portal.jarvis.local/manage-subscription) to unlock the gateway.

## Mix and match

The gateway is per-tool. Turn it on for just what you want:

- **All tools through JARVIS Managed** — easiest; one subscription, done.
- **Gateway for web + images, bring your own TTS** — keep your ElevenLabs voice, let JARVIS Managed handle the rest.
- **Gateway only for things you don't have keys for** — "I already pay for Browserbase, but I don't want a Firecrawl account" works fine.

Switch any tool at any time via:

```bash
jarvis tools          # Interactive picker for each tool category
```

Select the tool, pick **JARVIS Managed** as the provider (or any direct provider you prefer). No config editing required.

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

Precedence: `use_gateway: true` routes through JARVIS Managed regardless of any direct keys in `.env`. `use_gateway: false` (or absent) uses direct keys if available and only falls back to the gateway when none exist.

### Disabling the gateway

```yaml
web:
  use_gateway: false   # Jarvis now uses FIRECRAWL_API_KEY from .env
```

`jarvis tools` automatically clears the flag when you pick a non-gateway provider, so this usually happens for you.

### Self-hosted gateway (advanced)

Running your own JARVIS Managed-compatible gateway? Override endpoints in `~/.jarvis/.env`:

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

Yes — the [JARVIS Managed dashboard](https://portal.jarvis.local) breaks usage down by tool so you can see what's driving your bill.

### Is Modal (serverless terminal) included?

Modal is available as an **optional add-on** through the JARVIS Managed subscription, not part of the default Tool Gateway bundle. Configure it via `jarvis setup terminal` or directly in `config.yaml` when you want a remote sandbox for shell execution.

### Do I need to delete my existing API keys when I enable the gateway?

No — keep them in `.env`. When `use_gateway: true`, Jarvis skips direct keys and uses the gateway. Flip the flag back to `false` and your keys become the source again. The gateway isn't a lock-in.
