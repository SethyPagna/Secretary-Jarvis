# Model Runtime Activation Guide

Date: 2026-05-16

Jarvis now exposes safe activation plans for the ready local model assets through:

- `GET /api/models/activation-plans`
- `POST /api/models/:id/activation/dry-run`
- HUD Dashboard -> model activation strip

Activation plans are safe-mode only. They inspect local files, expected memory, runtime adapters, and endpoint hints. They do not load model weights or start runtime servers.

## Laptop Profile

Best for this ASUS ROG Zephyrus G14 profile:

- Small/quantized Ollama models for daily chat.
- Whisper large-v3-turbo as the primary STT asset, using Python Transformers or whisper.cpp when available.
- Qwen/Gemma ready assets stay staged unless a runtime probe says the laptop can serve them comfortably.

Recommended flow:

1. Keep Ollama running for daily assistant work.
2. Use `/api/models/activation-plans` to inspect which downloaded assets are present.
3. Use activation dry-run before loading anything heavy.
4. Prefer GGUF/quantized routes for laptop experiments.

## Workstation Profile

Best for Qwen 27B and Gemma 26B class assets:

- LM Studio local server for manual model serving.
- vLLM for OpenAI-compatible serving when GPU memory is available.
- SGLang for advanced serving and agent workloads.

Endpoint hints:

- LM Studio: `JARVIS_LMSTUDIO_URL`, default `http://127.0.0.1:1234/v1/models`
- vLLM: `JARVIS_VLLM_URL`, default `http://127.0.0.1:8000/v1/models`
- SGLang: `JARVIS_SGLANG_URL`, default `http://127.0.0.1:30000/v1/models`

Recommended flow:

1. Start the runtime yourself or through an approved future installer workflow.
2. Serve the downloaded local model folder.
3. Set the matching endpoint environment variable if using a non-default port.
4. Run model probe or activation dry-run.
5. Switch Jarvis routing only after the runtime advertises the model.

## Homelab Profile

Best for future scaling models:

- DeepSeek V4 Flash.
- Larger DeepSeek/Qwen/Gemma/Llama reasoning models.
- Multi-GPU vLLM/SGLang serving.
- LAN endpoints for media and multimodal workloads.

Rule: future scaling models are separate from feature dependency downloads. They belong in Model Hub -> Future Scaling and should not block laptop features.

## Safety Rules

- Activation dry-runs are approval-gated as `service-control`.
- Jarvis records command previews and unload previews before any runtime action.
- Heavy Hugging Face local assets are never loaded by surprise.
- Hosted inference remains disabled by default.
- Runtime agents cannot inspect protected core code, secrets, safeguards, or model tensors.
