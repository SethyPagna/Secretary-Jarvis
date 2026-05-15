# Jarvis Architecture

Jarvis is built as a local operating layer with explicit boundaries:

- **Desktop/dashboard shell:** TypeScript React UI running as a desktop app, with a floating Jarvis presence, model hub, memory timeline, agent flow, connector control, and approvals.
- **Gateway:** TypeScript Node/Bun-compatible local API, event surface, and shared type contract.
- **Core:** shared TypeScript contracts and deterministic safety logic.
- **Python Brain:** orchestration, MemoryOS, AgentOS, RAG, skills, learning loops, and AI ecosystem integrations.
- **C++ Muscle:** llama.cpp, whisper.cpp, Piper, wake-word helpers, and other high-performance native inference engines.
- **Vendor references:** OpenClaw and Ruflo are reference inputs with license preservation and security review before code reuse.

```text
Desktop/Web/Mobile TypeScript UI
        |
        | HTTP/WebSocket local contract
        v
TypeScript Gateway/API
        |
        | localhost REST/event bridge
        v
Python Brain: orchestration, memory, RAG, skills
        |
        | subprocess/native bindings
        v
C++ Muscle: llama.cpp, whisper.cpp, Piper
```

## Default Security Posture

Strict local-only is the default. Outbound network, cloud inference, social posting, purchases, destructive filesystem operations, credential reads, and irreversible edits require explicit enablement or approval.

## Growth Path

The laptop profile favors Ollama models and small/medium local inference. Workstation and homelab profiles add LM Studio, llama.cpp/GGUF, Hugging Face local imports, vLLM, SGLang, LAN inference, and DeepSeek V4 Flash scale targets.
