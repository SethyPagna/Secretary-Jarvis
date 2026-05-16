# App-Mode Runtime Verification

Verified for Phase 34 on 2026-05-17.

## Passed

- `npm.cmd run build -w @jarvis/gateway`
- `npm.cmd run build -w @jarvis/hud`
- `npm.cmd run test`
- `npm.cmd run test:ui -w @jarvis/hud`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start-jarvis.ps1 -CheckOnly`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\stop-jarvis.ps1 -CheckOnly -KeepOllama`
- `npm.cmd run smoke:runtime -- -SkipBuild`
- actual app-mode start through `scripts\jarvis-control.ps1 -Action Start`

## Smoke Coverage Added

Runtime smoke now verifies:
- Python Brain `/health`
- Python Brain `/`
- Gateway `/`
- Gateway `/api/status`
- Gateway `/api/voice/readiness`
- Gateway `/api/vision/readiness`
- Gateway `POST /api/chat`
- Gateway task completion and assistant result
- HUD browser-preview renderer readiness for test coverage

## App-Mode Launcher

`scripts\start-jarvis.ps1` now starts the Electron HUD in app mode by default:

```powershell
set JARVIS_HUD_MODE=app
npm.cmd run start -w @jarvis/hud
```

The HUD loads the built local renderer from `apps\hud\dist\index.html`; it does not require opening the browser preview server.

## Live App-Mode Check

After a clean restart:

- `http://127.0.0.1:4317/` returned `service: jarvis-gateway`.
- `http://127.0.0.1:5000/` returned `service: jarvis-python-brain` with `buildId: brain-capabilities-v3`.
- `POST http://127.0.0.1:4317/api/chat` completed a task with result `Connected.`
- Runtime PID files were present for Python Brain, TypeScript Gateway, Electron HUD, and Ollama.

The stop script now also clears stale Brain/Gateway process matches and local port owners, so a restart does not silently reuse old runtime processes.
