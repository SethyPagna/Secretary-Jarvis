# Runtime Self-Test Verification

Verified for Phase 32 on 2026-05-16.

## Passed

- `npm.cmd run test`
  - Core: 9 files, 64 tests passed.
  - Gateway: 34 files, 57 tests passed.
- `npm.cmd run build -w @jarvis/gateway`
  - TypeScript build passed.
- `npm.cmd run build -w @jarvis/hud`
  - HUD TypeScript, Vite, and Electron TypeScript builds passed.
  - Renderer chunk remains compact at about 41 KB, with Three.js isolated in the lazy orb path.
- `npm.cmd run test:ui -w @jarvis/hud`
  - 18 Playwright tests passed across desktop and mobile Chromium.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\register-startup-task.ps1 -CheckOnly`
  - Startup task registration preview passed without registering anything.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start-jarvis.ps1 -CheckOnly`
  - Runtime start preview passed without launching persistent services.
- `npm.cmd run smoke:runtime -- -SkipBuild`
  - Python Brain, TypeScript Gateway, and HUD renderer smoke passed.

## Remaining Advisory

`scripts\start-jarvis.ps1 -CheckOnly` reports that Ollama is not on PATH. This is intentionally handled by Phase 32:

- `/api/runtime/self-test` marks model adapters as attention when Ollama is found off PATH.
- HUD Settings shows `Ollama PATH` as a compact fix.
- The fix calls `/api/runtime/adapter-repair/dry-run`.
- No PATH mutation happens until the owner approves the repair action.
