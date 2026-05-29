# JARVIS

JARVIS is a desktop-first AI agent: one home screen for chat, terminal work,
voice, local model control, live stats, permissions, platforms, workflows, and
settings.

The product direction is simple: the desktop app is the control surface. The
integrated terminal remains available inside the Home page, but the standalone
command-line program is no longer the primary user experience.

## What It Does

| Area | Capability |
| --- | --- |
| Unified Home | Orb state, live assistant stream, terminal panel, voice input, voice output, runtime stats, quick actions, notifications |
| Models | llama.cpp first, vLLM second, Ollama last, plus API-key providers configured from the Models page |
| Voice | Local Kokoro and OmniVoice-style voice simulation from bundled assets, system fallback, faster-whisper STT, whisper.cpp, and optional OpenAI Whisper API |
| Souls | Detailed identity and voice profiles that can hot-swap without restarting the app |
| Permissions | Tool toggles, filesystem boundaries, browser/network controls, and gateway-specific permission profiles |
| Platforms | Telegram, Discord, WhatsApp, Slack, Signal, Email, Matrix, iMessage, Webhook, and LINE through a single managed gateway |
| Workflow | React Flow automation canvas with triggers, actions, logic, execution status, and YAML storage |
| Packaging | Electron plus bundled Python backend, packaged as desktop installers with hidden child processes owned by the app lifecycle |

## Quick Run

On Windows, use the root launchers:

```powershell
.\setup-jarvis.cmd
.\run-jarvis.cmd
```

`run-jarvis.cmd` prefers the packaged desktop app at
`release\JARVIS 1.0.0.exe` when it exists. Otherwise it falls back to the
Electron development shell. It also enables minimize-to-tray and points the
backend at the sibling `models\` folder when that folder exists.

The packaged exe does not start Docker. Local AI runs through native helpers
owned by the desktop lifecycle: llama.cpp first, vLLM second when configured,
and Ollama only as a final user-configured fallback.

Useful launch switches:

```powershell
.\run-jarvis.cmd
.\run-jarvis.cmd -ModelsDir "C:\path\to\models"
.\run-jarvis.cmd -NoTray
.\run-jarvis.cmd -Dev
```

To run the automated readiness sweep:

```powershell
npm run desktop:check
```

To terminate everything JARVIS owns, including backend and local model helper
children:

```powershell
.\stop-jarvis.cmd
```

Close-to-tray keeps the app alive. `Quit JARVIS` from the tray menu, Alt+F4
when tray mode is disabled, or `stop-jarvis.cmd` performs full shutdown.

## Local Development

Backend development entrypoint:

```bash
jarvis-desktop-backend --host 127.0.0.1 --port 8765 --no-open
```

Desktop development entrypoint:

```bash
npm install
npm run desktop:dev
```

The Electron shell starts the backend as a hidden child process, opens the
frameless desktop window, and calls `/api/shutdown` before terminating backend
children. The local runtime manager starts native model helpers as child
processes and stops them before backend shutdown.

## Runtime Priorities

Local LLM priority:

1. llama.cpp
2. vLLM
3. Ollama

Voice priority:

1. Kokoro from local model/assets
2. OmniVoice-style local simulation from bundled reference voices
3. System TTS fallback
4. Custom OpenAI-compatible TTS endpoint when the user configures one

Speech-to-text priority:

1. faster-whisper with downloaded local models
2. whisper.cpp with local GGML/GGUF models
3. OpenAI Whisper API only when a user supplies an API key

## Production Gates

JARVIS is only ready to ship when automated checks prove:

- The active LLM returns a real non-empty response.
- Tokens per second, latency, and blockers are reported by runtime smoke tests.
- TTS produces playable audio through the same response path used by desktop chat.
- STT transcribes microphone audio into the Home input and dispatches it into the live terminal/chat stream.
- Stats are real process/system values, not placeholders.
- Window close, tray quit, and backend shutdown terminate all owned child processes.
- PyInstaller and electron-builder packaging produce a launchable portable desktop executable.

## Repository

Primary repository:

```bash
git clone https://github.com/SethyPagna/Secretary-Jarvis.git
cd Secretary-Jarvis
```

The desktop remake is now tracked on `main`.

## Verification

Focused checks used during the desktop remake:

```bash
python -m unittest tests.jarvis_cli.test_jarvis_rebrand_contract
python -m unittest tests.jarvis_cli.test_desktop_home_contract
python -m unittest tests.jarvis_cli.test_desktop_identity_contract
cd web && npm run build
```

Packaging checks also require FastAPI, Uvicorn, Pydantic, and PyInstaller to be
installed in the active Python environment or available from a local wheelhouse.

## License

MIT. See [LICENSE](LICENSE).
