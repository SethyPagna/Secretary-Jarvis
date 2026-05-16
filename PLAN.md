# Jarvis Master Plan

This master plan is the single source of truth for building the fully local, futuristic AI assistant. It combines the earlier Jarvis Wings automation vision with the runtime refinement requirements: cinematic HUD, memory, undos, local model hub, AgentOS, guarded system control, voice, vision, workflow automation, and startup sync.

Repo reality note:
- `apps/hud/` is the target primary Electron + React + Three.js HUD and does not exist yet.
- `apps/dashboard/` exists as the Vite fallback full dashboard/control room.
- `apps/desktop/` exists as the current Electron/Tauri wrapper and remains fallback until `apps/hud` is ready.
- `services/brain/` is the existing Python brain service and maps to this plan's `services/python/` concept.

## Initiation Phase (Pre-Implementation)

### I.1 Assess the current codebase
Scan the monorepo structure. List all existing directories and key files. Determine which parts of this plan are already partially or fully implemented, including existing `packages/core`, `services/gateway`, and `apps/dashboard`. Record findings in `IMPLEMENTATION_STATUS.md`.

### I.2 Save the master plan
Create `PLAN.md` at the repository root containing this master plan. This ensures the plan can be reloaded in future sessions.

### I.3 Create a progress tracker
Create `PROGRESS.md` at the repository root. Initialize it with a checklist of every task from this plan using the same phase/task numbering. Mark tasks already fully implemented, based on the codebase assessment, as `[x]`. Leave all others `[ ]`.

### I.4 Session protocol
At the start of every new session:
- Read `PROGRESS.md` to know where to resume.
- Read `PLAN.md` if a refresher is needed.
- After completing any task, update `PROGRESS.md` immediately, marking the task `[x]` and noting the commit hash.
- Commit changes with a message referencing the task ID, for example `feat(P1): add idle orb component`.

## Project Context & Architecture

Target monorepo structure:
- `apps/hud/` - Electron + React + Three.js HUD, primary UI.
- `apps/dashboard/` - Tauri or Vite fallback full dashboard.
- `packages/core/` - shared types, policy, seeds.
- `services/gateway/` - Node.js HTTP server and SQLite persistence.
- `services/python/` - Python brain for models, STT, vision, and system control. Current repo path is `services/brain/`.

Local-first:
- All models and services run on the laptop.
- Internet is only allowed through approved connectors/actions.
- No new model downloads in this plan.
- The five existing model folders are treated as ready assets.
- Missing feature dependencies, such as Piper, wake-word, LLaVA, YOLO, and OCR, are listed for later download.

## Phase 0 - Foundation & Doctor Checks

Goal: Ensure tooling is installed, paths are correct, and the monorepo passes a health check.

### 0.1 Create gateway doctor module
Create `services/gateway/src/doctor.ts` with a function that verifies:
- Node/npm.
- Python/venv.
- Rust/Cargo.
- Ollama.
- Hugging Face CLI.
- git-xet.
- Model folders:
  - `Qwen__Qwen3.5-9B`
  - `Qwen__Qwen3.6-27B`
  - `openai__whisper-large-v3-turbo`
  - `gemma-4-E4B-it`
  - `gemma-4-26B-A4B-it`
- Voice folder and existing MP3 files:
  - `jarvis.mp3`
  - `jarvis-intro-1.mp3`
  - `jarvis-intro2.mp3`
  - `jarvis_morning.mp3`
- Electron/Tauri build tools.

### 0.2 Add doctor endpoint
Add `GET /api/setup/doctor` returning doctor results as JSON.

### 0.3 Add needed feature downloads endpoint
Implement `GET /api/setup/needed-feature-downloads`, returning missing feature dependencies with download hints:
- Piper.
- Wake-word.
- LLaVA.
- YOLO.
- OCR.
- Vosk.
- Media generation models.
- Offline maps.
- Connector credentials.

### 0.4 Add future scaling models endpoint
Implement `GET /api/models/future-scaling`, returning optional larger models for future switching, including DeepSeek and workstation/homelab targets.

### 0.5 Run doctor and commit
Run the doctor, fix missing path/tool reporting issues, run tests, and commit.

## Phase 1 - Desktop HUD & Dashboard Shell

Goal: Make the Electron HUD the primary Jarvis shell, with a redesigned grouped dashboard as the deeper control room.

### 1.1 Create `apps/hud/` Electron + React + Vite project
Requirements:
- Frameless, transparent, always-on-top, fullscreen window.
- Tray icon menu:
  - Open HUD.
  - Open Dashboard.
  - Mute Mic.
  - Pause Agents.
  - Emergency Stop.
  - Quit.

### 1.2 Idle orb component
Create `Orb.tsx`:
- Small cyan circle, centered.
- Subtle pulse animation.
- Three.js sphere.
- Click toggles mini command panel.
- Voice wake expands to listening state.

### 1.3 HUD animation state machine
Implement React context plus framer-motion:
- `idle`
- `wake`
- `listening`
- `recognizing`
- `thinking`
- `planning`
- `executing`
- `speaking`
- `approval`
- `error`

Each state has distinct visual effects: orb, particles, waveform, and amber lock.

### 1.4 Expandable mini panel
Build a compact panel that displays:
- One-line answer.
- Active task.
- Voice status.
- `Show details` action.

The detail view expands to a larger glass panel with logs, raw outputs, and agent flow diagrams.

### 1.5 Dashboard redesign
In `apps/dashboard/` or a reused HUD panel, group sections:
- Home.
- Chat.
- Models.
- Voice.
- Vision.
- Agents.
- Memory.
- Skills.
- Devices.
- Social.
- Maps.
- Reports.
- Security.
- Settings.

Use cards, status chips, timelines, model maps, agent-flow diagrams, and progress bars instead of raw text. Keep details collapsible through accordions or drawers.

### 1.6 Tray controls to IPC
Link tray controls to local actions:
- Mute mic.
- Pause agents.
- Emergency stop.
- Preserve logs and checkpoints.

## Phase 2 - Local Model Hub & Runtime Wiring

Goal: Treat the five downloaded model folders as ready assets, with adapters, probes, and a clear split between feature dependencies and future scaling models.

### 2.1 Define model core types
In `packages/core/src/types.ts`, define or refine:
- `ReadyModelAsset`
- `NeededFeatureDownload`
- `FutureScalingModel`
- `RuntimeAdapter`
- `RuntimeProbe`
- `ModelReadiness`
- `HardwareFit`

Runtime adapters include:
- `transformers-python`
- `ollama`
- `llama.cpp`
- `LM Studio`
- `vLLM`

### 2.2 Seed five ready model assets
In `packages/core/src/seed.ts` or setup catalog, create ready asset entries with correct local paths:
- `Qwen__Qwen3.5-9B`
- `openai__whisper-large-v3-turbo`
- `gemma-4-E4B-it`
- `gemma-4-26B-A4B-it`
- `Qwen__Qwen3.6-27B`

### 2.3 Implement model list endpoint
`GET /api/models` returns ready assets, model profiles, runtime adapters, readiness, future scaling models, and hardware profile.

### 2.4 Implement model scan endpoint
`POST /api/models/scan` rescans model folders and updates readiness.

### 2.5 Implement model probe endpoint
`POST /api/models/:id/probe` attempts to load or probe a model via the selected runtime adapter and returns a `ModelReadiness` report including memory, GPU, and latency where feasible.

### 2.6 Implement model benchmark endpoint
`POST /api/models/benchmark` runs a quick benchmark for a selected model.

### 2.7 Implement model unload endpoint
`POST /api/models/unload` unloads a model from memory or marks a runtime route as inactive.

### 2.8 Default routing logic
Gateway model routing defaults:
- Daily/fast: lightweight Ollama model if available; otherwise smallest ready asset.
- Coding/reasoning: Qwen 3.5 9B, or 27B if local endpoint is configured.
- STT: Whisper large-v3-turbo.
- Vision: Gemma 4 E4B-it, or Qwen if capable.

### 2.9 Wire feature and scaling endpoints
Keep needed-feature-downloads and future-scaling endpoints separate.

## Phase 3 - Voice Loop

Goal: Fully functional voice subsystem with wake word, STT, TTS, and interruptible speaking.

### 3.1 Python voice service
In `services/brain/voice.py` or equivalent:
- Primary STT: `openai/whisper-large-v3-turbo` locally, GPU if possible.
- Fallback STT: Vosk after dependency download.
- TTS: Windows SAPI immediate fallback.
- Identity samples: existing MP3 files.
- Staged: Piper local voices after download.

### 3.2 Voice endpoints
Add or maintain:
- `GET /api/voice/profiles`
- `POST /api/voice/test`
- `POST /api/voice/stt/probe`

### 3.3 Wake-word system
Use Porcupine or Vosk wake profile after dependency download. On detecting "Jarvis", emit an event to the HUD and transition to listening state.

### 3.4 Barge-in and interruptible speaking
When TTS is playing, a new wake word or click stops it immediately. UI shows a stop speaking button.

### 3.5 Per-agent voice hooks
Each agent soul can later have a distinct TTS profile. Use default voice for now.

## Phase 4 - Vision & Identity

Goal: Screen capture, webcam presence, and image analysis, all approval-gated by default.

### 4.1 Python vision service
Use:
- Local LLaVA/Gemma model for image understanding.
- YOLO for fast object detection after dependency download.
- OCR through Tesseract or local model dependency.

### 4.2 Vision endpoints
Add or maintain:
- `GET /api/vision/readiness`
- `POST /api/vision/analyze-image`
- `POST /api/vision/capture-screen/dry-run`

### 4.3 Identity scaffolding
Add:
- Voice speaker verification.
- Face recognition via webcam, opt-in.
- HUD `recognizing` shimmer state.

### 4.4 Privacy locks
Camera and continuous screen capture remain disabled until explicitly approved. One-time screen analysis requires approval.

## Phase 5 - MemoryOS & 20-Minute Time-Travel Undo

Goal: Rich memory hierarchy with vector recall, timelines, and a reversible undo journal for Jarvis-managed changes.

### 5.1 Define memory types
In `packages/core/src/memory.ts`, define:
- `ConversationTurn`
- `MemoryWrite`
- `TimelineEvent`
- short-term, episodic, semantic, preference, project, and decision memory concepts.

### 5.2 Implement memory storage
In `services/gateway/src/store.ts`, support:
- conversations.
- memory items.
- timeline.
- local vector embeddings store using a local embedding model such as all-MiniLM-L6-v2.

### 5.3 Add memory endpoints
Add or maintain:
- `GET /api/conversations/:id`
- `POST /api/conversations/:id`
- `POST /api/memory/search`

### 5.4 Implement 20-minute undo
Before Jarvis-managed file operations, create a checkpoint:
- move.
- edit.
- delete.
- generate.
- config change.

Store:
- original path.
- content hash.
- metadata.

Endpoints:
- `POST /api/system/actions/:id/undo`
- `GET /api/undo-journal`

Auto-expire entries after 20 minutes unless pinned. Non-reversible actions must be labeled before approval.

### 5.5 Go back in time views
Dashboard/HUD views include:
- conversations.
- file changes.
- task checkpoints.
- decisions.
- model choices.
- approvals.
- device events.
- remembered facts.

Each entry shows restore/undo if still inside the time window.

## Phase 6 - AgentOS, Souls & Task Queue

Goal: Named agent personas, steerable task queue, and safety net.

### 6.1 Define agent souls
In `packages/core/src/agents.ts`, define or export:
- Jarvis.
- Friday.
- Daedalus.
- Argus.
- Mnemosyne.
- Sentinel.
- Vulcan.
- Hermes.

Each has default prompt, capabilities, and toolset.

### 6.2 Task queue types
Use:
- `TaskRun`
- `TaskEvent`
- `SteeringEvent`

States:
- queued.
- running.
- paused.
- waiting_approval.
- checkpointed.
- completed.
- failed.
- cancelled.

### 6.3 Task queue endpoints
Maintain:
- `GET /api/tasks`
- `POST /api/tasks/:id/steer`
- `POST /api/tasks/:id/interrupt`
- `POST /api/tasks/:id/cancel`

### 6.4 Sentinel safety agent
Sentinel reviews actions before execution and blocks risky steps unless approved.

## Phase 7 - Skills, Connectors, Devices & Social

Goal: Connector registry with explicit permissions, social outbox drafts, and device control placeholders.

### 7.1 Define ConnectorManifest
Core type includes:
- permissions.
- data touched.
- allowed actions.
- approval requirements.
- rollback behavior.
- audit logging.

### 7.2 Seed connectors
Initial categories:
- Local apps: browser, VS Code, terminal, file explorer, Office, notes.
- Devices: laptop, mic, camera, speakers, phone, smart home placeholders.
- Developer tools: Git, GitHub, Docker, package managers.
- Social/messaging: Discord, Telegram, WhatsApp, Slack, email drafts.

### 7.3 Connector endpoints
Maintain:
- `GET /api/connectors`
- `POST /api/connectors/:id/dry-run`
- `POST /api/connectors/:id/enable`

### 7.4 Social drafting behavior
All messages are drafts first:
- preview recipient.
- preview channel.
- preview content.
- require approval before sending.
- log every outbound action.

### 7.5 Mobile pairing scaffolding
Maintain:
- `POST /api/mobile/pairing/start`
- `POST /api/mobile/pairing/confirm`

## Phase 8 - High-Trust System Control

Goal: Allow Jarvis to assist with real laptop tasks under strict approved-admin mode.

### 8.1 Define allowed local actions
Allowed actions:
- open apps.
- run approved scripts.
- organize folders.
- move/copy files.
- control windows.
- start/stop local services.
- inspect system state.
- launch model services.

### 8.2 System action dry-run
Implement or maintain `POST /api/system/actions/dry-run`.

### 8.3 System action approve
Implement `POST /api/system/actions/:id/approve`; after approval, execute through a guarded privileged Python subprocess.

### 8.4 Emergency stop
Tray button or voice command "Jarvis, emergency stop":
- pauses agents.
- pauses queues.
- stops listening/capture.
- preserves checkpoints and logs.

### 8.5 HUD approvals
Approval-required actions are listed clearly in the HUD and require confirmation or admin escalation.

## Phase 9 - Workflow Engine & Self-Expanding Automation

Goal: Integrate the earlier Workflow Integration plan into Jarvis and adapt it to the HUD.

### 9.1 Workflow core domain
Add `packages/core/src/workflows.ts` with:
- workflow types.
- validation.
- risk.
- dry-run.
- seed workflows.

### 9.2 Workflow persistence and API
Add SQLite persistence and gateway API endpoints.

### 9.3 HUD Workflow Console
Create HUD Workflow Console component styled with glass panels, not a separate page.

### 9.4 Workflow approval pop-ups
Implement approval pop-ups for workflow steps.

### 9.5 LLM-driven workflow generation
Implement `POST /api/workflows/generate`:
- Use local Qwen model to produce a valid `WorkflowDefinition` from natural language.
- Show result in HUD for approval before saving.

### 9.6 Native step executor
Implement `jarvis-native` step executor:
- connector-action steps via Python child processes.
- agent-steps using local LLM.
- respect policy and human approvals.

### 9.7 Multi-agent workflow manager
A CTO workflow can invoke sub-workflows. Activity Log in HUD shows all runs.

## Phase 10 - Startup Sync & Packaging

Goal: Automatically start all services at login and package the app for daily use.

### 10.1 Startup script
Create or update startup script to launch:
- Ollama if used.
- Python brain: current path `services/brain/brain_server.py`.
- TypeScript gateway.
- Electron HUD.
- Optional Tauri/dashboard.

### 10.2 Windows startup registration
Add Windows startup registry entry or shortcut.

### 10.3 Electron packaging
Use electron-builder to produce standalone installer.

### 10.4 Graceful stop
Ensure tray icon appears and all services stop gracefully.

## Phase 11 - Full Test Suite & Polish

Goal: Validate every feature with automated tests and manual walkthroughs.

### 11.1 Model tests
- Five ready assets show up.
- Feature downloads and future scaling lists are separate.
- Runtime probes work.

### 11.2 Voice tests
- Whisper STT selected as primary.
- Voice identity files detected.
- Missing Piper/Vosk listed in needed downloads.

### 11.3 Vision tests
- Image analysis with fixture works.
- Screen capture requires approval.
- Webcam locked by default.

### 11.4 Memory/undo tests
- Conversation turns persist.
- File edit undo restores original within 20 minutes.
- Expired undos rejected.

### 11.5 Agent/task tests
- Queue accepts new task while running.
- Interrupt/resume with checkpoint.
- Safety agent blocks risky actions.

### 11.6 Connector/security tests
- Social draft allowed.
- Send requires approval.
- Credential access denied.
- Prompt injection blocked.

### 11.7 UI tests
- HUD animations render all states.
- Dashboard sections are grouped and not text-stuffed.
- Mobile layout does not overflow.

### 11.8 Final integration
Run all services and test full voice to workflow generation to execution loop.

## Public Interfaces Summary

Gateway endpoints:
- `GET /api/status`
- `GET /api/events`
- `POST /api/chat`
- `GET /api/conversations/:id`
- `POST /api/conversations/:id`
- `GET /api/tasks`
- `POST /api/tasks/:id/steer`
- `POST /api/tasks/:id/interrupt`
- `POST /api/tasks/:id/cancel`
- `GET /api/models`
- `GET /api/models/readiness`
- `POST /api/models/scan`
- `POST /api/models/:id/probe`
- `POST /api/models/benchmark`
- `POST /api/models/unload`
- `GET /api/setup/doctor`
- `GET /api/setup/needed-feature-downloads`
- `GET /api/models/future-scaling`
- `GET /api/voice/profiles`
- `POST /api/voice/test`
- `POST /api/voice/stt/probe`
- `GET /api/vision/readiness`
- `POST /api/vision/analyze-image`
- `POST /api/vision/capture-screen/dry-run`
- `POST /api/system/actions/dry-run`
- `POST /api/system/actions/:id/approve`
- `POST /api/system/actions/:id/undo`
- `GET /api/undo-journal`
- `GET /api/connectors`
- `POST /api/connectors/:id/dry-run`
- `POST /api/connectors/:id/enable`
- `POST /api/mobile/pairing/start`
- `POST /api/mobile/pairing/confirm`
- workflow endpoints from Phase 9.

Core types:
- `ReadyModelAsset`
- `NeededFeatureDownload`
- `FutureScalingModel`
- `RuntimeAdapter`
- `RuntimeProbe`
- `ModelReadiness`
- `HardwareFit`
- `VoiceProfile`
- `VoiceSession`
- `TranscriptChunk`
- `VisionEngineStatus`
- `SystemAction`
- `ApprovalRequest`
- `UndoJournalEntry`
- `Conversation`
- `ConversationTurn`
- `TaskRun`
- `TaskEvent`
- `SteeringEvent`
- `AgentSoul`
- `SkillManifest`
- `ConnectorManifest`
- `HudStreamEvent`
- `MemoryWrite`
- `TimelineEvent`
- workflow-related types.

## Self-Verification & Continuous Integration

After every major phase or group of tasks, run the existing test suite with `npm run test`. If any test fails, fix it before progressing. After Phase 5, run a dedicated memory undo scenario manually through the gateway API and verify the undo journal behaves correctly.

## Extension Phase 15 - Live Voice And Vision Bridge

Goal: move beyond readiness cards into a steerable local multimodal bridge while keeping capture approval-gated and the HUD quiet.

15.1 Add live voice session endpoints for start, stop, transcript chunk ingest, and transcript commit-to-chat.

15.2 Surface live voice session state in the HUD voice panel with compact controls and no text stuffing.

15.3 Add approval-gated live vision request records for screen, camera, and selected-image analysis.

15.4 Add multimodal activity timeline entries for voice transcripts, vision requests, identity dry-runs, and TTS actions.

15.5 Verify the live voice/vision bridge with unit tests, HUD tests, and runtime smoke checks.

## Extension Phase 16 - Feature Dependency Plug-In Readiness

Goal: make every missing feature dependency a concrete plug-in slot Jarvis can detect, validate, and surface without silently downloading.

16.1 Add a feature plug-in slot manifest endpoint with expected folders, detected files, validation hints, and plug-in status.

16.2 Surface plug-in slots in the HUD settings panel as compact setup cards with paths hidden until expanded.

16.3 Add local validation probes for Piper voices, Vosk models, wake-word profiles, OCR tools, YOLO weights, media runtimes, map data, and connector vaults.

16.4 Add user-facing setup documentation that separates ready model assets, feature dependencies, and future scaling models.

16.5 Verify plug-in readiness with unit tests, HUD tests, and setup doctor checks.

## Jarvis UI - Orb Centered, Clean, Minimalist Design Brief

### 1. The Jarvis Orb
- Position: always dead center of viewport on desktop and mobile.
- Visual: 3D rendered sphere, 80-90px diameter on desktop.
- Deep cyan core with soft outer glow.
- Subtle hexagonal mesh rotates slowly over surface.
- Thin luminous ring orbits horizontally every 3 seconds.
- Idle behavior: gentle breathing pulse in a 3-second loop.
- No text and no clutter in idle state.

### 2. Hover or touch hold
Hover or touch-hold shows a minimal transparent card above the orb:
- CPU value.
- RAM value.
- NET down/up value.
- Active task count.

Rules:
- No text labels, only icons and values.
- Soft glass blur.
- Disappears immediately on hover out or after 2 seconds on touch.

### 3. Click or tap radial menu
Click/tap expands a circular menu around the orb:
- Dashboard.
- Voice Command.
- Text Input.
- Devices & Integrations.
- Settings.
- Close.

Rules:
- Icons radiate outward in spring animation.
- Thin line symbols with cyan glow when active.
- Hover enlarges icon and shows tiny tooltip.
- Selecting an item collapses the radial menu and opens the related panel.

### 4. Overlay panels
Panels open as clean centered glass overlays. They do not cover the orb entirely; the orb remains visible behind them.

Dashboard panel:
- 85% viewport width, max width 1100px.
- Slides up from orb.
- Contains small widgets:
  - system resources.
  - active tasks.
  - neural activity feed.
  - model status.
- Glanceable only, no long text.

Voice panel:
- Small centered card.
- Pulsing microphone icon.
- Waveform bars when listening.
- Caption: "Say a command..."

Text input panel:
- Compact input bar above orb.
- Placeholder: "Ask Jarvis anything..."
- Submit fades away in mockup, then later routes to Jarvis.

Devices panel:
- Grid of 4-6 connected services.
- Icon and pulsing status dot.

Settings panel:
- Minimal toggles:
  - Privacy Mode.
  - Audio Feedback.
  - Dark theme only.

### 5. Responsiveness
Desktop, 1024px and up:
- centered orb.
- radial menu appears in circle.
- overlays centered, max width 1100px.

Tablet, 768-1023px:
- orb around 70px.
- panels take 95% width.

Smartphone, under 768px:
- orb around 60px.
- radial menu becomes vertical/icon row below orb.
- overlays become near fullscreen slide-up cards.
- no horizontal scrolling.

### 6. Animations
- Orb idle pulse: continuous and gentle.
- Hover card: fade and slight upward motion, 0.2s.
- Radial menu: staggered spring, 0.1s each.
- Panel open: fade and scale from orb, 0.3s.
- Panel close: scale down and fade into orb, 0.2s.
- All motion must be smooth and non-jerky.

### 7. Visual language
- Background: transparent desktop by default; 80% dark overlay when panel is open.
- Primary color: cyan `#00e5ff`.
- Warning/accent: magenta `#ff007f`.
- Key text: white.
- Materials: glassmorphism, blur, subtle white border at 20% opacity.
- Thin neon borders for active elements.
- Dark monospace font for data.
- Orb is always visible and acts as Jarvis' face and launcher.
