# HUD Command Capsule Verification

Phase 21 adds a compact command capsule so text and voice commands visibly queue and update without opening a verbose dashboard.

## Verified Commands

- `npm.cmd run build -w @jarvis/hud` - passed.
- `npm.cmd run test:ui -w @jarvis/hud` - passed with 14 Playwright checks.
- `npm.cmd run smoke:runtime -- -SkipBuild` - passed for Python Brain, TypeScript Gateway, and HUD renderer.

## Coverage

- Text commands route through `POST /api/chat` and close into a compact queued capsule.
- Voice transcript commit can also populate the capsule when a task is returned.
- The HUD subscribes to `GET /api/events` and updates the capsule from task stream events.
- The capsule uses short labels only: queued, running, done, needs review, cancelled.
- UI tests verify the capsule appears after text submission and the idle orb stays centered and clean.
