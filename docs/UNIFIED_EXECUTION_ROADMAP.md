# Unified Execution Roadmap

Updated: 2026-05-18

This roadmap merges the original Student-Builder blueprint, the Jarvis runtime plans, and the latest UI/orb/architecture directive. When details conflict, the latest directive wins, especially for sidebar behavior, always-visible orb identity, compact voice surfaces, permission memory, and the multi-pass code/schema sweep.

## Current Implementation Reality

Jarvis currently runs as a Windows local-first stack:

- Electron HUD/app shell in `apps/hud`.
- Tauri/Vite dashboard fallback in `apps/dashboard`.
- Shared TypeScript contracts, seeds, agents, policy, workflows, and tests in `packages/core`.
- TypeScript Gateway and SQLite/runtime supervisor APIs in `services/gateway`.
- Python Brain for model, voice, vision, and system sidecars in `services/brain`.
- Startup/runtime supervision through `scripts/jarvis-runtime.ps1`.

The latest architecture document mentions a Rust core sidecar. That remains a future optimization target unless and until we migrate the Gateway/orchestrator. For this pass, the production path stays Electron + TypeScript Gateway + Python Brain because it is already wired, tested, and running locally.

## Design System Enforcement

All primary Jarvis surfaces must use one dark, glass-first design kit:

- Background: dark matter `#0A0A0C` and true black for depth.
- Primary accent: electric blue `#4A9EFF`.
- Approval/warning accent: amber `#FFB347`.
- Text: soft white `#E0E0E0`.
- Font scale: Inter for UI; JetBrains Mono for terminal/data readouts.
- Surfaces: frosted glass, subtle borders, consistent 12px card radius, progressive disclosure.
- Motion: GPU-friendly 300-400ms transitions, gentle orb breathing, no jerky panel shifts.

## Phase 45 Immediate Slice

1. Save this unified roadmap and update `PLAN.md` / `PROGRESS.md`.
2. Repair the desktop sidebar/content contract:
   - The sidebar must never cover panel content.
   - Expanded content starts 24px to the right of the expanded rail.
   - Collapsed content starts 16px to the right of the icon rail.
   - Minimized icon rows are centered, 48px tall, with a 36px active frame.
   - The orb, radial menu, and approval chips anchor to the actual usable stage center.
3. Minimize the voice page:
   - Remove giant voice metering as a default page feature.
   - Keep one compact status row, three-dot legend, and collapsible runtime details.
   - Keep manual push-to-talk and transcript controls working.
4. Start the deep code/schema sweep:
   - Map Electron main, preload IPC, renderer state, Gateway routes, Python Brain, runtime scripts, and data flows.
   - Identify current IPC/WebSocket boundaries and the first refactor opportunities.
5. Verify HUD tests, TypeScript build, Gateway/core tests, and runtime live test, then commit and push.

## Next Slices After Phase 45

### Orb Identity And Floating HUD

- Replace app, tray, favicon, and titlebar icons with the orb asset.
- Split the floating orb into a dedicated transparent/click-through BrowserWindow when packaged.
- Add the hover mini-HUD: voice legend, last two log lines, and quick actions.
- Keep the main app orb icon visible on every page.

### Permission Memory And Approval Cards

- Add `~/.jarvis/permissions.json`.
- Add first-launch permission wizard and permission dashboard.
- Convert blocking approval flows into floating glass notification cards.
- Support "always allow this type" only for scoped soul + action + capability.

### Voice Automation

- Keep push-to-talk reliable.
- Enable wake-word only after dependency readiness and owner approval.
- Use VAD silence thresholds for finalize/pause.
- Wire Kokoro as preferred local neural TTS when execution probe is implemented.
- Preserve SAPI/sample fallback and per-agent voice routing.

### Workflow Studio

- Keep the n8n-inspired canvas as the combined workflow view.
- Add richer node editing, variables, permissions, retry/rollback, live edge pulses, minimap, and natural-language workflow proposals.
- Generated workflows stay disabled until owner approval.

### Code Schema Sweep And Optimization

- Complete the multi-pass scan:
  - pass 1: schema vs actual code.
  - pass 2: dead code, unused imports, orphan IPC/listeners.
  - pass 3: push/event flows instead of expensive polling.
  - pass 4: security boundaries, no direct renderer shell/fs access.
- Refactor duplicated UI glass components into a shared HUD kit.
- Reduce heavy polling and fetch readiness only when panels open.
- Keep protected core/source/model internals sealed from runtime agents.

## Acceptance

Jarvis should feel like one mature Windows app: a centered orb by default, clean sidebar, responsive panels, compact voice controls, truthful readiness, working approvals, live local services, auditable permissions, and workflows that are visual, editable, and approval-gated.
