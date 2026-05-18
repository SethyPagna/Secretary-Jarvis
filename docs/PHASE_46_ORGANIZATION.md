# Phase 46 Organization Report

Date: 2026-05-18

## Result

The outer `C:\Users\user\Downloads\Secretary Jarvis` folder has been organized without moving the active `models` tree. Jarvis model paths remain stable, so downloaded models and partial downloads continue to be detected automatically.

## New Outer Layout

- `jarvis\` - owned Jarvis monorepo.
- `models\` - stable local model assets. Not moved.
- `tools\installers\` - local installers such as Ollama and LM Studio.
- `vendor\reference\openclaw-ruflo-rust\` - OpenClaw, Ruflo, Cargo/Rust local reference/install assets.
- `vendor\reference\jarvis-opensource-bundles\` - community Jarvis reference bundles.
- `vendor\reference\workflow-engines\` - n8n, Activepieces, Kestra, and Node-RED references.
- `vendor\reference\archives\` - standalone reference archives such as `vllm-main.zip`.
- `docs\imported\` - imported standalone docs/pages.
- `assets\voice\` - voice identity samples.
- `voice` - compatibility junction to `assets\voice`.

## Applied Moves

- Moved `voice` to `assets\voice` and created a `voice` junction back to it.
- Moved `gateways, openclaw, ruflo, rust and cargo` to `vendor\reference\openclaw-ruflo-rust`.
- Moved `jarvis-opensource` to `vendor\reference\jarvis-opensource-bundles`.
- Moved `workflow integration` to `vendor\reference\workflow-engines`.
- Moved `LM-Studio-0.4.13-1-x64.exe` and `OllamaSetup.exe` to `tools\installers`.
- Moved `vllm-main.zip` to `vendor\reference\archives`.
- Moved `jarvis-ui.html` to `docs\imported`.

## Skipped

- `Building a Jarvis.docx` stayed in the outer root because Windows reported that the file is being used by another process. Rerun `scripts\organize-secretary-jarvis.ps1 -Apply` after closing Word to move it into `docs\imported`.
- `models` stayed in place by design.

## Readiness After Organization

- Whisper large-v3-turbo: ready STT.
- Kokoro-82M: ready and preferred local neural TTS route.
- Windows SAPI: ready fallback.
- VAD packages: ready.
- Jarvis voice samples: ready.
- Piper: still optional/missing under `tools\piper`.
- Vosk package: installed, but Vosk model folder still missing under `models\vosk`.
- Wake-word package: staged, but profile/config folder still missing under `models\wake-word`.
- Gemma 26B: folder is present and auto-connectable, but currently metadata-only until `model-00001-of-00002.safetensors` and `model-00002-of-00002.safetensors` are finished.

## Verification

- `scripts\setup-windows.ps1` finds organized installers and reference assets.
- `/api/models/assets/scan` still detects ready model assets and keeps Gemma 26B staged until weights are complete.
- `/api/voice/readiness` reports Whisper, Kokoro, SAPI, VAD, and voice samples as ready.
- `/api/runtime/attention` reports remaining optional dependencies as setup tasks, not runtime failures.
- `npm.cmd test` passed: core 64 tests and gateway 64 tests.
- `npm.cmd run build` passed for core, gateway, dashboard, HUD, and desktop.
- `npm.cmd run test:ui -w @jarvis/hud` passed: 21 tests, 1 skipped.
- `scripts\jarvis-runtime.ps1 -Action Status` reported Brain, Gateway, Electron HUD, and Ollama online.
- `scripts\jarvis-runtime.ps1 -Action LiveTest` passed with `attention` only for optional/future setup items.
