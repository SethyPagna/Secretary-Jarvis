---
name: jarvis-agent
description: "Configure, extend, and verify the JARVIS desktop agent."
version: 3.0.0
author: JARVIS Project
license: MIT
platforms: [linux, macos, windows]
metadata:
  jarvis:
    tags: [jarvis, desktop, local-first, models, voice, workflows, gateway]
    homepage: https://github.com/SethyPagna/Secretary-Jarvis
    related_skills: [codex, opencode, desktop-agent]
---

# JARVIS Desktop Agent

JARVIS is a local-first desktop agent with a unified Home page for chat,
terminal work, voice input/output, live model status, permissions, platform
gateways, and workflow automation. Use this skill when configuring the desktop
app, checking runtime readiness, tuning model backends, extending workflows, or
debugging voice and packaging behavior.

## Core Mental Model

- The desktop app is the primary surface.
- The integrated terminal is part of Home, not a separate product.
- Electron owns the visible app lifecycle.
- The Python backend is a hidden child process started and stopped by Electron.
- llama.cpp is the default local inference target, vLLM is the throughput tier,
  and Ollama is the final local fallback.
- Kokoro and OmniVoice-style local voices are preferred for TTS. System TTS is a
  fallback. Cloud STT/TTS only runs when the user supplies and enables an API key.
- faster-whisper is the default STT runtime when local models are present.

## Setup Checklist

1. Confirm the active branch is `main`.
2. Run backend dependency checks before launching Electron.
3. Verify `/api/runtime/readiness` for model, TTS, STT, stats, and shutdown
   blockers.
4. Run `/api/runtime/smoke-test` before claiming voice or model readiness.
5. Use the Models page to configure API-key providers. Never hard-code secrets
   into repository files.
6. Use the Souls page to select identity and voice profiles.
7. Use the Permissions page to keep filesystem, browser, network, and tool
   access explicit.

## Model Guidance

Prefer this order for local inference:

1. llama.cpp with an OpenAI-compatible server.
2. vLLM for higher throughput and batched serving.
3. Ollama only when the first two are unavailable or the user explicitly wants
   its registry workflow.

For fast interaction, keep the active model warm, report tokens per second from
real requests, and show latency/blockers in the UI. Qwen reasoning models should
run with their intended reasoning settings when the backend exposes them.

## Voice Guidance

Typed and spoken replies must share the same response path. Microphone audio
should transcribe into the Home input, dispatch through the live chat/terminal
stream, and synthesize the assistant output from that stream. Avoid canned voice
responses that differ from the written answer.

TTS readiness means playable bytes were produced. STT readiness means a known
sample or microphone capture produced a non-empty transcript. If Kokoro or
OmniVoice assets are present but the runtime dependency is missing, report the
exact blocker and fall back only through the configured chain.

## Packaging Guidance

The packaged app should present one user-facing desktop entry. Backend and model
children are owned by the app lifecycle and must terminate on normal close, tray
quit, or shutdown API completion. Packaging is not complete until the backend
binary starts, `/api/status` responds, `/api/shutdown` stops it, and the desktop
installer launches without leaving idle child processes behind.

## Verification Commands

```bash
python -m unittest tests.jarvis_cli.test_desktop_identity_contract
python -m unittest tests.jarvis_cli.test_desktop_home_contract
python -m unittest tests.jarvis_cli.test_runtime_smoke
cd web && npm run build
```

Use focused tests first, then run broader suites before a release candidate.
