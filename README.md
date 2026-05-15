# Jarvis

Jarvis is a strict local-first assistant platform foundation: model routing, policy guardrails, memory, agents, skills, connectors, and a cinematic local dashboard.

This repository is intentionally owned by Jarvis. OpenClaw, Ruflo, and additional open-source Jarvis variants are treated as references under `vendor/reference/`, not as the app shell.

## Current Foundation

- React/Vite dashboard with floating Jarvis presence and control panels.
- Local gateway service exposing model, memory, agent, connector, skill, and policy state.
- Tauri-first desktop shell scaffold plus a local dashboard and floating Jarvis presence.
- Python Brain and C++ Muscle service boundaries for orchestration and native inference.
- TypeScript core package with tested policy and routing primitives.
- Strict local-only defaults. Cloud providers are represented as disabled adapters.
- Local voice assets are linked under `assets/voice`.
- Hugging Face/Ollama model weights are kept outside Git under the parent `models/` folder.

## Commands

```powershell
npm install
npm run build
npm test
npm run dev:gateway
npm run dev:dashboard
npm run dev:brain
npm run dev:desktop
```

Start local Jarvis services:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-jarvis.ps1 -OpenDashboard
```

Register Jarvis to start local background services at Windows logon:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\register-startup-task.ps1
```

## Windows Setup

Doctor-only:

```powershell
.\scripts\setup-windows.ps1
```

Install missing free/open-source tooling where possible:

```powershell
.\scripts\setup-windows.ps1 -Install
```

Pull the balanced Ollama model pack after reviewing storage needs:

```powershell
.\scripts\setup-windows.ps1 -PullBalancedModels
```

The dashboard is designed to consume `http://localhost:4317/api/status`, with seeded local fallback data when the gateway is offline.

## Model Weights

See `docs/local-model-downloads.md` for copy-paste PowerShell commands that clone Hugging Face repos and download full local snapshots. The model folders are ignored by Git on purpose.

## Reference Audit

See `docs/reference-audit.md` for the local OpenClaw/Ruflo/Jarvis variant source audit and adoption rules.
