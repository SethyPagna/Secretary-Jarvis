# Python Brain

The Python Brain owns orchestration, memory-heavy workflows, RAG, skill execution, and AI library integration.

It deliberately sits below the TypeScript API/UI layer and above C++ inference engines.

```text
TypeScript dashboard/API -> Python Brain -> C++ Muscle
```

Current command:

```powershell
python services/brain/brain_server.py
```

Current endpoints:

- `GET /health`
- `GET /capabilities`
- `GET /audio/status`
- `GET /vision/status`
- `POST /command`
- `POST /audio/stt/file`
- `POST /audio/tts`
- `POST /vision/analyze-image`
- `POST /memory/write`
- `POST /memory/search`

The core server uses only the Python standard library. Optional local upgrades are listed in
`requirements.txt`; Jarvis detects them at runtime and reports whether each path is `ready`,
`staged`, or `missing`.
