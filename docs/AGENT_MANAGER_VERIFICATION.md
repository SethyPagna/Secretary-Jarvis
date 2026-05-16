# Agent Manager Verification

Verified on 2026-05-16 for Phase 28.5.

## What Was Checked

| Check | Result | Notes |
| --- | --- | --- |
| `npm.cmd run test` | Passed | Core: 9 files / 64 tests. Gateway: 31 files / 53 tests. |
| `npm.cmd run build -w @jarvis/gateway` | Passed | TypeScript gateway compiles. |
| `npm.cmd run build -w @jarvis/hud` | Passed | HUD/Electron TypeScript and Vite build pass. Vite still reports the existing large main chunk advisory. |
| `npm.cmd run test:ui -w @jarvis/hud` | Passed | 16 Playwright HUD tests across desktop and mobile. |
| `scripts/register-startup-task.ps1 -CheckOnly` | Passed | Shows the standard Windows startup task command without registering it. |
| `scripts/start-jarvis.ps1 -CheckOnly` | Passed with advisory | Startup order is valid. Advisory: Ollama is not on PATH. |
| `npm.cmd run smoke:runtime -- -SkipBuild` | Passed | Brain, Gateway, voice readiness, vision readiness, and HUD renderer came online during smoke. |

## Agent Manager Coverage

- The gateway has `/api/agents/manager-readiness`.
- HUD Settings now shows a compact `Manager` hardening card plus `Agent manager readiness` and `Agent voice personalities` strips.
- UI tests mock the endpoint and verify manager online state, `8/8` voice coverage, low flow risk, and named soul voice chips.
- The endpoint reports workflow autonomy signals, including approval-gated steps and response backlog pressure.

## Runtime Notes

The smoke script starts temporary runtime services and writes `data/smoke/runtime-smoke-latest.json`. The summary file confirms all smoke checks passed. A later manual request to the smoke gateway port can fail if the smoke process has already shut down; use `scripts/start-jarvis.ps1` for a persistent local runtime.

Ollama remains the only active setup advisory from the check-only script. Use the HUD Settings runtime adapter repair dry-run for `Ollama PATH` or launch Ollama manually before expecting local Ollama model calls.
