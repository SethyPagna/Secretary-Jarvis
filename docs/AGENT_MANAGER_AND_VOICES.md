# Agent Manager And Voices

Jarvis is the commander-facing manager. It receives the owner's request, keeps the response brief, routes work to specialist souls, and asks Sentinel to review risky actions before anything sensitive happens.

## Soul Roster

| Soul | Role | Voice Direction | Default Status |
| --- | --- | --- | --- |
| Jarvis | Primary manager, routing, concise owner response | Calm cinematic command voice | Ready |
| Friday | Operations, scheduling, daily briefings | Warm operations secretary | Ready |
| Daedalus | Coding, architecture, repo reasoning | Precise technical architect | Ready |
| Argus | Screen, camera, OCR, visual context | Quiet visual observer | Staged |
| Mnemosyne | Memory, timeline, consolidation | Soft archivist cadence | Staged |
| Sentinel | Safety, approvals, policy review | Firm safety reviewer | Ready |
| Vulcan | Local system automation and services | Grounded system operator | Ready |
| Hermes | Email, messaging, social drafts | Smooth diplomatic messenger | Staged |

Each soul has a distinct `voiceProfileId` in `packages/core/src/agents.ts`. Ready voices use current local fallbacks such as Windows SAPI and identity samples; staged voices become fully distinct when Piper voices or future cloned voice assets are installed.

## Management Flow

1. Jarvis receives a text, voice, workflow, or automation request.
2. The gateway routes the task by profile, urgency, and available model runtime.
3. Jarvis delegates to a specialist soul when useful.
4. Sentinel reviews actions that touch files, credentials, social channels, device control, sensors, startup, or scripts.
5. The HUD shows a compact response first. Details stay in drawers, timelines, and workflow logs.

## Workflow Autonomy

Jarvis can draft and propose workflows from natural language. Generated workflows are disabled until the owner approves them. Steps that send messages, run scripts, change files, control devices, use sensors, access credentials, or touch external services remain approval-gated.

The Agent Manager readiness endpoint reports:

- voice coverage across all named souls;
- whether the manager workflow is present;
- approval-gated workflow step count;
- active queue, workflow, and approval pressure;
- freeze-risk signal when work is waiting on approval or backlog.

## Response And Freeze Prevention

Jarvis should continue accepting new user input while work is running. The queue supports steer, soft interrupt, cancel, and resume. If work appears stalled, check the HUD's manager `Flow` chip and pending approvals before assuming a runtime freeze.

Emergency stop pauses agents, listening/capture, workflow runs, and local runtime controls while preserving logs and checkpoints.

## Protected Core Boundary

Runtime agents may use approved memory, skills, connectors, and soul files. They cannot inspect or disclose protected source internals, safeguards, secrets, credentials, or raw model tensors. Owner/developer workflows can edit code through the normal repository path with commits and review.
