# App-Mode Runtime Verification

Verified for Phase 34 on 2026-05-17.

## Passed

- `npm.cmd run build -w @jarvis/gateway`
- `npm.cmd run build -w @jarvis/hud`
- `npm.cmd run test`
- `npm.cmd run test:ui -w @jarvis/hud`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start-jarvis.ps1 -CheckOnly`
- `npm.cmd run smoke:runtime -- -SkipBuild`

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
