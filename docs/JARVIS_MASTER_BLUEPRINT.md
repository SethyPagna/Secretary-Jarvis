# JARVIS Master Blueprint v2.0

Unified Home, Multi-Model, Multi-Voice, Multi-Platform Desktop Agent

This document is the working source of truth for the JARVIS remake. It turns
the product blueprint into implementation checkpoints that can be verified,
committed, and shipped incrementally on the `jarvis-remake` branch.

## Current Progress

Branch: `jarvis-remake`

Remote: `SethyPagna/Secretary-Jarvis`

Implemented checkpoints:

| Area | Status | Evidence |
| --- | --- | --- |
| Fork/rebrand foundation | Done | Commit `3a75408` |
| CLI package rename to `jarvis_cli` | Done | Commit `3a75408` |
| `jarvis` command entry point | Done | Commit `3a75408` |
| Default JARVIS SOUL template | Done | Commit `3a75408` |
| Runtime readiness checker for LLM/TTS/STT | Done | Commit `2f93e96` |
| `/api/runtime/readiness` | Done | Commit `2f93e96` |
| Desktop stats collector | Done | Commit `24d75b5` |
| `/api/stats` and `/ws/stats` | Done | Commit `24d75b5` |
| Graceful shutdown helper | Done | Commit `24d75b5` |
| `/api/shutdown` | Done | Commit `24d75b5` |
| Blueprint/progress documentation | Done | Commit `756cdb0` |
| LLM/TTS/STT smoke testing | Done | This checkpoint adds `/api/runtime/smoke-test` |
| Runtime autoconfig planner | Done | This checkpoint adds `/api/runtime/autoconfig` |
| Runtime autoconfig apply | Done | This checkpoint adds `/api/runtime/autoconfig/apply` |
| Fast local STT profile | Done | CPU machines use faster-whisper `tiny.en`/int8; NVIDIA machines target `large-v3` |
| Electron desktop shell | Not started | Planned phase 3 |
| React home page/orb UI | Not started | Planned phase 3 |
| Models page | Not started | Planned phase 4 |
| Souls and voices page | Not started | Planned phase 5 |
| Permissions/platforms/workflows/settings | Not started | Planned phases 6-8 |
| Packaging/installers | Not started | Planned phase 8 |

## Production Readiness Gates

JARVIS is not production ready until every gate below has automated evidence:

1. Active LLM is reachable and returns a non-empty response.
2. Local or cloud LLM reports latency and tokens/second.
3. TTS produces playable audio bytes or a saved audio file.
4. STT transcribes a known sample with a non-empty transcript.
5. Fallback chains are exercised when the primary TTS/STT backend is missing.
6. `/api/runtime/readiness` reports blockers without exposing secrets.
7. `/api/runtime/smoke-test` verifies actual runtime behavior, not only config.
8. `/api/stats` and `/ws/stats` stream CPU, RAM, GPU where available, token counters, skills, gateway connections, and uptime.
9. `/api/shutdown` persists a session shutdown snapshot and runs cleanup callbacks without blocking process exit.
10. Desktop close path calls `/api/shutdown`, then terminates child processes within a fixed timeout.

Performance targets:

| Runtime | Minimum target | Preferred target |
| --- | --- | --- |
| Local Ollama/llama.cpp chat | 20 tokens/sec | 35+ tokens/sec |
| vLLM local serving | 60 tokens/sec | 80+ tokens/sec |
| Cloud chat | 60 tokens/sec observed stream | 120+ tokens/sec where provider supports it |
| TTS first audio | Under 1500 ms | Under 700 ms |
| STT short utterance | Under realtime | 0.5x realtime or faster |
| Stats stream | 1 Hz stable | 1-2 Hz with no UI jank |

## Part 1 - Fork and Comprehensive Rebrand

Goals:

- Fork `NousResearch/hermes-agent` to `SethyPagna/Secretary-Jarvis`.
- Work on `jarvis-remake`.
- Rename user-facing product from Hermes to JARVIS.
- Rename CLI command from `hermes` to `jarvis`.
- Rename Python package from `hermes_cli` to `jarvis_cli`.
- Move local config/data from `~/.hermes` to `~/.jarvis`.
- Preserve backward-compatible context fallbacks for `HERMES.md` and `AGENTS.md`.

Required files:

- `scripts/rebrand.py`
- `jarvis_cli/data/default_SOUL.md`
- `jarvis_cli/jarvis_constants.py`
- `scripts/install.sh`
- `pyproject.toml`
- `README.md`

Verification:

- `python -m unittest tests.jarvis_cli.test_jarvis_rebrand_contract`
- `python -m py_compile jarvis_constants.py jarvis_cli/__init__.py scripts/rebrand.py`

## Part 2 - Desktop Application Architecture

Technology stack:

| Layer | Technology |
| --- | --- |
| Desktop shell | Electron 33+ |
| Frontend | React 19, Vite 6, TypeScript |
| UI | shadcn/ui, Tailwind CSS 4 |
| 3D/animation | Three.js, React Three Fiber |
| Terminal | xterm.js 5, node-pty |
| Workflow editor | React Flow 12 |
| Backend | Python 3.12, FastAPI |
| TTS | Kokoro local, ElevenLabs, OpenAI, system fallback |
| STT | faster-whisper, whisper.cpp, OpenAI/Groq fallback |
| Models | llama.cpp, Ollama, vLLM, OpenAI, Anthropic, Gemini, Groq, Together |
| Packaging | PyInstaller, electron-builder |

Process model:

- Electron owns the visible application process.
- Python FastAPI backend runs as a child process.
- Backend provides HTTP, PTY websocket, stats websocket, runtime readiness, and shutdown APIs.
- Clean shutdown always persists state before Electron terminates the backend.

## Part 3 - Home Page

The Home page is the unified dashboard:

- 3D orb with idle, listening, thinking, speaking, executing, error, and offline states.
- Real-time stats panel powered by `/ws/stats`.
- Integrated terminal/chat panel powered by PTY websocket.
- Voice input and output controls.
- Quick actions for voice, task, attachments, tools, mute, and stats.
- Notification drawer for gateway messages, cron results, model events, and errors.

Production requirements:

- Orb frame rate targets 60 FPS on integrated graphics.
- Particle count must auto-scale.
- Voice controls must use real STT/TTS smoke-test results before showing ready.
- Terminal must preserve history in `~/.jarvis/history`.

## Part 4 - Models Page

The Models page manages:

- Local backends: Ollama, llama.cpp, vLLM.
- Cloud providers: OpenAI, Anthropic, Gemini, Groq, Together AI.
- Custom OpenAI-compatible endpoints.
- GGUF, safetensors, ONNX, and registry-managed models.
- Download queue with pause, resume, cancel, ETA, and checksum verification.
- Active model hot-swap through config and backend reload.

Required backend APIs:

- `GET /api/models`
- `POST /api/models/download`
- `GET /api/models/download/{id}`
- `POST /api/models/switch`
- `POST /api/runtime/smoke-test`

## Part 5 - Souls and Voices

Each Soul combines:

- `SOUL.md`
- voice config
- STT config
- wake word settings
- optional memory seed

Voice engines:

- Kokoro local ONNX
- ElevenLabs cloud
- OpenAI TTS
- system TTS
- custom OpenAI-compatible TTS

STT engines:

- faster-whisper
- whisper.cpp
- OpenAI Whisper API
- Groq Whisper

Production requirements:

- Test voice must create playable audio.
- Test mic must return a transcript.
- Fallback chain must be visible and executable.
- Soul switch must hot-swap identity and voice without app restart.

## Part 6 - Permissions

The Permissions page controls:

- terminal execution
- filesystem access
- web search
- browser automation
- Codex sandbox execution
- unrestricted code execution
- arbitrary outbound network
- gateway-specific permission profiles

Filesystem rules:

- allowlist and denylist model
- denylist wins over allowlist
- sensitive defaults include `~/.ssh`, `~/.gnupg`, `/etc`, `/System`, and credential files

## Part 7 - Platforms

The Platforms page manages:

- Telegram
- Discord
- WhatsApp
- Slack
- Signal
- Email
- Matrix
- iMessage
- Webhook
- LINE

Gateway requirements:

- status API for platform connection health
- setup wizards for Telegram, Discord, and WhatsApp
- recent message preview
- gateway restart and log actions
- encrypted credential storage in `~/.jarvis/.env`

## Part 8 - Workflow Page

The Workflow page provides a React Flow canvas with:

- triggers: cron, webhook, voice command, email received, gateway message, manual
- actions: LLM, Codex, web search, file read/write, TTS, email send, HTTP request, skill, terminal
- logic: if, loop, wait, split, merge

Storage:

- workflows live in `~/.jarvis/workflows/*.yaml`
- export format is `.jarvis-flow`

Execution modes:

- manual foreground execution
- scheduled cron execution
- event-triggered execution

## Part 9 - Settings

Settings cover:

- startup behavior
- tray behavior
- theme and accent color
- font size and language
- data directory
- export/import data
- memory reset
- update channel
- about links

Themes:

- Dark
- Light
- Arc Reactor
- Retro Terminal
- High Contrast
- custom CSS variables in `~/.jarvis/themes/custom.css`

## Part 10 - Docker and Packaging

Development:

- `docker-compose.yml`
- backend service on 8765/8766/8767
- optional Ollama service on 11434
- UI service on 3000

Production packaging:

1. PyInstaller bundles `jarvis_cli/server_entry.py` as `jarvis-backend`.
2. Vite builds the React frontend.
3. electron-builder packages Electron, frontend assets, and backend binary.

Targets:

- Windows NSIS installer
- macOS DMG
- Linux AppImage

## Part 11 - Roadmap

Phase 1: foundation and rebrand.

Phase 2: core agent extensions:

- Codex CLI tool
- stats websocket
- shutdown API
- psutil monitoring
- gateway status API
- LLM/TTS/STT runtime smoke tests

Phase 3: Electron shell and Home page.

Phase 4: Models page.

Phase 5: Souls and Voices page.

Phase 6: Permissions and Platforms pages.

Phase 7: Workflow page.

Phase 8: Settings, packaging, polish, and cross-platform testing.

## Part 12 - API Reference

Implemented:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/status` | Agent status and gateway summary |
| GET | `/api/runtime/readiness` | LLM/TTS/STT readiness blockers and optimization hints |
| GET | `/api/stats` | One stats snapshot |
| WS | `/ws/stats` | Stats stream |
| POST | `/api/shutdown` | Graceful shutdown snapshot and cleanup |
| POST | `/api/runtime/smoke-test` | Verify active LLM/TTS/STT actually run |
| GET | `/api/runtime/autoconfig` | Discover local models/assets and return a config/action plan |
| POST | `/api/runtime/autoconfig/apply` | Merge the discovered runtime config patch into `config.yaml` |

Planned:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| WS | `/ws/pty` | Desktop PTY stream |
| POST | `/api/chat` | Chat message |
| GET | `/api/models` | List models |
| POST | `/api/models/download` | Start model download |
| POST | `/api/models/switch` | Switch active model |
| GET | `/api/souls` | List souls |
| GET | `/api/voices/tts` | List TTS engines and voices |
| GET | `/api/voices/stt` | List STT engines and models |
| GET | `/api/permissions` | Get permissions |
| PUT | `/api/permissions` | Update permissions |
| GET | `/api/platforms` | List platforms |
| POST | `/api/platforms/{platform}/connect` | Connect platform |
| GET | `/api/workflows` | List workflows |
| POST | `/api/workflows` | Save workflow |
| POST | `/api/workflows/{id}/run` | Run workflow |
| GET | `/api/settings` | Get settings |
| PUT | `/api/settings` | Update settings |

## Immediate Next Slice

The current runtime smoke test verifies "arms and legs" behavior:

- LLM probe sends a tiny prompt to the configured backend and measures latency/tokens per second.
- TTS probe synthesizes a short phrase and verifies non-empty audio bytes or a file.
- STT probe transcribes a known audio sample or reports the exact missing dependency/sample blocker.
- API returns `production_ready`, per-subsystem results, timings, throughput, and blockers.
- Tests must run without optional heavy dependencies by injecting fake probes.

Latest local smoke result from this workspace:

- LLM: ready with Ollama `qwen3:8b`; native Ollama smoke returned `ready` in 2896.78 ms at 12.35 tokens/sec.
- TTS: ready with Edge TTS; produced a real 16560 byte MP3 in 2761.08 ms. Kokoro assets are also present.
- STT: ready with local faster-whisper `tiny.en` on CPU/int8; transcribed `Jarvis runtime smoke ready.` in 3317.45 ms.
- Production readiness is true for the current configured LLM/TTS/STT smoke path.

Latest autoconfig result from this workspace:

- Preferred LLM: Ollama `qwen3:8b` when already registered, otherwise local Qwen Q4_K_M GGUF with `llama-server`.
- Preferred TTS now: Edge TTS because it is installed and verified.
- Preferred TTS target: Kokoro local once `kokoro-onnx` and `onnxruntime` are installed.
- Preferred STT target: faster-whisper local with `tiny.en`/CPU/int8 on CPU-only machines for instant startup; use `large-v3`/float16 when NVIDIA is present.
- STT dependency status: `faster-whisper==1.2.1` is installed. Non-interactive pip flags were required: `PIP_NO_INPUT=1` and `PIP_DISABLE_PIP_VERSION_CHECK=1`.
- STT model cache status: `Systran/faster-whisper-tiny.en` is downloaded. The Hugging Face Xet path stalled on larger model blobs, so first-run downloads should set `HF_HUB_DISABLE_XET=1`.
