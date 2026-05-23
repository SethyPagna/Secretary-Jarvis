# Docker Local Models

JARVIS can use Docker as the local runtime layer for LLM, STT, and TTS while the desktop app stays the control surface.

## Quick Start

Use the desktop app:

1. Open `Setup`.
2. In `Docker Local Models`, choose `Auto`.
3. Click `Start`.
4. Click `Apply`.

Use scripts:

```powershell
scripts\jarvis-docker-models.ps1 start -Profile auto
scripts\jarvis-docker-models.ps1 apply -Profile auto
```

`auto` prefers `llama.cpp` when a GGUF model exists, then `vLLM` when a safetensors model directory exists, then `Ollama`.

## What Docker Runs

- `jarvis-llamacpp`: OpenAI-compatible llama.cpp server on `127.0.0.1:8080`.
- `jarvis-vllm`: OpenAI-compatible vLLM server on `127.0.0.1:8000`.
- `jarvis-ollama`: Ollama fallback on `127.0.0.1:11434`.
- `jarvis-voice`: local faster-whisper STT plus offline system TTS on `127.0.0.1:9010`. The runtime code is Kokoro-ready when a Kokoro-enabled image is built.

The desktop backend applies these loopback URLs to `config.yaml`, so the packaged app still owns the setup flow.

## Resource Policy

The compose file does not set hard `mem_limit`, `cpus`, or GPU reservations. Local inference can burst when active. Use `Stop` from the Setup page or:

```powershell
scripts\jarvis-docker-models.ps1 stop
```

Stopping services lets Docker Desktop and WSL return idle memory and compute headroom to the host.

## Model Folders

JARVIS checks:

- `%USERPROFILE%\.jarvis\models`
- `models` inside this repo
- a parent `models` folder
- `JARVIS_MODELS_DIR` when set

Voice assets are mounted from `assets` or `vendor` folders when present.
Kokoro assets under `models/hexgrad__Kokoro-82M` are mounted into the voice runtime for Kokoro-enabled images.

## Packaging Boundary

The final desktop app is still launched as JARVIS/Jarvis.exe. Docker services are optional local runtimes started and stopped through JARVIS setup. Docker Desktop itself may show containers in Docker tools, but the user workflow remains inside the JARVIS app.
