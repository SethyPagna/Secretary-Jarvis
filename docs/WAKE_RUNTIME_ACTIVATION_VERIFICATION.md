# Wake And Runtime Activation Verification

Date: 2026-05-16

Phase: 26.4

## Checks Run

```powershell
npm.cmd run test
npm.cmd run build -w @jarvis/gateway
npm.cmd run build -w @jarvis/hud
npm.cmd run test:ui -w @jarvis/hud
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\register-startup-task.ps1 -CheckOnly
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start-jarvis.ps1 -CheckOnly
npm.cmd run smoke:runtime -- -SkipBuild
```

## Result

- Core tests: passed, 9 files and 63 tests.
- Gateway tests: passed, 29 files and 48 tests.
- Gateway build: passed.
- HUD build: passed.
- HUD UI tests: passed, 16 tests across desktop and mobile Chromium.
- Startup registration check-only: passed and previewed the standard limited startup task without changing Windows.
- Startup check-only: passed and previewed Brain, Gateway, Dashboard, HUD renderer, and Electron HUD startup commands.
- Runtime smoke: passed for Python Brain, TypeScript Gateway, and HUD renderer.

## Notes

- Startup check-only still reports `Ollama is not on PATH`. This is not treated as a Jarvis failure because Ollama can be repaired through the new activation readiness guidance or replaced by another local runtime adapter.
- The new `/api/runtime/activation-readiness` endpoint is read-only. It does not enable continuous microphone capture, mutate `PATH`, install tools, or start model runtimes.
- HUD Voice now shows wake readiness separately from STT/TTS readiness.
- HUD Settings now shows wake/runtime activation with compact repair guidance hidden behind a drawer.
