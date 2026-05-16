# Packaging And Startup Readiness Verification

Date: 2026-05-16

Phase: 25.3

## Checks Run

```powershell
npm.cmd run test -w @jarvis/gateway
npm.cmd run build -w @jarvis/gateway
npm.cmd run build -w @jarvis/hud
npm.cmd run test:ui -w @jarvis/hud
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\register-startup-task.ps1 -CheckOnly
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start-jarvis.ps1 -CheckOnly
npm.cmd run smoke:runtime -- -SkipBuild
```

## Result

- Gateway tests: passed, 28 files and 46 tests.
- Gateway build: passed.
- HUD build: passed.
- HUD UI tests: passed, 16 tests across desktop and mobile Chromium.
- Startup registration check-only: passed and previewed the standard limited startup task without changing Windows.
- Startup check-only: passed and previewed Brain, Gateway, Dashboard, HUD renderer, and Electron HUD startup commands.
- Runtime smoke: passed for Python Brain, TypeScript Gateway, and HUD renderer.

## Notes

- `scripts\start-jarvis.ps1 -CheckOnly` reported that Ollama is not on `PATH`. Jarvis still keeps Ollama optional at startup, and local LLM calls will need Ollama opened, installed on `PATH`, or configured through another runtime adapter.
- Runtime smoke used isolated smoke ports: Brain `5100`, Gateway `5317`, HUD renderer `5176`.
- The packaging readiness endpoint is read-only and never installs, registers startup, or elevates privileges by itself.
- HUD Settings now provides compact dry-run controls for runtime start, stop, restart, and emergency stop. These create approval-gated previews before any real service control path is used.
