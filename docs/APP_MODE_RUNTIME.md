# App-Mode Runtime

Phase 34 changes the default Jarvis launch path from browser-preview mode to app mode.

## What To Run

Daily use:

`Start Jarvis.cmd`

or:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\jarvis-control.ps1 -Action Start
```

This starts:
- Python Brain on `127.0.0.1:5000`
- TypeScript Gateway on `127.0.0.1:4317`
- Electron HUD as the actual app shell

The dashboard browser service is optional. Start it only when you want the deeper web fallback:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start-jarvis.ps1 -WithDashboard
```

Developer browser preview is also optional:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start-jarvis.ps1 -WebPreview
```

## Why `127.0.0.1:4317` And `127.0.0.1:5000` Exist

Those are local service endpoints, not the main app.

- `http://127.0.0.1:4317/` now identifies the Jarvis Gateway and points to `/api/chat`, `/api/status`, `/api/events`, and `/api/runtime/self-test`.
- `http://127.0.0.1:5000/` now identifies the Python Brain and points to health, model, voice, and vision endpoints.

The normal user interface is the Electron HUD, not either browser URL.

## Live Text Verification

Runtime smoke now does more than check ports. It:
- starts Brain
- starts Gateway
- checks both root service responses
- posts a real `/api/chat` message
- waits for the task to complete
- verifies the HUD renderer still works for browser-preview testing

Command:

```powershell
npm.cmd run smoke:runtime -- -SkipBuild
```

## Stop

Friendly stop:

`Stop Jarvis.cmd`

This keeps Ollama running by default. Use the lower-level stop script only when you also want Ollama stopped.
