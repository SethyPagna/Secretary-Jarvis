# Phase 41 Verification

Date: 2026-05-17

## Result

Phase 41 is implemented and verified. Jarvis now routes sensor/timeline approvals through the generic approval path, keeps the HUD rail compact and responsive, exposes Kokoro/OmniVoice voice dependency slots, reports preferred TTS and wake state, and passes the production live test with attention items for missing optional voice packages.

## Verified Commands

- `npm.cmd run build -w @jarvis/core` - passed
- `npm.cmd run build -w @jarvis/gateway` - passed
- `npm.cmd run build -w @jarvis/hud` - passed
- `npm.cmd test -w @jarvis/core` - 64 passed
- `npm.cmd test -w @jarvis/gateway` - 63 passed
- `npm.cmd run test:ui -w @jarvis/hud` - 21 passed, 1 mobile-only desktop-rail test skipped
- `scripts/jarvis-runtime.ps1 -Action Restart` - restarted Brain, Gateway, and Electron HUD
- `scripts/jarvis-runtime.ps1 -Action Status` - Brain, Gateway, Electron HUD, and Ollama online
- `scripts/jarvis-runtime.ps1 -Action LiveTest` - attention, all checks passed
- `scripts/jarvis-runtime.ps1 -Action Start` while running - focused existing HUD instead of opening a duplicate

## Runtime Live Test

Latest live test: `data/smoke/runtime-live-latest.json`

- Python Brain root: pass
- Gateway root: pass
- Gateway status: pass
- Live text chat: pass, response `Connected.`
- Runtime self-test: pass with status `attention`
- Electron heartbeat: pass

## Voice Readiness

- Whisper large-v3-turbo snapshot: downloaded, STT runtime staged until `transformers` and `torch` are installed.
- SAPI: runnable fallback.
- Jarvis MP3 identity samples: runnable sample fallback.
- Kokoro-82M: wired as preferred neural TTS after download/probe.
- Piper: still supported as local TTS.
- OmniVoice: optional advanced voice slot, staged until explicit probe.
- Wake state: `push-to-talk` until wake dependency and owner approval are present.

## Needed Feature Downloads

These are feature dependencies, not future scaling models:

- `hexgrad/Kokoro-82M` to `models/huggingface/snapshots/hexgrad__Kokoro-82M`
- Piper executable and at least one voice
- Wake-word profile/tooling
- Optional `k2-fsa/OmniVoice` to `models/huggingface/snapshots/k2-fsa__OmniVoice`
- Optional Vosk fallback model
- Vision/OCR/media/maps/device connector dependencies already listed by `/api/setup/needed-feature-downloads`

Use `HF_TOKEN` from the environment or Jarvis vault. Do not paste tokens into commands, logs, or source files.

## Notes

The Codex in-app Browser plugin could not initialize its local runtime assets in this environment, so rendered verification was performed with the HUD Playwright suite and runtime Electron heartbeat instead.
