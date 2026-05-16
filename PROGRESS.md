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
- [ ] 5.3 Add conversations and vector memory endpoints - partial
- [ ] 5.4 Implement full 20-minute undo with file checkpoints - metadata commit `1cf355b`, full restore missing
- [ ] 5.5 Add go-back-in-time views - partial panels exist

## Phase 6 - AgentOS, Souls & Task Queue
- [ ] 6.1 Define `packages/core/src/agents.ts` - soul files commit `fa6656f`, agents module missing
- [x] 6.2 Task queue types - implemented before tracker
- [x] 6.3 Task queue endpoints - implemented before tracker
- [ ] 6.4 Sentinel safety agent - partial policy engine exists

## Phase 7 - Skills, Connectors, Devices & Social
- [x] 7.1 Define connector manifest type - implemented before tracker
- [x] 7.2 Seed initial connectors - implemented before tracker
- [x] 7.3 Connector endpoints - implemented before tracker
- [x] 7.4 Social drafting behavior - implemented before tracker
- [x] 7.5 Mobile pairing scaffolding - implemented before tracker

## Phase 8 - High-Trust System Control
- [ ] 8.1 Define complete allowed local actions - partial helpers exist
- [x] 8.2 Implement `POST /api/system/actions/dry-run` - implemented before tracker
- [ ] 8.3 Implement approved execution through privileged Python subprocess
- [x] 8.4 Emergency stop mechanism - implemented before tracker
- [ ] 8.5 HUD approval-required action display

## Phase 9 - Workflow Engine & Self-Expanding Automation
- [ ] 9.1 Add workflow core domain
- [ ] 9.2 Add workflow persistence and gateway API
- [ ] 9.3 Create HUD Workflow Console
- [ ] 9.4 Implement workflow approval pop-ups
- [ ] 9.5 Implement LLM-driven workflow generation
- [ ] 9.6 Implement native step executor
- [ ] 9.7 Implement multi-agent workflow manager

## Phase 10 - Startup Sync & Packaging
- [ ] 10.1 Update startup script for HUD and current service paths - partial script exists
- [ ] 10.2 Add Windows startup registration - partial script exists
- [ ] 10.3 Electron packaging
- [ ] 10.4 Graceful tray/service stop - partial

## Phase 11 - Full Test Suite & Polish
- [ ] 11.1 Model tests - partial
- [ ] 11.2 Voice tests - partial
- [ ] 11.3 Vision tests
- [ ] 11.4 Memory/undo tests - partial
- [ ] 11.5 Agent/task tests - partial
- [ ] 11.6 Connector/security tests - partial
- [ ] 11.7 UI tests
- [ ] 11.8 Final integration walkthrough

## Current Priority

Next task: `5.3 Add conversations and vector memory endpoints`.

Acceptance for the next UI slice:
- The default HUD screen shows only a centered orb.
- The orb is clean, futuristic, and not text-stuffed.
- Hover/touch shows compact metrics.
- Click/tap opens radial controls.
- Dashboard remains a secondary control room.
