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

## Extension Phase 17 - Ready Model Runtime Activation

Goal: make the five downloaded model assets feel plug-and-play by producing safe activation plans, runtime dry-runs, and compact HUD status without loading huge weights by surprise.

17.1 Add ready-model activation plans for Ollama, Hugging Face local Transformers, llama.cpp/GGUF, LM Studio, vLLM, SGLang, and LAN endpoints.

17.2 Add approval-gated model activation dry-runs with command previews, expected memory, runtime endpoint hints, and unload guidance.

17.3 Surface model activation plans in the HUD dashboard/model area without text stuffing.

17.4 Add user-facing runtime activation documentation for laptop, workstation, and homelab profiles.

17.5 Verify model runtime activation plans with unit tests, HUD tests, and runtime smoke checks.

## Extension Phase 18 - Approved Feature Setup Install Plans

Goal: turn missing feature dependencies into safe, owner-approved setup cards. Jarvis should explain exactly what to place or install for Piper, wake-word, Vosk, OCR, YOLO, media, maps, and connector vaults without silently downloading or executing installers.

18.1 Add feature setup install plans with compact command previews, manual steps, expected folders, validation checks, rollback/uninstall notes, and no execution.

18.2 Add approval-gated install dry-runs that create policy-reviewed action requests before any tool install, credential setup, model placement, or connector enablement.

18.3 Surface setup install plans in the HUD settings panel as quiet cards with details hidden until expanded.

18.4 Add user-facing approved setup documentation that separates "copy/download this dependency yourself" from "future scaling models."

18.5 Verify setup install plans with gateway tests, HUD tests, build checks, and runtime smoke checks.

## Extension Phase 19 - HUD Setup Approval Actions

Goal: let the HUD safely stage setup approvals from compact cards. The user should be able to expand a setup card, trigger a dry-run, see the policy decision, and keep every risky setup action approval-gated.

19.1 Add HUD setup dry-run buttons that call `POST /api/setup/install-plans/:id/dry-run` and show a compact result chip.

19.2 Add a compact setup approval summary in HUD Settings so pending setup approvals are visible without opening the full dashboard.

19.3 Add gateway/HUD tests for setup dry-run action routing, approval decisions, and no-execution messaging.

19.4 Add documentation for the HUD setup approval flow.

19.5 Verify the setup approval UI with builds, unit tests, HUD UI tests, and runtime smoke checks.

## Extension Phase 20 - HUD Presence Polish

Goal: make the centered orb feel more like Jarvis' living presence and less like a generic launcher. State should be communicated through motion, color, rings, and tiny symbols before text appears.

20.1 Make the orb state-aware for idle, wake, listening, recognizing, thinking, planning, executing, speaking, approval, error, and offline states.

20.2 Add non-text visual layers around the orb: scan ring, breathing halo, state glyph, and subtle data arcs.

20.3 Add reduced-motion and small-screen behavior so the orb remains smooth and never causes horizontal overflow.

20.4 Add HUD tests for state-aware orb visuals and no-text idle behavior.

20.5 Verify HUD presence polish with builds, UI tests, and runtime smoke checks.

## Extension Phase 21 - HUD Command Capsule

Goal: make text and voice commands feel alive after submission. Jarvis should close the input panel, keep the orb centered, and show one compact command capsule with queued/running/completed state instead of dumping long responses.

21.1 Add a compact HUD command capsule state for queued, running, completed, failed, and cancelled tasks.

21.2 Wire text and voice command submissions into the command capsule.

21.3 Subscribe the HUD to task stream events so the capsule updates from queued to running to completed.

21.4 Add HUD tests for command capsule submission and task-event updates.

21.5 Verify command capsule behavior with HUD build, UI tests, and runtime smoke checks.

## Extension Phase 22 - Architecture And Runtime Hardening

Goal: review and harden the whole Jarvis architecture: TypeScript, Python, native/C++ runtimes, gateways, workflows, background startup, authority boundaries, and cleanup opportunities.

22.1 Add a local architecture map endpoint that describes each subsystem, language choice, responsibility, runtime boundary, and optimization notes.

22.2 Add a code health scanner for duplicate exports, oversized files, likely dead files, stale docs, and redundant runtime paths.

22.3 Add startup/background readiness checks for Windows scheduled task, Startup shortcut fallback, PID files, hidden process launch, and elevated/admin mode status.

22.4 Add high-trust authority readiness notes that show which actions are allowed, approval-gated, denied, reversible, and eligible for 20-minute undo.

22.5 Surface architecture/startup/code-health summaries in HUD Settings without text stuffing.

22.6 Add documentation for the TypeScript/Python/native architecture review and optimization strategy.

22.7 Verify architecture hardening with gateway tests, HUD tests, build checks, and runtime smoke checks.

## Extension Phase 23 - Route And UI Code Health Refactor

Goal: optimize the implementation after the architecture review by reducing oversized files, duplicated UI patterns, old/dead code, and runtime redundancy while preserving all tested behavior.

23.1 Extract health, architecture, startup, authority, and setup route handlers from the gateway server into focused modules.

23.2 Extract model, runtime, security, system-action, and workflow route handlers from the gateway server where tests already protect behavior.

23.3 Consolidate repeated HUD compact-card, setup-card, hardening-card, and status-chip styles into shared CSS primitives without changing the centered orb design.

23.4 Add HUD route/panel-level code splitting for heavier panels such as workflows and setup so the background HUD stays fast.

23.5 Verify the refactor with gateway tests, HUD tests, build checks, runtime smoke checks, and a code-health scan.

## Extension Phase 24 - Admin Startup And Service Manager Polish

Goal: make everyday background operation clearer to the owner: Jarvis should be visible in Windows process/task views, start at logon when configured, explain standard versus approved-admin mode, and never silently elevate.

24.1 Add a read-only Windows process visibility summary that reports tracked Jarvis service names, PID files, expected process names, and whether each should appear in Task Manager.

24.2 Add startup registration dry-run previews for standard Startup shortcut mode and elevated Scheduled Task mode. These previews must show commands, run level, rollback/removal instructions, and approval requirements without changing Windows.

24.3 Add HUD Settings controls for startup readiness, live service status, approved-admin explanation, and emergency stop. Controls that alter startup or elevation must create approval requests first.

24.4 Verify startup/background/admin readiness with gateway tests, HUD tests, startup script check-only mode, and runtime smoke checks.

## Extension Phase 25 - Runtime Installer And Packaging Readiness

Goal: move Jarvis from dev-process startup toward everyday install/start/stop confidence while keeping all install and elevation actions approval-gated.

25.1 Add a packaging readiness endpoint for Electron installer status, Tauri fallback status, production startup command availability, local logs, and data/runtime folders.

25.2 Add install/start/stop dry-run controls in HUD Settings. They must preview commands and create approval requests before touching startup tasks, services, files, or elevated mode.

25.3 Verify packaging/startup readiness with gateway tests, HUD tests, Electron/HUD build checks, startup check-only scripts, and runtime smoke checks.

## Extension Phase 26 - Wake And Runtime Adapter Activation

Goal: make background wake behavior and local model runtime activation obvious, repairable, and approval-gated. Jarvis should explain exactly how it can wake, which pieces are ready, what is staged, and how to repair Ollama or alternate runtime adapters without silently modifying the laptop.

26.1 Add a wake/runtime activation readiness endpoint that reports tray/orb/manual voice wake, staged hotword wake, VAD/STT/TTS readiness, Ollama PATH/common install candidates, local endpoint hints, and safe repair commands.

26.2 Surface wake/runtime activation readiness in HUD Settings and Voice as compact status chips and drawers, with no long command dumps unless expanded.

26.3 Add run/wake/runtime repair documentation that separates immediate reliable wake methods from staged hotword activation and local model adapter repair.

26.4 Verify wake/runtime activation with gateway tests, HUD tests, build checks, startup check-only scripts, and runtime smoke checks.

## Extension Phase 27 - Approval-Gated Runtime Repair Actions

Goal: convert wake/runtime repair guidance into concrete dry-run actions. Jarvis should preview repair commands for Ollama PATH, Ollama launch, LM Studio endpoint checks, and hotword enablement, then create approval requests before any local system state, environment variable, endpoint, or microphone behavior can change.

27.1 Add runtime adapter repair dry-run domain logic and endpoint for `ollama-path`, `ollama-launch`, `lmstudio-endpoint`, and `hotword-enable`.

27.2 Surface runtime adapter repair dry-run buttons in HUD Settings inside the wake/runtime activation drawer, keeping commands hidden until a dry-run result exists.

27.3 Add documentation describing which repair actions are reversible, approval-gated, and never silently executed.

27.4 Verify runtime repair dry-runs with gateway tests, HUD tests, builds, startup check-only scripts, and runtime smoke checks.

## Extension Phase 28 - Agent Manager, Voices, And Workflow Autonomy

Goal: make Jarvis feel like the manager of a specialist team. Every named soul should have a distinct voice profile and personality lane, workflows should route through the right agent/reviewer/support roles, generated automations must stay approval-gated, and HUD status should show whether agents, voices, queue, approvals, and workflow response paths are connected.

28.1 Add distinct voice profiles for all eight named souls and tests that enforce one voice profile per agent.

28.2 Add an Agent Manager readiness endpoint that reports voice coverage, role routing, workflow autonomy gates, approval health, queue responsiveness, and freeze-risk notes.

28.3 Surface Agent Manager readiness in the HUD without text stuffing, including voice coverage and workflow approval status.

28.4 Add documentation for agent voice personalities, Jarvis manager behavior, workflow generation, and approval-gated automation.

28.5 Verify Agent Manager readiness with core/gateway tests, HUD tests, builds, startup check-only scripts, and runtime smoke checks.

## Extension Phase 29 - Interaction Health And Workflow Manager Polish

Goal: make the assistant feel responsive and operational from the owner's point of view. Jarvis should show whether text, voice, workflow generation, workflow execution, editing/undo, approvals, and emergency controls are connected without stuffing the HUD with logs.

29.1 Add an interaction health endpoint that summarizes command input, voice input, workflow autonomy, approved editing, undo coverage, approval pressure, and freeze risk.

29.2 Surface interaction health in the HUD Settings panel as compact chips and status strips.

29.3 Add workflow console polish for owner-approved automation proposals, including clearer generated-workflow approval state and manager delegation notes.

29.4 Add documentation for run/wake/use flows: how to start Jarvis, wake it, talk while tasks run, approve generated workflows, undo edits, and stop safely.

29.5 Verify interaction health with gateway tests, HUD tests, builds, startup check-only scripts, and runtime smoke checks.

## Extension Phase 30 - Per-Agent Voice Matrix And Playback Readiness

Goal: make every named soul visibly and testably wired to a distinct voice/personality path. Jarvis should show each agent's voice profile, status, sample/fallback path, and allow approval-safe local voice test requests from the HUD.

30.1 Add a gateway per-agent voice matrix endpoint that joins agent souls, voice profiles, voice assets, runtime readiness, and suggested test phrases.

30.2 Surface the voice matrix in the HUD Voice panel as compact soul chips with one-click local TTS test requests.

30.3 Add tests that every seeded soul has a matrix entry, distinct voice profile, and HUD voice test action.

30.4 Add documentation for current voice behavior, staged Piper/future clone upgrades, and how each soul should sound.

30.5 Verify per-agent voice matrix with core/gateway tests, HUD tests, builds, startup check-only scripts, and runtime smoke.

## Extension Phase 31 - HUD Bundle And Startup Responsiveness

Goal: reduce HUD startup/render pressure so Jarvis feels lighter in background mode. The default centered orb should load without dragging the whole animation/UI dependency graph into one oversized chunk.

31.1 Add Vite manual chunking for React, Three.js, animation, icon, workflow, and shared Jarvis code.

31.2 Add build-output documentation that records the new chunk layout and remaining optimization notes.

31.3 Verify HUD bundle splitting with HUD build, HUD UI tests, gateway/core tests, startup check-only scripts, and runtime smoke.

## Extension Phase 32 - Runtime Self-Test And Actionable Fixes

Goal: make Jarvis prove that the runtime is connected end-to-end without flooding the owner with logs. Settings should show one compact self-test summary and a small set of safe dry-run fixes.

32.1 Add a runtime self-test endpoint that aggregates wake/model activation, agent manager, interaction health, startup visibility, packaging, and service readiness.

32.2 Surface the self-test in HUD Settings as concise status chips and top fix buttons, with details collapsed.

32.3 Document how the runtime self-test maps blocked/attention states to dry-run fixes.

32.4 Verify runtime self-test with gateway tests, HUD tests, builds, startup check-only scripts, and runtime smoke.

## Extension Phase 33 - Friendly Launch And Automation

Goal: make Jarvis feel like software, not a pile of scripts. The scripts stay as the reliable engine, but the owner should use double-click launchers, shortcuts, and a small control menu.

33.1 Add root-level Windows launchers for Start, Stop, Verify, and Shortcut Setup.

33.2 Add a smart `scripts/jarvis-control.ps1` command menu that wraps start, stop, restart, verify, self-test, startup registration, and shortcut installation.

33.3 Add `scripts/install-shortcuts.ps1` to create Desktop and Start Menu shortcuts, with check-only preview and optional startup registration.

33.4 Document the user-friendly run flow: double-click, tray/orb wake, background startup, stop, verify, and self-test.

33.5 Verify friendly launch automation with check-only commands, tests, builds, and git push.

## Extension Phase 34 - App-Mode Runtime And Live Text

Goal: stop making Jarvis feel like a browser preview. The default launcher should run the Electron HUD as the app shell, keep browser/dashboard surfaces optional, and prove live text works end-to-end.

34.1 Add friendly root responses for Gateway and Python Brain so `http://127.0.0.1:4317/` and `http://127.0.0.1:5000/` explain the local services instead of returning confusing 404 JSON.

34.2 Add Electron app-mode loading so the HUD can load the built local renderer files without requiring a Vite browser server.

34.3 Update `scripts/start-jarvis.ps1` so the default path starts Brain, Gateway, and Electron HUD in app mode; Dashboard/HUD browser preview become optional.

34.4 Extend runtime smoke to verify `POST /api/chat`, task completion, conversation persistence, and root service responses.

34.5 Document and verify the app-mode runtime with tests, builds, check-only launch, runtime smoke, and GitHub push.

## Extension Phase 35 - Clean App Start, HF Local Bridge, And Soul Communication

Goal: make the owner-facing launcher behave like one coherent app instead of reusing stale process wrappers. Jarvis should cleanly restart its local services, prove Gateway/Brain/live text are connected before saying ready, route text through Ollama first with a Hugging Face local snapshot bridge as fallback, and keep Python Brain voice profiles aligned with all named souls.

35.1 Make friendly Start perform a clean app start by default so stale Brain/Gateway/HUD wrappers are stopped before new services launch.

35.2 Add a startup live text gate that verifies Brain root, Gateway root, Gateway status, and a real `/api/chat` task completion before reporting Jarvis ready.

35.3 Add a Python Brain Hugging Face local generation endpoint for the five downloaded snapshots. It must never silently load huge weights; it reports ready/staged states and only loads Transformers when explicitly allowed and dependencies exist.

35.4 Bridge Gateway chat routing to the Brain Hugging Face local endpoint when a HF model is selected or Ollama is unavailable, while keeping Ollama as the fast laptop default.

35.5 Align Python Brain voice profiles with all eight named souls: Jarvis, Friday, Daedalus, Argus, Mnemosyne, Sentinel, Vulcan, and Hermes.

35.6 Verify clean app startup, live text, HF snapshot readiness, voice profiles, tests, builds, and push.

## Extension Phase 36 - Mature Desktop App Shell And Run Cleanup

Goal: make Jarvis open as visible, coherent desktop software instead of a transparent or stale background shell. The app should combine a persistent desktop window, centered orb, sidebar controls, workflow/model/system status, tray presence, and clean process lifecycle.

36.1 Harden stop/start cleanup so old HUD npm, Vite, node, Electron CLI, and `electron.exe` children are stopped instead of accumulating invisible stale windows.

36.2 Change default Electron app mode from transparent fullscreen overlay to a visible desktop Jarvis shell with taskbar presence, tray icon, normal window bounds, and app background.

36.3 Add a desktop sidebar/rail around the orb for Home, Terminal, Voice, Flows, Devices, System, live model state, task count, approval count, and emergency stop.

36.4 Keep the centered orb and radial controls as the primary command focal point inside the desktop shell, while preserving overlay styling for future minimized/HUD modes.

36.5 Verify builds, tests, clean stop/start behavior, live text, and push.

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

## Extension Phase 37 - Production Runtime Supervisor, Live Test, And App-Controlled Shutdown

Goal: Make Jarvis operate as one mature Windows app rather than separate run scripts and localhost pages.

Tasks:
- 37.1 Add canonical `scripts/jarvis-runtime.ps1` with `Start`, `Stop`, `Restart`, `Verify`, `LiveTest`, `RegisterStartup`, `UnregisterStartup`, and `Status`.
- 37.2 Keep legacy `.cmd` launchers and `jarvis-control.ps1` as thin compatibility wrappers around the supervisor.
- 37.3 Add `POST /api/runtime/live-test` and `GET /api/runtime/live-test/latest`; persist results to `data/smoke/runtime-live-latest.json`.
- 37.4 Wire Electron IPC and HUD controls for `Stop Jarvis`, `Restart`, `Emergency Stop`, and `Live Test`.
- 37.5 Default normal app shutdown to Jarvis-only services while keeping Ollama running.
- 37.6 Update startup registration to use the supervisor in silent tray/orb mode, with approved-admin scheduled task as the default plan.
- 37.7 Verify with unit tests, HUD UI tests, builds, clean start, live test, stop, commits, and push.

## Extension Phase 39 - Responsive Production HUD And Workflow Canvas

Goal: Keep the current Jarvis visual direction, but make the desktop app feel mature: responsive panels, working controls, an auto-collapsing sidebar, and an n8n-inspired workflow/gateway editor that is visual, editable, and approval-gated.

Tasks:
- 39.1 Convert the fixed desktop sidebar into an auto-collapsing icon rail that expands on hover or keyboard focus.
- 39.2 Preserve working sidebar controls for panels, live test, restart, Stop Jarvis, and Emergency Stop.
- 39.3 Replace the workflow text/list center with a draggable node canvas, gateway lines, ports, risk states, and selected-node details.
- 39.4 Keep generated workflow automation approval-gated and queueable through existing Gateway endpoints.
- 39.5 Add responsive CSS so workflow, panels, and action controls avoid horizontal overflow on desktop and mobile.
- 39.6 Add a safe outer-folder organization dry-run for `Secretary Jarvis` assets, references, installers, voice files, and local model folders.
- 39.7 Harden the Electron preload bridge so app controls work in production file mode.
- 39.8 Verify with HUD UI tests, full TypeScript build, core/gateway tests, runtime status, Electron visual smoke, commit, and push.
