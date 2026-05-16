# Wake And Runtime Repair

Jarvis can run in the background today and wake through trusted foreground controls. Continuous hotword wake is intentionally separate because it requires always-on microphone capture.

## Reliable Wake Today

Use these without extra wake-word downloads:

- Windows tray icon: open the HUD while services stay in the background.
- Center orb: click or tap the orb to open radial controls.
- Text input: choose `Text Input` and send a command.
- Manual voice panel: choose `Voice Command` and start a controlled listening session.

These wake methods do not require continuous microphone capture.

## Staged Hotword Wake

Saying `Jarvis` becomes live only after all of these are true:

- A wake-word dependency is installed, such as Porcupine or a local Vosk wake profile.
- Package-backed VAD validates.
- STT validates through Whisper or Vosk fallback.
- The owner approves continuous microphone listening.
- Emergency stop remains available.

Until then, the HUD reports hotword wake as `staged` or `missing`, not broken.

## Ollama Runtime Repair

Jarvis can use Ollama when it is installed and reachable. The startup script may still report `Ollama is not on PATH` if Windows can open Ollama but command-line startup cannot find `ollama.exe`.

Check readiness:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:4317/api/runtime/activation-readiness
```

Manual checks:

```powershell
ollama --version
ollama list
```

Common install path:

```powershell
%LOCALAPPDATA%\Programs\Ollama\ollama.exe
```

If Ollama exists there but is not on `PATH`, add this folder to the user PATH after review:

```powershell
[Environment]::SetEnvironmentVariable(
  'Path',
  [Environment]::GetEnvironmentVariable('Path', 'User') + ';' + "$env:LOCALAPPDATA\Programs\Ollama",
  'User'
)
```

Open a new terminal afterward, then run:

```powershell
ollama --version
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start-jarvis.ps1 -CheckOnly
```

Jarvis does not change `PATH` by itself. The HUD only previews repair commands until you approve an action path.

## Other Local Runtime Adapters

Ollama is not the only path:

- LM Studio: OpenAI-compatible local endpoint, usually `http://127.0.0.1:1234/v1`.
- llama.cpp/GGUF: local executable or server path must be configured.
- vLLM/SGLang: LAN or homelab endpoint for larger models.
- Hugging Face local Transformers: uses downloaded snapshots and Python runtime packages.

Use the Model Hub to switch/pin models after the adapter is ready.

## Background Runtime Checklist

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start-jarvis.ps1 -CheckOnly
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\register-startup-task.ps1 -CheckOnly
npm.cmd run smoke:runtime -- -SkipBuild
```

If these pass, Jarvis can run in the background. If the HUD is not visible, check the tray icon first.
