# Jarvis Setup Lists

Jarvis separates setup into two lists.

## Needed Feature Downloads

These are tools or models Jarvis is already wired to use. Download them when you want the matching feature to activate.

| Area | Item | Purpose | Expected folder |
| --- | --- | --- | --- |
| Voice | Piper executable and one local voice | Local TTS for Jarvis and agent voices | `C:\Users\user\Downloads\Secretary Jarvis\tools\piper` |
| Voice | Wake-word profile | Wake the HUD by saying Jarvis | `C:\Users\user\Downloads\Secretary Jarvis\models\wake-word` |
| Voice | Vosk streaming STT model | Low-latency fallback STT | `C:\Users\user\Downloads\Secretary Jarvis\models\vosk` |
| Vision | LLaVA-style image model | Dedicated screen/image understanding | `C:\Users\user\Downloads\Secretary Jarvis\models\huggingface\snapshots\llava` |
| Vision | YOLO object detection weights | Fast screen/camera object detection | `C:\Users\user\Downloads\Secretary Jarvis\models\vision\yolo` |
| Vision | OCR runtime | Read screenshots, PDFs, and app windows | `C:\Users\user\Downloads\Secretary Jarvis\tools\ocr` |
| Media | Image generation/editing model | Media Studio image generation and inpainting | `C:\Users\user\Downloads\Secretary Jarvis\models\media\image` |
| Media | Video generation/editing model | Media Studio video workflows | `C:\Users\user\Downloads\Secretary Jarvis\models\media\video` |
| Media | Music/song/audio model | Music, song, and rich audio generation | `C:\Users\user\Downloads\Secretary Jarvis\models\media\music` |
| Maps | Offline maps/geocoder data | Local Map Room routing | `C:\Users\user\Downloads\Secretary Jarvis\data\maps` |
| Connectors | Connector credentials | Approved email/social/device actions | `C:\Users\user\Downloads\Secretary Jarvis\jarvis\data\vault` |

## Future Scaling Models

These are optional larger models for later switching and benchmarking from the Model Hub.

| Item | Model ref | Scale | Purpose |
| --- | --- | --- | --- |
| DeepSeek V4 Flash | `deepseek-ai/DeepSeek-V4-Flash` | homelab | Optional top-tier reasoning/coding scale-up |
| Larger DeepSeek/Qwen/Gemma/Llama reasoning models | `future/local-reasoning-family` | homelab | Optional later reasoning/coding alternatives |
| Workstation/homelab multimodal models | `future/local-multimodal-family` | workstation | Optional stronger image/audio/video reasoning |
| Large media generation models | `future/local-media-family` | homelab | Optional heavy image/video/audio/music generation |

## Command

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\show-setup-lists.ps1
```
