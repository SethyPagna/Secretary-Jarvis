# Startup And Approved-Admin Readiness Verification

Phase 24 verified the read-only startup, process visibility, and approved-admin planning layer.

## Verified Commands

- `npm.cmd run build -w @jarvis/gateway`
  - Result: passed.
- `npm.cmd test --workspace @jarvis/gateway`
  - Result: passed, 27 test files and 45 tests.
- `npm.cmd run build -w @jarvis/hud`
  - Result: passed.
  - Note: Vite still reports the known large main chunk warning. `WorkflowConsole` remains split into its own chunk.
- `npm.cmd run test:ui -w @jarvis/hud`
  - Result: passed, 16 Playwright tests across desktop and mobile Chromium.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\register-startup-task.ps1 -CheckOnly`
  - Result: passed.
  - Previewed limited run level startup registration only.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\register-startup-task.ps1 -CheckOnly -Elevated`
  - Result: passed.
  - Previewed highest run level startup registration only.
- `npm.cmd run smoke:runtime -- -SkipBuild`
  - Result: passed.
  - Checked Python Brain, Gateway status, Gateway voice readiness, Gateway vision readiness, and HUD renderer.

## Verified Behavior

- `GET /api/runtime/process-visibility` reports tracked Jarvis service PID files, expected Task Manager process names, alive status, and visibility grouping without inspecting memory or changing processes.
- `GET /api/runtime/startup-registration-plans` returns dry-run standard and approved-admin startup plans with command previews and rollback commands.
- HUD Settings shows process count, standard startup readiness, and approved-admin run level in a compact strip.
- Elevated startup remains a preview/approval concept. No scheduled task, shortcut, registry entry, or elevation change was created by these endpoints.
- Runtime smoke spawned and cleaned up temporary Brain/Gateway/HUD renderer processes; no verification process remained running afterward.
