# Interaction Health Verification

Verified on 2026-05-16 for Phase 29.5.

## Checks

| Check | Result | Notes |
| --- | --- | --- |
| `npm.cmd run test` | Passed | Core: 9 files / 64 tests. Gateway: 32 files / 55 tests. |
| `npm.cmd run build -w @jarvis/gateway` | Passed | Gateway TypeScript compiles. |
| `npm.cmd run build -w @jarvis/hud` | Passed | HUD and Electron TypeScript compile; Vite build passes with the known large-chunk advisory. |
| `npm.cmd run test:ui -w @jarvis/hud` | Passed | 18 Playwright tests across desktop and mobile. |
| `scripts/register-startup-task.ps1 -CheckOnly` | Passed | Shows the standard Windows startup task command without changing startup. |
| `scripts/start-jarvis.ps1 -CheckOnly` | Passed with advisory | Startup order is valid. Advisory: Ollama is not on PATH. |
| `npm.cmd run smoke:runtime -- -SkipBuild` | Passed | Brain, Gateway, voice readiness, vision readiness, and HUD renderer came online during smoke. |

## Covered Behavior

- `/api/runtime/interaction-health` reports text, voice, workflow generation, workflow execution, editing, undo, approvals, and emergency stop readiness.
- HUD Settings shows compact `Interaction health` and `Interaction response pressure` strips.
- Workflow console saves generated automations as disabled drafts.
- Disabled generated workflows show `Approval needed` and cannot be queued from the HUD.
- Workflow detail shows Jarvis as manager and Sentinel as reviewer.

## Notes

Ollama remains the active setup advisory from startup check-only. Use the HUD `Ollama PATH` runtime adapter repair dry-run or open Ollama manually before expecting local Ollama calls.

The large HUD chunk warning is a performance optimization note. The current HUD build remains functional; further manual chunking can be handled in a later code-health phase.
