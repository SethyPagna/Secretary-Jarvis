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
- `POST /command`
