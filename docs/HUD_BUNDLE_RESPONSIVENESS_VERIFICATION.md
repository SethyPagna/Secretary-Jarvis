# HUD Bundle Responsiveness Verification

Verified on 2026-05-16 for Phase 31.3.

## Checks

| Check | Result | Notes |
| --- | --- | --- |
| `npm.cmd run test` | Passed | Core: 9 files / 64 tests. Gateway: 33 files / 56 tests. |
| `npm.cmd run build -w @jarvis/gateway` | Passed | Gateway TypeScript compiles. |
| `npm.cmd run build -w @jarvis/hud` | Passed | No Vite large-chunk warning after manual chunking and lazy orb split. |
| `npm.cmd run test:ui -w @jarvis/hud` | Passed | 18 Playwright HUD tests across desktop and mobile. |
| `scripts/register-startup-task.ps1 -CheckOnly` | Passed | Shows startup task registration command without changing startup. |
| `scripts/start-jarvis.ps1 -CheckOnly` | Passed with advisory | Startup order is valid. Advisory: Ollama is not on PATH. |
| `npm.cmd run smoke:runtime -- -SkipBuild` | Passed | Brain, Gateway, voice readiness, vision readiness, and HUD renderer came online. |

## Build Outcome

The initial HUD renderer chunk is now about 39 KB. The 3D orb is a small lazy wrapper chunk, while React Three Fiber and Three.js are isolated into vendor chunks. A CSS fallback orb keeps the center presence visible while the 3D orb loads.

## Remaining Notes

Three.js remains a large vendor chunk by nature, but it is no longer part of the first renderer chunk. A future low-power mode can keep the CSS orb only when battery or startup speed matters more than WebGL.
