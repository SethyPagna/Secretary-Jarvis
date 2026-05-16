# Runtime Repair Dry-Run Verification

Date: 2026-05-16

Phase: 27.4

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
- Gateway tests: passed, 30 files and 51 tests.
- Gateway build: passed.
- HUD build: passed.
- HUD UI tests: passed, 16 tests across desktop and mobile Chromium.
- Startup registration check-only: passed and previewed the standard limited startup task without changing Windows.
- Startup check-only: passed and previewed Brain, Gateway, Dashboard, HUD renderer, and Electron HUD startup commands.
- Runtime smoke: passed for Python Brain, TypeScript Gateway, and HUD renderer.

## Notes

- `scripts\start-jarvis.ps1 -CheckOnly` still reports `Ollama is not on PATH`. This is now handled by the `ollama-path` runtime adapter repair dry-run and HUD approval flow.
- Runtime repair dry-runs create previews and approvals only. They do not mutate PATH, start apps, check endpoints, or enable microphone capture by themselves.
- HUD Settings keeps repair commands hidden until a specific dry-run button is clicked.
