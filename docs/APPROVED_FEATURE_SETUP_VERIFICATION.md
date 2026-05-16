# Approved Feature Setup Verification

Phase 18 verifies the safe setup path for missing feature dependencies. Jarvis can now list install plans, create approval-gated dry-runs, and show compact HUD setup cards without downloading or installing anything.

## Verified Commands

- `npm.cmd run build -w @jarvis/core` - passed.
- `npm.cmd run build -w @jarvis/gateway` - passed.
- `npm.cmd run build -w @jarvis/hud` - passed.
- `npm.cmd test` - passed with core 63 tests and gateway 32 tests.
- `npm.cmd run test:ui -w @jarvis/hud` - passed with 10 Playwright checks.
- `npm.cmd run smoke:runtime -- -SkipBuild` - passed for Python Brain, TypeScript Gateway, and HUD renderer.

## Coverage

- Feature setup plans stay separate from future scaling models.
- Install dry-runs create policy-reviewed action requests and do not execute installers.
- HUD settings show compact setup cards with details collapsed.
- Runtime smoke still starts Brain, Gateway, and HUD successfully after the setup-plan changes.
