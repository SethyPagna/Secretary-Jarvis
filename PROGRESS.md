# Progress Tracker

Protocol:
- Read this file at the start of every session.
- Read `PLAN.md` when implementation details need refreshing.
- After completing a task, immediately update this file with `[x]` and the commit hash.
- Commit each task separately with the task ID in the message.

## Initiation
- [x] I.1 Assess codebase - commit `786b926`
- [x] I.2 Save master plan - commit `2420b87`
- [x] I.3 Create progress tracker - commit `ed1a70f`
- [ ] I.4 Session protocol - ongoing; enforce in every future session

## Phase 0 - Foundation & Doctor Checks
- [x] 0.1 Create `services/gateway/src/doctor.ts` - commit `8c2719c`
- [x] 0.2 Add `GET /api/setup/doctor` - implemented before tracker
- [x] 0.3 Add `GET /api/setup/needed-feature-downloads` - commit `75d054d`
- [x] 0.4 Add `GET /api/models/future-scaling` - commit `75d054d`
- [x] 0.5 Run doctor, fix missing pieces, and commit - commit `aea09ef`

## Phase 1 - Desktop HUD & Dashboard Shell
- [x] 1.1 Create `apps/hud/` Electron + React + Vite project - commit `3872403`
- [x] 1.2 Add centered idle orb component - commit `0025183`
- [x] 1.3 Add HUD animation state machine - commit `7efb444`
- [x] 1.4 Build expandable mini panel - commit `ce71eda`
- [x] 1.5 Redesign dashboard into grouped, collapsible sections - commit `9cb7795`
- [x] 1.6 Link tray controls to IPC - commit `8fb0274`

## Phase 2 - Local Model Hub & Runtime Wiring
- [x] 2.1 Define core model/setup types - implemented before tracker
- [x] 2.2 Seed five ready model assets - commit `3603db8`
- [x] 2.3 Implement `GET /api/models` - implemented before tracker
- [x] 2.4 Implement `POST /api/models/scan` - commit `3603db8`
- [x] 2.5 Implement real runtime model probe - commit `5dd8cce`
- [x] 2.6 Implement `POST /api/models/benchmark` - implemented before tracker
- [x] 2.7 Implement `POST /api/models/unload` - implemented before tracker
- [x] 2.8 Default routing logic with runtime-aware fallbacks - commit `c906446`
- [x] 2.9 Wire needed-feature-downloads and future-scaling endpoints - commit `75d054d`

## Phase 3 - Voice Loop
- [x] 3.1 Python voice module/service - commit `e6a1530`
- [x] 3.2 Add voice endpoints - commit `709bfaf`
- [x] 3.3 Wake-word system - commit `3b94bc0`
- [x] 3.4 Barge-in / interruptible speaking - commit `daa0dfd`
- [x] 3.5 Per-agent voice hooks - commit `839cacb`

## Phase 4 - Vision & Identity
- [x] 4.1 Python vision service - commit `499b09a`
- [x] 4.2 Add vision readiness/analyze/capture dry-run endpoints - implemented before tracker
- [x] 4.3 Identity scaffolding - commit `3213b81`
- [x] 4.4 Privacy locks - commit `9b15273`

## Phase 5 - MemoryOS & 20-Minute Time-Travel Undo
- [x] 5.1 Define dedicated memory types in `memory.ts` - commit `dac0794`
- [x] 5.2 Implement full memory/vector/timeline storage - commit `31f7caf`
- [x] 5.3 Add conversations and vector memory endpoints - commit `45543bb`
- [x] 5.4 Implement full 20-minute undo with file checkpoints - commit `dfcc0fd`
- [x] 5.5 Add go-back-in-time views - commit `049d3be`

## Phase 6 - AgentOS, Souls & Task Queue
- [x] 6.1 Define `packages/core/src/agents.ts` - commit `4a7c615`
- [x] 6.2 Task queue types - implemented before tracker
- [x] 6.3 Task queue endpoints - implemented before tracker
- [x] 6.4 Sentinel safety agent - commit `0dd257a`

## Phase 7 - Skills, Connectors, Devices & Social
- [x] 7.1 Define connector manifest type - implemented before tracker
- [x] 7.2 Seed initial connectors - implemented before tracker
- [x] 7.3 Connector endpoints - implemented before tracker
- [x] 7.4 Social drafting behavior - implemented before tracker
- [x] 7.5 Mobile pairing scaffolding - implemented before tracker

## Phase 8 - High-Trust System Control
- [x] 8.1 Define complete allowed local actions - commit `a0f43af`
- [x] 8.2 Implement `POST /api/system/actions/dry-run` - implemented before tracker
- [x] 8.3 Implement approved execution through privileged Python subprocess - commit `a3b7ab9`
- [x] 8.4 Emergency stop mechanism - implemented before tracker
- [x] 8.5 HUD approval-required action display - commit `00edb18`

## Phase 9 - Workflow Engine & Self-Expanding Automation
- [x] 9.1 Add workflow core domain - commit `034f8f6`
- [x] 9.2 Add workflow persistence and gateway API - commit `67e3527`
- [x] 9.3 Create HUD Workflow Console - commit `9417632`
- [x] 9.4 Implement workflow approval pop-ups - commit `951fc0c`
- [x] 9.5 Implement LLM-driven workflow generation - commit `5077a8b`
- [x] 9.6 Implement native step executor - commit `dbb62a6`
- [x] 9.7 Implement multi-agent workflow manager - commit `2f3cb28`

## Phase 10 - Startup Sync & Packaging
- [x] 10.1 Update startup script for HUD and current service paths - commit `f1b4cb8`
- [x] 10.2 Add Windows startup registration - commit `7579cb1`
- [x] 10.3 Electron packaging - commit `1bd5015`
- [x] 10.4 Graceful tray/service stop - commit `d511c60`

## Phase 11 - Full Test Suite & Polish
- [x] 11.1 Model tests - commit `8e51ea9`
- [x] 11.2 Voice tests - commit `ce7233a`
- [x] 11.3 Vision tests - commit `46a6879`
- [x] 11.4 Memory/undo tests - commit `d2e841e`
- [x] 11.5 Agent/task tests - commit `e10da82`
- [x] 11.6 Connector/security tests - commit `71e517f`
- [x] 11.7 UI tests - commit `3e00003`
- [x] 11.8 Final integration walkthrough - commit `582a2b5`

## Phase 12 - Runtime Readiness Polish
- [x] 12.1 Safe local model asset manifests and scan endpoint - commit `0cad90e`
- [x] 12.2 Surface model asset manifests in the HUD/dashboard without text stuffing - commit `3610c29`
- [x] 12.3 Add real voice asset/runtime readiness probes for Whisper/Piper/Vosk/SAPI - commit `e89aa4b`
- [x] 12.4 Add real vision dependency probes for OCR/YOLO/LLaVA and approval-gated actions - commit `53dacdd`
- [x] 12.5 Add one-command local runtime smoke for gateway, brain, and HUD - commit `bf5fdab`

## Phase 13 - Runtime Constellation UI
- [x] 13.1 Add a compact runtime constellation endpoint for model, voice, vision, privacy, and setup readiness - commit `ed68298`
- [x] 13.2 Surface the runtime constellation in the HUD dashboard without text stuffing - commit `a8e57cd`
- [x] 13.3 Add grouped setup actions that separate needed feature downloads from future scaling models - commit `d2fde5a`
- [x] 13.4 Show latest runtime smoke status in the HUD/dashboard - commit `075043f`
- [x] 13.5 Verify the constellation UI across desktop and mobile - commit `ff3ca07`

## Phase 14 - Live Runtime Operation
- [x] 14.1 Add read-only live service heartbeat endpoint for Brain, Gateway, HUD, Dashboard, and Ollama - commit `0f231a1`
- [x] 14.2 Surface live service heartbeats in the HUD without clutter - commit `e2bbe78`
- [x] 14.3 Add approval-gated runtime control dry-runs for start, stop, restart, and emergency stop - commit `faec9e4`
- [x] 14.4 Add live event health summary for queue, approvals, and recent errors - commit `a5c147f`
- [x] 14.5 Verify live runtime operation across tests and smoke checks - commit `1293149`

## Phase 15 - Live Voice And Vision Bridge
- [x] 15.1 Add live voice session endpoints for start, stop, transcript chunk ingest, and transcript commit-to-chat - commit `4aed52f`
- [x] 15.2 Surface live voice session state in the HUD voice panel without text stuffing - commit `e6e9cbd`
- [x] 15.3 Add approval-gated live vision request records for screen, camera, and selected-image analysis - commit `5119711`
- [x] 15.4 Add multimodal activity timeline entries for voice transcripts, vision requests, identity dry-runs, and TTS actions - commit `dc9f81e`
- [x] 15.5 Verify the live voice/vision bridge with unit tests, HUD tests, and runtime smoke checks - commit `7ea1159`

## Phase 16 - Feature Dependency Plug-In Readiness
- [x] 16.1 Add a feature plug-in slot manifest endpoint with expected folders, detected files, validation hints, and plug-in status - commit `b186653`
- [x] 16.2 Surface plug-in slots in the HUD settings panel as compact setup cards with paths hidden until expanded - commit `7c8356c`
- [x] 16.3 Add local validation probes for Piper voices, Vosk models, wake-word profiles, OCR tools, YOLO weights, media runtimes, map data, and connector vaults - commit `e5c5ed5`
- [x] 16.4 Add user-facing setup documentation that separates ready model assets, feature dependencies, and future scaling models - commit `99dfd97`
- [x] 16.5 Verify plug-in readiness with unit tests, HUD tests, and setup doctor checks - commit `ac74f3c`

## Phase 17 - Ready Model Runtime Activation
- [x] 17.1 Add ready-model activation plans for Ollama, Hugging Face local Transformers, llama.cpp/GGUF, LM Studio, vLLM, SGLang, and LAN endpoints - commit `9b7cbd5`
- [x] 17.2 Add approval-gated model activation dry-runs with command previews, expected memory, runtime endpoint hints, and unload guidance - commit `8fa1a40`
- [x] 17.3 Surface model activation plans in the HUD dashboard/model area without text stuffing - commit `3bf9f21`
- [x] 17.4 Add user-facing runtime activation documentation for laptop, workstation, and homelab profiles - commit `590d5c0`
- [x] 17.5 Verify model runtime activation plans with unit tests, HUD tests, and runtime smoke checks - commit `41ff415`

## Phase 18 - Approved Feature Setup Install Plans
- [x] 18.1 Add feature setup install plans with command previews, manual steps, expected folders, validation checks, rollback/uninstall notes, and no execution - commit `b5600d9`
- [x] 18.2 Add approval-gated install dry-runs that create policy-reviewed action requests - commit `0aa8f64`
- [x] 18.3 Surface setup install plans in the HUD settings panel without text stuffing - commit `86be06d`
- [x] 18.4 Add user-facing approved setup documentation - commit `1230cdf`
- [x] 18.5 Verify setup install plans with tests, builds, and runtime smoke checks - commit `52a16f7`

## Phase 19 - HUD Setup Approval Actions
- [x] 19.1 Add HUD setup dry-run buttons and compact result chips - commit `41e75fd`
- [x] 19.2 Add compact setup approval summary in HUD Settings - commit `d376622`
- [x] 19.3 Add gateway/HUD tests for setup dry-run action routing and no-execution messaging - commit `1261ba4`
- [x] 19.4 Add documentation for the HUD setup approval flow - commit `1d01498`
- [x] 19.5 Verify setup approval UI with builds, tests, and runtime smoke checks - commit `250c34a`

## Phase 20 - HUD Presence Polish
- [x] 20.1 Make the orb state-aware for all HUD states and offline mode - commit `10f5243`
- [x] 20.2 Add non-text visual layers around the orb - commit `6144ef1`
- [x] 20.3 Add reduced-motion and small-screen behavior - commit `dea10c5`
- [x] 20.4 Add HUD tests for state-aware orb visuals and no-text idle behavior - commit `609535f`
- [x] 20.5 Verify HUD presence polish with builds, UI tests, and runtime smoke checks - commit `304e9f9`

## Phase 21 - HUD Command Capsule
- [x] 21.1 Add compact HUD command capsule state - commit `0f320e9`
- [x] 21.2 Wire text and voice command submissions into the command capsule - commit `6897c7c`
- [ ] 21.3 Subscribe HUD to task stream events for capsule updates
- [ ] 21.4 Add HUD tests for command capsule submission and task-event updates
- [ ] 21.5 Verify command capsule behavior with builds, UI tests, and runtime smoke checks

## Current Priority

Next task: Implement Phase 21.3 task stream updates for the command capsule.

Acceptance for the next UI slice:
- The default HUD screen shows only a centered orb.
- The orb is clean, futuristic, and not text-stuffed.
- Hover/touch shows compact metrics.
- Click/tap opens radial controls.
- Dashboard remains a secondary control room.
