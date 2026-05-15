# Jarvis Doctor Run - 2026-05-16

Command path:
- Built gateway with `npm run build -w @jarvis/gateway`.
- Started the compiled gateway on a temporary local port.
- Queried `GET /api/setup/doctor`.
- Queried `GET /api/setup/needed-feature-downloads`.

Result:
- Local-only mode: `true`
- Ready model folders detected: `5 / 5`
- Jarvis voice files detected: `4 / 4`
- Local tools detected: `5 / 7`
- Needed feature downloads listed: `11`

Notes:
- The five ready model assets are present and wired for readiness checks.
- Existing Jarvis MP3 identity samples are present in the active voice path or imported voice folder.
- Missing feature dependencies such as Piper, wake-word, Vosk, LLaVA/YOLO/OCR, media models, and map data remain intentionally listed as setup tasks. Jarvis does not silently download those.
