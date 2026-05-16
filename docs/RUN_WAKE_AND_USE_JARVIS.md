# Run, Wake, And Use Jarvis

Jarvis is designed to run as a local background desktop assistant with the Electron HUD as the primary shell. The browser preview is only a development path.

## Start Jarvis

From the repository root:

```powershell
cd "C:\Users\user\Downloads\Secretary Jarvis\jarvis"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start-jarvis.ps1
```

This starts, in order:

- Python Brain;
- TypeScript Gateway;
- Dashboard renderer;
- HUD renderer;
- Electron HUD.

To preview without starting processes:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start-jarvis.ps1 -CheckOnly
```

Current known advisory: Ollama may be detected off PATH. Open Ollama manually or use the HUD Settings `Ollama PATH` repair dry-run before relying on Ollama model calls.

## Stop Jarvis

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\stop-jarvis.ps1
```

Emergency stop is also available from the HUD/tray dry-run controls. It pauses agents, listening/capture, workflow execution, and runtime controls while preserving logs and checkpoints.

## Start On Windows Login

Preview registration:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\register-startup-task.ps1 -CheckOnly
```

Register standard startup after approval:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\register-startup-task.ps1
```

Approved-admin startup is intentionally separate and should be registered only when you want elevated local-control workflows available. Sensitive actions still require Jarvis approval gates.

## Wake Jarvis

Ready now:

- Click the centered orb.
- Use the tray menu to open the HUD.
- Open the Voice panel and start a manual listening session.
- Use Text Input for fast commands while other work runs.

Staged:

- Hotword wake, such as saying "Jarvis", is wired as a runtime path but needs the wake-word dependency/model installed before it is true always-on voice wake.

## Talk While Jarvis Works

Jarvis accepts new text and voice input while tasks are queued or running. The queue supports:

- steer: add a new instruction to a running task;
- interrupt: pause at a checkpoint and revise the plan;
- cancel: stop with state preserved;
- resume: continue from a saved state when available.

The HUD `Interaction health` and `Agent manager readiness` strips show whether the flow is responsive or waiting on approvals.

## Workflows And Automations

Jarvis can generate workflow drafts from natural language. Generated workflows are saved as disabled drafts. They do not run until the owner approves the dry-run and enables them.

Workflow execution is managed by Jarvis, reviewed by Sentinel, and routed to specialist souls such as Daedalus, Friday, Vulcan, Hermes, Argus, or Mnemosyne depending on the task.

## Editing And 20-Minute Undo

Jarvis-managed file edits, moves, generated files, and config changes create undo checkpoints when reversible. Available checkpoints live in the undo journal for 20 minutes unless pinned.

Non-reversible actions, such as sending a message externally, must be labeled before approval and cannot use time-travel undo.

## Agent Voices

Every named soul has a distinct voice profile and personality lane. Some voices are ready through current local fallbacks; staged voices become richer when Piper voices or future cloned voice assets are installed.

Jarvis remains the manager voice. Specialist voices should be concise and only speak when their role is relevant.
