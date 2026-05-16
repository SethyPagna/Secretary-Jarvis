# Runtime Self-Test

Phase 32 adds a compact end-to-end readiness check for Jarvis. It is designed for the HUD Settings panel, not for raw logs.

## Endpoint

`GET /api/runtime/self-test`

The endpoint is read-only. It aggregates:
- wake and local model adapter activation
- agent manager and soul voice coverage
- workflow/interaction health
- background service visibility
- Windows startup readiness
- Electron HUD packaging readiness

## HUD Behavior

Settings shows a collapsed `Self-test` card with one status word:
- `ready`: all core runtime checks are usable
- `attention`: Jarvis is connected, but a fix is recommended
- `blocked`: an essential runtime path is unavailable
- `staged`: the path exists but is not fully activated

Expanding the card shows compact chips for Models, Voice, Agents, Workflow, Services, Startup, and Package. It also shows the top actionable fixes.

## Fix Mapping

Self-test fixes never mutate the laptop directly. They point to existing dry-run or approval-gated actions:

| Fix | Condition | Action |
| --- | --- | --- |
| Ollama PATH | Ollama is detected outside PATH | `POST /api/runtime/adapter-repair/dry-run` with `ollama-path` |
| Configure model adapter | Ollama is missing or only installer is detected | manual/setup guidance plus adapter dry-run |
| Wake word | wake assets are missing | `POST /api/runtime/adapter-repair/dry-run` with `hotword-enable` |
| Start runtime | one or more services are offline | `POST /api/runtime/control/dry-run` with `start` |
| Startup sync | Windows startup registration is not active | `GET /api/runtime/startup-registration-plans` |

## Safety Rules

- No PATH repair happens from self-test alone.
- No hotword or continuous microphone capture is enabled from self-test alone.
- No service process is started from self-test alone.
- No Windows startup task is registered from self-test alone.
- Risky fixes still require the normal approval flow.

The goal is a calm control surface: Jarvis can tell the owner what is connected and what needs attention without dumping every doctor check into the HUD.
