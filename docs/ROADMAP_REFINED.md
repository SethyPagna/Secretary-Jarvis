# Jarvis Refined Execution Roadmap

This document consolidates the master plan without removing any user requirement from `PLAN.md`. The goal is to stop repeating the same work under different names and keep future sessions focused on production capability.

## Production Pillars

### 1. Native Jarvis App
- Electron HUD is the primary daily app.
- Floating orb is the permanent face of Jarvis.
- One instance only: second launches focus the existing app.
- Close/minimize hides to tray; Quit is explicit.
- `scripts/jarvis-runtime.ps1` remains the canonical runtime supervisor.
- Startup runs silent tray/orb mode after owner-approved registration.

### 2. Fast Persistent Runtime
- Keep `/api/status` lightweight.
- Use SSE/event stream for live task/runtime changes.
- Use cached panel snapshots for dashboard, voice, settings, workflow, readiness, permissions, and runtime details.
- Heavy readiness/model/doctor probes run only when a panel is opened, refreshed, or explicitly requested.
- Chat/task dispatch returns quickly and performs slow work in the background.

### 3. Local Model And Voice Stack
- Model states must be truthful:
  - `Downloaded`: files exist locally.
  - `Runnable`: runtime probe passed.
  - `Staged`: dependency, approval, endpoint, or quantized route is missing.
  - `Incomplete`: partial download, pointer files, or `.crdownload` exists.
- Daily chat prefers Ollama/GGUF/LM Studio/vLLM-style endpoints for speed.
- Raw Hugging Face Transformers are explicit-probe paths for heavy models, with Whisper as the practical STT exception.
- Whisper large-v3-turbo is primary STT.
- SAPI and bundled MP3 samples are immediate TTS fallback.
- Kokoro-82M is the preferred lightweight local neural TTS target.
- Piper remains supported.
- OmniVoice remains advanced/experimental until explicitly probed.

### 4. Voice, Wake, And Orb Experience
- Push-to-talk and orb text input are always available fallback controls.
- Wake-word can become automatic only after dependency checks and owner approval.
- Mic/camera/screen capture remain visible, controllable, and privacy-gated.
- Voice UI stays compact: tiny status legend, caption, transcript, and action buttons instead of large meters.
- Barge-in stops speech and returns to listening.
- Agent voices are distinct in profile and status, even when several currently share fallback engines.

### 5. Authority, Safety, And Undo
- Jarvis can be powerful locally, but risky authority goes through policy, Sentinel, permission memory, and audit logs.
- Sensitive categories remain approval-gated even if similar grants were remembered.
- Reversible Jarvis-managed edits use the 20-minute undo journal.
- Non-reversible actions are labeled before approval.
- Runtime agents may use approved skills/memory/souls, but protected core source, secrets, safeguards, and raw model internals remain sealed.

### 6. AgentOS And Souls
- Jarvis is the manager/commander.
- Friday handles operations and scheduling.
- Daedalus handles coding and architecture.
- Argus handles screen/camera/OCR/visual context.
- Mnemosyne handles memory and timeline.
- Sentinel handles policy and approvals.
- Vulcan handles local system automation.
- Hermes handles email/social/message drafts.
- Souls are defined by files and manifests so new agents can be added without rewriting the app shell.

### 7. Workflow Studio
- The workflow studio is the n8n-style automation surface.
- Canvas supports trigger, agent, condition, memory, connector, system action, approval, and sub-workflow nodes.
- Nodes are movable/editable, with inspector variables, permissions, retry, rollback, inputs, and outputs.
- Jarvis-generated workflows are saved disabled until owner approval enables or executes them.
- Risky edges are marked and blocked by Sentinel until approved.

### 8. Connectors, Devices, Vision, And Media
- Everything external is a connector with a manifest:
  - permissions
  - data touched
  - actions allowed
  - approval requirements
  - rollback behavior
  - audit logging
- Social/email send/post is draft-first and approval-required.
- Screen/camera/mic capture needs separate approvals from readiness.
- Vision/media/maps show feature-dependency status until models/tools are truly runnable.

### 9. Code Health And Architecture
- Keep the TypeScript layer for UI, app shell, real-time contracts, and fast gateway endpoints.
- Keep Python for ML sidecars, voice, vision, and rapid AI integration.
- Keep native/C++ tools for inference engines such as Ollama/llama.cpp/whisper.cpp/Piper-style binaries.
- Avoid renderer-side filesystem/shell access.
- Refactor large files by extracting route/service modules when the boundary is already stable.
- Remove duplicate launch paths only after wrappers point to the canonical supervisor.

## Near-Term Execution Order

1. Keep app shell responsive: sidebar, orb anchoring, panels, tray, single instance.
2. Add persistent panel data cache and event-driven updates.
3. Finish relational architecture/schema audit and use it to guide refactors.
4. Extract high-churn Gateway route groups from `server.ts`.
5. Strengthen workflow studio persistence and execution readiness.
6. Make voice readiness one-click actionable for Kokoro/Piper/Vosk/wake folders.
7. Expand app/device/browser automation through guarded connector manifests.
8. Run full runtime live tests after every major slice and push changes.

## Non-Negotiables

- No hidden cloud inference by default.
- No plaintext token storage.
- No protected-core disclosure to runtime agents.
- No duplicate Jarvis app instances.
- No panels that block the orb or silently fail.
- No “ready” label unless the feature is actually runnable.
- No deleting user-downloaded models or moving active model folders without an explicit organizer operation and compatibility path.
