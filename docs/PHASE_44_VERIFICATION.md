# Phase 44 Verification - Python 3.11 Voice Runtime And Resumable ML Setup

Date: 2026-05-18

## Summary

Phase 44 moved the Jarvis Brain voice runtime onto Python 3.11, made the voice dependency installer safer and resumable, and verified that Whisper STT, Kokoro TTS readiness, VAD, Porcupine wake dependency, and Vosk package detection are now live through the Gateway.

## Runtime Setup

- Local Brain venv: `services/brain/.venv`
- Python: `Python 3.11.9`
- Pip: bundled venv pip is usable.
- Preferred setup command now supports:
  - `-PythonVersion 3.11`
  - `-RecreateVenv`
  - `-PipGroupTimeoutSeconds`
  - `-PipUpgradeTimeoutSeconds`
  - `-PipIndexUrl`
  - `-TorchIndexUrl`
  - `-StrictInstall`
- Pip installs are supervised with direct process timeout/termination instead of PowerShell jobs, so installer timeouts do not leave hanging child processes.

## Voice Package Doctor

`scripts/setup-voice-runtime.ps1 -Action Doctor` reports ready:

- `transformers`
- `accelerate`
- `sentencepiece`
- `soundfile`
- `Pillow`
- `torch`
- `webrtcvad`
- `silero-vad`
- `pvporcupine`
- `vosk`

Downloaded/present:

- `hexgrad__Kokoro-82M`
- `k2-fsa__OmniVoice`

Still missing as optional feature folders/tools:

- `tools/piper`
- `models/vosk`
- `models/wake-word`

## Gateway/Brain Readiness

- `/api/voice/readiness`
  - Whisper large-v3-turbo: `ready`
  - Kokoro-82M: `ready`
  - Preferred TTS engine: `tts-kokoro-82m`
  - Windows SAPI fallback: `ready`
  - VAD: `ready`
  - Wake state: `wake-ready`
  - OmniVoice: `staged` until explicit advanced probe
  - Piper: `missing`
  - Vosk streaming model folder: `missing`
- `/api/voice/stt/probe`
  - `status`: `ready`
  - `runtimeReady`: `true`
  - `nextAction`: `Whisper STT runtime is ready.`
- Python Brain `/audio/status`
  - Transformers and Torch are installed.
  - Vosk package is installed.
  - Package-backed VAD is installed.

## Runtime Verification

- `scripts/jarvis-runtime.ps1 -Action Restart`: completed.
- `scripts/jarvis-runtime.ps1 -Action Status`: Brain, Gateway, Electron HUD, and Ollama online.
- `scripts/jarvis-runtime.ps1 -Action LiveTest`: all checks passed with status `attention`.
  - The remaining `attention` state is expected because optional/future features such as Piper, Vosk model folder, wake profile folder, media generation, map data, and some large model repairs are still not fully configured.

## Automated Checks

- `npm.cmd test`: passed.
  - `@jarvis/core`: 9 files, 64 tests passed.
  - `@jarvis/gateway`: 37 files, 64 tests passed.
- `npm.cmd run build`: passed for core, gateway, dashboard, HUD, and desktop.
- `npm.cmd run test:ui -w @jarvis/hud`: 21 passed, 1 intentionally skipped.

## Notes

- Hugging Face token values are still never printed, stored, or committed. The setup doctor only reports `HF_TOKEN` as set/not set.
- Continuous microphone wake remains approval-gated even though the Porcupine package is installed.
- Kokoro is now the preferred local neural TTS readiness path; real synthesis execution can be wired in the next voice implementation slice.
