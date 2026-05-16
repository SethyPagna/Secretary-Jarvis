# Approved Feature Setup Guide

Jarvis is wired to use several local feature dependencies as soon as you place them in the expected folders. This guide is for current feature dependencies only. Future scaling models live in the Model Hub and are optional later switches.

## Safety Rules

- Jarvis does not silently download, install, or launch setup tools.
- `GET /api/setup/install-plans` shows compact setup plans with manual steps and rollback notes.
- `POST /api/setup/install-plans/:id/dry-run` creates an approval-gated preview only.
- A dry-run never changes files, reads credentials, starts installers, or loads model weights.
- Credentials go through connector-scoped vault setup, never plain text setup files.

## Current Feature Dependencies

| Feature | Expected Path | Purpose | Plug-In Note |
| --- | --- | --- | --- |
| Piper | `C:/Users/user/Downloads/Secretary Jarvis/tools/piper` | Local TTS and future per-agent voices | Place `piper.exe` plus `voices/*.onnx` and matching JSON config. |
| Wake word | `C:/Users/user/Downloads/Secretary Jarvis/models/wake-word` | Minimal HUD wake flow | Place Porcupine or Vosk wake profile config locally. |
| Vosk | `C:/Users/user/Downloads/Secretary Jarvis/models/vosk` | Low-latency fallback STT | Extract a Vosk model folder; Whisper remains primary. |
| YOLO | `C:/Users/user/Downloads/Secretary Jarvis/models/vision/yolo` | Fast object detection | Place YOLO `.pt` or `.onnx` weights and install the local Python runtime when ready. |
| OCR | `C:/Users/user/Downloads/Secretary Jarvis/tools/ocr` | Screenshot/document text reading | Install or configure a local OCR runtime such as Tesseract or PaddleOCR. |
| Media models | `C:/Users/user/Downloads/Secretary Jarvis/models/media/*` | Image, video, music, and audio studio adapters | Place local model files or LAN runtime configs. |
| Offline maps | `C:/Users/user/Downloads/Secretary Jarvis/data/maps` | Local maps and routing | Place offline tiles, geocoder data, or local map service config. |
| Connector vault | `C:/Users/user/Downloads/Secretary Jarvis/jarvis/data/vault` | Email, social, device, and app connectors | Add credentials through Jarvis Settings only. |

## Future Scaling Is Separate

Future scaling models, such as DeepSeek V4 Flash or larger Qwen/Gemma/Llama-family models, are optional scale-up targets. They are not required for Piper, voice, OCR, YOLO, maps, social drafts, or device connectors.

Use `GET /api/models/future-scaling` for those later switch targets.

## Recommended Flow

1. Open Settings in the HUD.
2. Check `Needed Feature Downloads`.
3. Expand only the setup card you want to work on.
4. Place or install the dependency yourself.
5. Run the setup doctor or matching readiness probe.
6. Use the dry-run endpoint before enabling anything that touches credentials, sensors, runtime services, or external apps.

## Rollback

Most feature dependencies are reversible by removing the files from the expected folder or disabling the related connector. Non-reversible actions, such as sending a message or changing an external account, remain approval-gated outside this setup flow.
