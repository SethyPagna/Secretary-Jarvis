# Architecture Hardening Verification

Phase 22 verified the local architecture, startup/background readiness, high-trust authority notes, and HUD summaries.

## Verified Commands

- `npm.cmd run build -w @jarvis/gateway`
  - Result: passed.
- `npm.cmd test --workspace @jarvis/gateway`
  - Result: passed, 21 test files and 39 tests.
- `npm.cmd run build -w @jarvis/hud`
  - Result: passed.
  - Note: Vite still reports the known large renderer bundle warning. This is tracked as a future code-splitting/code-health item, not a build failure.
- `npm.cmd run test:ui -w @jarvis/hud`
  - Result: passed, 16 Playwright tests across desktop and mobile Chromium.
- `npm.cmd run smoke:runtime -- -SkipBuild`
  - Result: passed.
  - Checked Python Brain, Gateway status, Gateway voice readiness, Gateway vision readiness, and HUD renderer.
  - Latest summary path: `data/smoke/runtime-smoke-latest.json`.

## Verified Behavior

- `GET /api/architecture/map` reports language boundaries, subsystem ownership, hardening notes, and optimization backlog.
- `GET /api/architecture/code-health` reports advisory cleanup signals without deleting or changing files.
- `GET /api/runtime/startup-readiness` reports scripts, Windows startup registration state, PID files, and elevated startup intent without registering tasks or elevating.
- `GET /api/security/authority-readiness` reports high-trust mode, approval-gated categories, blocked protected-core access, and undo/approval guardrails.
- HUD Settings now surfaces Stack, Startup, Authority, and Code Health as compact collapsed cards.
- Mobile HUD Settings does not horizontally overflow.

## Remaining Optimization Backlog

- Split oversized gateway routes once endpoint coverage remains stable.
- Add HUD renderer code splitting to reduce the large bundle warning.
- Consolidate repeated compact-card CSS classes.
- Prefer packaged startup commands over dev-process startup for daily use once packaging is complete.
