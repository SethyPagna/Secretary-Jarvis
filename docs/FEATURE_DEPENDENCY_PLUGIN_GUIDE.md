# Feature Dependency Plug-In Guide

Date: 2026-05-16

Jarvis separates local assets into three buckets so setup stays calm and reversible.

## Ready Model Assets

These are treated as downloaded local assets. Jarvis scans them and routes to them when a compatible runtime is available.

Expected root:

`C:\Users\user\Downloads\Secretary Jarvis\models\huggingface\snapshots`

Ready folders:

- `Qwen__Qwen3.5-9B`
- `Qwen__Qwen3.6-27B`
- `openai__whisper-large-v3-turbo`
- `gemma-4-E4B-it`
- `gemma-4-26B-A4B-it`

Jarvis does not need to download these again. Runtime probes decide whether they can run on the laptop now or should be staged for a workstation/LAN endpoint.

## Feature Dependency Downloads

These are not scale-up models. They are missing tools or models for specific features. Jarvis already has plug-in slots for them through:

- `GET /api/setup/needed-feature-downloads`
- `GET /api/setup/plugin-slots`
- HUD Settings -> Feature plug-in slots

Expected plug-in folders:

- Piper TTS: `C:\Users\user\Downloads\Secretary Jarvis\tools\piper`
  - Expected: `piper.exe`, at least one `voices\*.onnx`, and matching voice JSON.
- Wake word: `C:\Users\user\Downloads\Secretary Jarvis\models\wake-word`
  - Expected: Porcupine config/key managed locally or a Vosk wake profile.
- Vosk fallback STT: `C:\Users\user\Downloads\Secretary Jarvis\models\vosk`
  - Expected: extracted Vosk model files such as `model.conf` or `am\final.mdl`.
- LLaVA-style image model: `C:\Users\user\Downloads\Secretary Jarvis\models\huggingface\snapshots\llava`
  - Expected: local snapshot or quantized compatible image model.
- YOLO object detection: `C:\Users\user\Downloads\Secretary Jarvis\models\vision\yolo`
  - Expected: `*.pt` or `*.onnx` weights plus the local Python package later.
- OCR runtime: `C:\Users\user\Downloads\Secretary Jarvis\tools\ocr`
  - Expected: local OCR executable/runtime marker, such as Tesseract or PaddleOCR.
- Image generation: `C:\Users\user\Downloads\Secretary Jarvis\models\media\image`
- Video generation/editing: `C:\Users\user\Downloads\Secretary Jarvis\models\media\video`
- Music/song/audio generation: `C:\Users\user\Downloads\Secretary Jarvis\models\media\music`
- Offline maps/geocoder data: `C:\Users\user\Downloads\Secretary Jarvis\data\maps`
- Connector vault: `C:\Users\user\Downloads\Secretary Jarvis\jarvis\data\vault`

Rule: place files in the expected slot first, then run the doctor or refresh the HUD. Jarvis should detect the files before any feature tries to use them.

## Future Scaling Models

These are optional later switch targets for workstation/homelab scale. They do not block laptop features.

- DeepSeek V4 Flash.
- Larger DeepSeek/Qwen/Gemma/Llama reasoning models.
- Workstation/homelab multimodal models.
- Large image/video/audio/music generation models.
- vLLM/SGLang multi-GPU profiles.
- LAN/homelab model endpoints.

Rule: keep these in Model Hub -> Future Scaling. They are not part of the feature dependency list.

## Safety Defaults

- Jarvis does not silently download dependencies.
- Screen, camera, microphone, social sending, credentials, device control, deletes, and irreversible edits remain approval-gated.
- Plug-in slots are read-only detection surfaces. They never execute installers.
