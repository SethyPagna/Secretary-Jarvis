# Per-Agent Voice Verification

Verified on 2026-05-16 for Phase 30.5.

## Checks

| Check | Result | Notes |
| --- | --- | --- |
| `npm.cmd run test` | Passed | Core: 9 files / 64 tests. Gateway: 33 files / 56 tests. |
| `npm.cmd run build -w @jarvis/gateway` | Passed | Gateway TypeScript compiles. |
| `npm.cmd run build -w @jarvis/hud` | Passed | HUD/Electron TypeScript and Vite build pass. Known large-chunk advisory remains. |
| `npm.cmd run test:ui -w @jarvis/hud` | Passed | 18 Playwright HUD tests across desktop and mobile. |
| `scripts/register-startup-task.ps1 -CheckOnly` | Passed | Shows startup task registration command without changing startup. |
| `scripts/start-jarvis.ps1 -CheckOnly` | Passed with advisory | Startup order is valid. Advisory: Ollama is not on PATH. |
| `npm.cmd run smoke:runtime -- -SkipBuild` | Passed | Brain, Gateway, voice readiness, vision readiness, and HUD renderer came online. |

## Covered Behavior

- `/api/voice/agent-matrix` returns all eight named souls.
- Each soul has a distinct voice profile id.
- The HUD Voice panel shows compact voice chips for the agent matrix.
- Clicking a soul sends a local `/api/audio/tts` test request with `agentId`, `voiceProfileId`, and the soul's test phrase.
- Staged voices remain visible and testable as routing metadata while waiting for Piper/future clone assets.

## Notes

The current fallback path still depends on available local engines and samples. Piper voices or cloned local voices will improve the audible distinction without changing the matrix/HUD flow.
