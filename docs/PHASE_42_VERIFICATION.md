# Phase 42 Verification

## What Changed

- Added `/api/runtime/attention` and attention dry-runs so Jarvis can show concise next actions for voice, STT, TTS, wake, model, and feature dependency gaps.
- Added `scripts/setup-voice-runtime.ps1` with `Doctor`, `ShowCommands`, `ProbePythonVoiceDeps`, and `InstallPythonVoiceDeps` actions.
- Added a compact HUD Settings attention card with preview-only actions.
- Stabilized the desktop rail regression test by waiting for the loaded 3D orb before measuring rail expansion.

## Token Safety

The setup script and Gateway resolver only mention `HF_TOKEN` as an environment/vault source. They do not print, store, or commit token values. The previously pasted Hugging Face token should be rotated.

## Verification Run

- `npm.cmd test -w @jarvis/gateway` passed: 37 files, 64 tests.
- `npm.cmd run build -w @jarvis/gateway` passed.
- `npm.cmd run build -w @jarvis/hud` passed.
- `npm.cmd run test:ui -w @jarvis/hud` passed: 21 passed, 1 skipped.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\setup-voice-runtime.ps1 -Action Doctor` passed.
- `scripts\jarvis-runtime.ps1 -Action Restart` completed.
- `scripts\jarvis-runtime.ps1 -Action Status` reported Python Brain, Gateway, Electron HUD, and Ollama online.
- `scripts\jarvis-runtime.ps1 -Action LiveTest` passed all checks with top status `attention`.
- `GET /api/runtime/attention` returned priority items for Whisper Python packages, Kokoro, Piper, OmniVoice, wake-word, and VAD.

## Current Attention Items

- Python voice packages are missing: `transformers`, `torch`, `accelerate`, `sentencepiece`, `soundfile`, `webrtcvad`, and `vosk`.
- Kokoro-82M, OmniVoice, Piper, Vosk, and wake-word folders are still missing.
- Gemma 4 26B remains incomplete while partial downloads/indexed shards are unresolved.

## Runtime State

Jarvis is running after verification. The production live test result is stored at `data/smoke/runtime-live-latest.json`.
