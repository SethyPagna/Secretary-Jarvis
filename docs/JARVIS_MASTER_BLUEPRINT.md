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
| Internal Python backend package | Done | Historical package path remains `jarvis_cli` during migration |
| Standalone CLI removal from package surface | Done | Desktop backend entrypoint replaces `jarvis` console script |
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
| Desktop-first backend priority | Done | Autoconfig prefers llama.cpp, then vLLM, then Ollama |
| Electron desktop shell | Done | Starts hidden backend child process, frameless window, preload IPC bridge, and `/api/shutdown` close path |
| Desktop backend startup preflight | Done | `jarvis-desktop-backend --preflight` and Electron/smoke scripts fail fast with missing dependency/port diagnostics before waiting on `/api/status` |
| Desktop backend dependency contract | Done | FastAPI/Uvicorn are core deps; embedded startup disables lazy installs and fails fast when deps are missing |
| Desktop shutdown token | Done | Electron and package smoke use `X-Jarvis-Desktop-Shutdown-Token`; shutdown stays protected from generic unauthenticated API calls |
| Optional close-to-tray lifecycle | Done | Default window close still runs full shutdown; `JARVIS_MINIMIZE_TO_TRAY=1` hides to tray and tray Quit runs the same shutdown path |
| Desktop Python dependency gate | Done | Build script checks backend modules plus PyInstaller first and prints online/offline wheelhouse recovery commands before packaging starts |
| Packaged backend smoke gate | In progress | `scripts/smoke-desktop-backend.ps1` is wired into `scripts/build-desktop.ps1`; live run currently blocked by local PyPI connectivity |
| React home page/orb UI | In progress | Unified Home route, title bar, orb, stats panel, voice controls, and terminal input shell build successfully |
| Home quick actions | Done | Voice, Quick Task, Attach, Tools, Mute, and Stats controls now mutate UI state or dispatch into the embedded terminal instead of being placeholders |
| Home browser voice bridge | Done | Microphone uses MediaRecorder, posts raw audio to `/api/voice/transcribe`, dispatches transcript into embedded PTY, and can synthesize live terminal output through `/api/voice/synthesize` |
| Title bar notification drawer | Done | Bell button opens/closes a desktop notification drawer with backend/gateway alert placeholder state |
| Home terminal live PTY handoff | Done | Non-status Home commands navigate into the live `/api/pty` chat terminal with a prefilled command instead of a placeholder |
| Embedded Home xterm | Done | Home mounts the xterm-backed `ChatPage` directly with sidebar/plugin chrome disabled and no hidden inactive PTY sessions |
| Frontend dependency rebrand guard | Done | Lockfile preserves canonical third-party `hermes-parser`/`hermes-estree` package names so ESLint can start |
| Models page | Not started | Planned phase 4 |
| Souls and voices page | Not started | Planned phase 5 |
| Permissions/platforms/workflows/settings | Not started | Planned phases 6-8 |
| Packaging/installers | In progress | PyInstaller spec and desktop build script are tracked; installer validation is still pending |

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
10. Desktop close path calls `/api/shutdown` with the desktop shutdown token, then terminates child processes within a fixed timeout.
11. Packaged backend smoke starts the PyInstaller backend hidden, verifies `/api/status`, calls `/api/shutdown` with the desktop shutdown token, and stops the child process before electron-builder packages the installer.
12. Desktop backend preflight must pass before Electron or packaging smoke waits for `/api/status`.
13. Close-to-tray must be opt-in only; tray Quit must call the same shutdown path as a normal close so no backend child remains idle in the background.
14. Home voice capture must use browser MediaRecorder audio, not a permission-only probe.
15. Home voice output must use the same live terminal response stream and configured TTS endpoint, not a separate canned response path.

Performance targets:

| Runtime | Minimum target | Preferred target |
| --- | --- | --- |
| llama.cpp local chat | 20 tokens/sec | 35+ tokens/sec |
| vLLM local serving | 60 tokens/sec | 80+ tokens/sec |
| Ollama fallback chat | 15 tokens/sec | 25+ tokens/sec |
| Cloud chat | 60 tokens/sec observed stream | 120+ tokens/sec where provider supports it |
| TTS first audio | Under 1500 ms | Under 700 ms |
| STT short utterance | Under realtime | 0.5x realtime or faster |
| Stats stream | 1 Hz stable | 1-2 Hz with no UI jank |

## Part 1 - Fork and Comprehensive Rebrand

Goals:

- Fork `NousResearch/hermes-agent` to `SethyPagna/Secretary-Jarvis`.
- Work on `jarvis-remake`.
- Rename user-facing product from Hermes to JARVIS.
- Remove standalone CLI as a user-facing product surface.
- Keep the historical `jarvis_cli` Python package only as an internal backend namespace until a later low-risk module migration.
- Expose `jarvis-desktop-backend` for Electron/PyInstaller child-process startup.
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
| TTS | Kokoro local, OmniVoice local voice simulation, system fallback |
| STT | faster-whisper, whisper.cpp, OpenAI Whisper API fallback |
| Models | llama.cpp default, vLLM throughput tier, Ollama fallback, OpenAI, Anthropic, Gemini, Groq, Together as API-key providers |
| Packaging | PyInstaller, electron-builder |

Process model:

- Electron owns the visible application process.
- Python FastAPI backend runs as a child process.
- Backend provides HTTP, PTY websocket, stats websocket, runtime readiness, and shutdown APIs.
- Clean shutdown always persists state before Electron terminates the backend.
- The integrated Home terminal replaces the standalone CLI; commands and natural-language tasks are routed through desktop IPC/API and PTY websockets.

Implemented shell files:

- `electron/main.js` starts `jarvis_cli.desktop_entry` in development or the packaged `dist/jarvis-backend` resource in production.
- `electron/main.js` creates a frameless, offline-capable desktop window and loads `JARVIS_RENDERER_URL`, built web assets, or the backend web surface.
- `electron/main.js` calls `/api/shutdown` before sending `SIGTERM`, with `SIGKILL` as the fixed-timeout fallback.
- `electron/preload.js` exposes only `jarvisDesktop.getBackendStatus()` and `jarvisDesktop.windowControl(...)` to the renderer.
- `package.json` declares the Electron 33+ app entrypoint, electron-builder resources, and desktop packaging scripts.
- The title bar owns desktop sidebar minimization: the sidebar collapses to an icon rail on desktop and opens as a drawer on small screens.

Verification:

- `python -m unittest tests.jarvis_cli.test_electron_shell_contract`
- `node --check electron/main.js`
- `node --check electron/preload.js`

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
- Terminal commands must reach the live PTY path. Home embeds the resizable
  xterm surface directly and passes non-status commands into the PTY as initial
  input.
- Terminal must preserve history in `~/.jarvis/history`.

## Part 4 - Models Page

The Models page manages:

- Local backends in priority order: llama.cpp first, vLLM second, Ollama last.
- API-key providers: OpenAI, Anthropic, Gemini, Groq, Together AI.
- Custom OpenAI-compatible endpoints.
- GGUF, safetensors, ONNX, and registry-managed models.
- Download queue with pause, resume, cancel, ETA, and checksum verification.
- Active model hot-swap through config and backend reload.
- OpenAI, Anthropic, and similar providers are editable on the Models page only after the user supplies API keys.

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
- OmniVoice local voice simulation from reference samples
- system TTS
- custom OpenAI-compatible TTS

Voice asset locations:

- `assets/voices`
- `assets/voice`
- `vendor/voices`
- `vendor/voice`
- `models/hexgrad__Kokoro-82M/voices`
- `models/k2-fsa__OmniVoice`

Fallback chain:

- TTS: Kokoro -> OmniVoice -> system

STT engines:

- faster-whisper
- whisper.cpp
- OpenAI Whisper API

Fallback chain:

- STT: faster-whisper -> whisper.cpp -> OpenAI Whisper API

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
- optional Ollama service on 11434, retained as the last local fallback after llama.cpp and vLLM
- UI service on 3000
- Docker and WSL must not use fixed CPU or memory caps in this repo. Docker Desktop/WSL dynamic resource management should be allowed to borrow resources when inference needs them and return idle resources to Windows.

Production packaging:

1. PyInstaller bundles `jarvis_cli/desktop_entry.py` as `jarvis-backend`.
2. Vite builds the React frontend.
3. electron-builder packages Electron, frontend assets, and backend binary.

Packaging rules:

- `scripts/build-desktop.ps1` is the Windows build entrypoint.
- `packaging/jarvis-backend.spec` is the backend PyInstaller spec.
- The packaged app launches the backend from Electron resources with hidden child windows.
- The user-facing process should be a single JARVIS desktop app entry. Backend/model children are owned by the app lifecycle and terminated during `/api/shutdown`.

Targets:

- Windows NSIS installer
- macOS DMG
- Linux AppImage

## Part 11 - Roadmap

Phase 1: foundation and rebrand.

Phase 2: core agent extensions:

- Codex desktop/backend tool
- stats websocket
- shutdown API
- psutil monitoring
- gateway status API
- LLM/TTS/STT runtime smoke tests

Phase 3: Electron shell and Home page:

- Electron shell lifecycle: done.
- React Home route, orb, stats consumer, title bar, terminal input shell, embedded PTY, voice capture, and TTS playback bridge: in progress.
- Remaining Home voice hardening: parse explicit assistant message boundaries from PTY events before claiming polished end-to-end voice response playback.

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
| POST | `/api/voice/transcribe` | Accept raw browser microphone audio and run configured STT |
| POST | `/api/voice/synthesize` | Return browser-playable TTS audio for assistant output |

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

The next product slice is packaging plus the React Home page inside the Electron shell:

- finish a successful local package smoke once PyPI connectivity is restored or a local wheel cache is available
- run PyInstaller through `scripts/build-desktop.ps1` with the new smoke gate enabled
- run electron-builder packaging after the backend smoke passes
- install/restore FastAPI, Uvicorn, Pydantic, and PyInstaller in this Python environment or provide a local `wheelhouse/desktop`; current preflight and `scripts/check-desktop-python-deps.ps1` correctly report those modules missing
- verify `/api/voice/transcribe` and `/api/voice/synthesize` against the live embedded backend once FastAPI/Uvicorn are available again
- harden PTY assistant-output boundaries so TTS speaks only the assistant response, not terminal chrome
- preserve no standalone CLI entrypoints

The current runtime smoke test verifies "arms and legs" behavior:

- LLM probe sends a tiny prompt to the configured backend and measures latency/tokens per second.
- TTS probe synthesizes a short phrase and verifies non-empty audio bytes or a file.
- STT probe transcribes a known audio sample or reports the exact missing dependency/sample blocker.
- API returns `production_ready`, per-subsystem results, timings, throughput, and blockers.
- Tests must run without optional heavy dependencies by injecting fake probes.

Latest local smoke result from this workspace:

- LLM: ready with llama.cpp on `127.0.0.1:8081` using `qwen3.5-9b-q4_k_m`; smoke returned `ready` in 259.49 ms.
- LLM retest after local voice changes: ready with llama.cpp on `127.0.0.1:8081`; smoke returned `ready` in 236.10 ms at 8.47 tokens/sec for the tiny two-token completion.
- TTS local fallback retest: ready with system TTS; produced a real 115328 byte WAV in 911.83 ms.
- STT retest: ready with local faster-whisper `tiny.en` on CPU/int8; transcribed `Jarvis runtime smoke ready.` in 2750.01 ms from the generated WAV.
- Production readiness is true for the currently verified LLM plus system TTS plus local STT smoke path. Kokoro and OmniVoice assets are discovered, but their Python runtimes are not installed yet in this workspace.

Latest autoconfig result from this workspace:

- Preferred LLM order: llama.cpp with local Q4_K_M GGUF first, vLLM safetensors serving second, Ollama registered models last.
- Current live LLM smoke: llama.cpp is active on `8081`; autoconfig skipped occupied `8080` and reused the running OpenAI-compatible endpoint.
- Preferred TTS order: Kokoro local assets first, then OmniVoice local voice simulation, then system TTS. Edge was only a temporary smoke path and is no longer the product fallback.
- Current autoconfig TTS provider: system TTS, because Kokoro assets are present but `kokoro-onnx` is not installed. Target provider remains Kokoro once the runtime is installed; OmniVoice uses the downloaded `models/k2-fsa__OmniVoice` assets and local reference voices.
- Preferred STT target: faster-whisper local with `tiny.en`/CPU/int8 on CPU-only machines for instant startup; use `large-v3`/float16 when NVIDIA is present.
- STT dependency status: `faster-whisper==1.2.1` is installed. Non-interactive pip flags were required: `PIP_NO_INPUT=1` and `PIP_DISABLE_PIP_VERSION_CHECK=1`.
- STT model cache status: `Systran/faster-whisper-tiny.en` is downloaded. The Hugging Face Xet path stalled on larger model blobs, so first-run downloads should set `HF_HUB_DISABLE_XET=1`.
- Packaging status: Electron/web/Docker configuration checks pass, FastAPI/Uvicorn are now core packaged deps, and a packaged-backend smoke script is wired into the build. Local package installation is still blocked in this workspace: `Test-NetConnection pypi.org -Port 443` timed out and `pip install` hung without installing FastAPI/Uvicorn/PyInstaller, so the final backend binary and NSIS installer were not produced yet.
