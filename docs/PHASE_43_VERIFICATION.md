# Phase 43 Verification - Local Voice Runtime Environment

Date: 2026-05-18

## Summary

Phase 43 wired Jarvis to prefer the local Brain virtual environment for voice and vision runtime probes, added bounded voice dependency setup, and verified that the production app stack still starts and communicates end to end.

## Verification Results

- Local Brain venv exists at `services/brain/.venv`.
- `scripts/start-jarvis.ps1 -CheckOnly -NoHud -NoDashboard -SkipLiveProbe` now previews Brain and Gateway with `JARVIS_PYTHON=services/brain/.venv/Scripts/python.exe`.
- `scripts/setup-voice-runtime.ps1 -Action Doctor` reports the local venv Python and does not print or store Hugging Face token values.
- `scripts/setup-voice-runtime.ps1 -Action InstallPythonVoiceDeps -PipGroupTimeoutSeconds 20` returns structured `attention` output instead of hanging when PyPI/package installs exceed the timeout.
- `scripts/jarvis-runtime.ps1 -Action Restart` starts the production runtime stack.
- `scripts/jarvis-runtime.ps1 -Action Status` reports Brain, Gateway, Electron HUD, and Ollama online.
- `scripts/jarvis-runtime.ps1 -Action LiveTest` reports `attention` with all live checks passing:
  - Python Brain root: pass.
  - Gateway root: pass.
  - Gateway status: pass.
  - Live text chat: pass.
  - Runtime self-test: pass with attention.
  - Electron heartbeat: pass.

## Readiness Notes

- Whisper large-v3-turbo local snapshot is detected as a ready asset.
- Windows SAPI is currently the runnable TTS fallback.
- Jarvis voice MP3 identity samples are detected.
- Live STT remains attention-gated because `transformers` and `torch` are not installed in the venv yet.
- Kokoro-82M, OmniVoice, Piper, Vosk, VAD, and wake-word dependencies remain explicit setup items, not silently downloaded.
- The prior Hugging Face token policy remains enforced: use `HF_TOKEN` from the environment or the local vault; never paste tokens into commands, files, logs, or commits.

## Automated Checks

- `npm.cmd test`: passed.
  - `@jarvis/core`: 9 files, 64 tests passed.
  - `@jarvis/gateway`: 37 files, 64 tests passed.
- `npm.cmd run build`: passed for core, gateway, dashboard, HUD, and desktop.
- `npm.cmd run test:ui -w @jarvis/hud`: 21 passed, 1 intentionally skipped.
- Targeted Gateway tests for runtime attention, voice readiness, and vision readiness: passed.

## Remaining Attention

Jarvis is connected and stable, but voice runtime model execution still needs the Python packages and optional voice model folders to be installed when network/PyPI access is reliable:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\setup-voice-runtime.ps1 -Action InstallPythonVoiceDeps
```

If PyPI is slow or blocked, rerun with a trusted package index:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\setup-voice-runtime.ps1 -Action InstallPythonVoiceDeps -PipIndexUrl "<trusted-index-url>"
```
