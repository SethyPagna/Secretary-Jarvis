# Jarvis Final Integration Walkthrough

Last updated: 2026-05-16

Latest automated pass: 2026-05-16 via `npm.cmd run verify:jarvis`.

This walkthrough records the Phase 11.8 verification path for the current local-first Jarvis runtime slice. It is intentionally repeatable: use the script first, then run any manual checks that require real microphone, camera, model runtime, or owner credentials.

## Automated Verification

Run from the repository root:

```powershell
npm.cmd run verify:jarvis
```

The script verifies:
- Core and gateway unit tests.
- Core, gateway, and HUD builds.
- HUD Playwright smoke tests for desktop and mobile viewports.
- Python vision sidecar unit test using the local Python install when found.
- Startup and shutdown scripts in `-CheckOnly` mode.

Latest observed result:
- Core: 63 tests passed.
- Gateway: 6 tests passed.
- HUD Playwright: 8 tests passed across desktop and mobile Chromium projects.
- Python vision sidecar: 2 tests passed.
- Startup/shutdown check-only scripts completed.

Useful variants:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-jarvis.ps1 -CheckOnlyServices -SkipUi
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-jarvis.ps1 -CheckOnlyServices -SkipPython
```

## Manual Runtime Walkthrough

1. Start local services:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start-jarvis.ps1
```

2. Open the HUD. The default screen should show only the centered orb. Hover shows compact metrics; click opens radial controls.

3. Exercise the text path:
- Open `Text`.
- Send a short command.
- Confirm the gateway records conversation, task, and memory/timeline events.

4. Exercise workflow generation:
- Open `Workflows`.
- Generate a local workflow from a short request.
- Confirm generated workflow details stay in a compact HUD panel and approval is required before saving/running risky steps.

5. Exercise voice readiness:
- Open `Voice`.
- Confirm Whisper large-v3-turbo is selected as the primary STT asset.
- Confirm Piper/Vosk/wake-word remain listed as needed feature downloads until installed.

6. Exercise guarded control:
- Dry-run a system action.
- Confirm risky operations require approval and create or reference a 20-minute undo checkpoint when reversible.

7. Stop services:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\stop-jarvis.ps1
```

## Current Scope Notes

- The five downloaded model assets are wired as ready assets; runtime probing decides whether the laptop can serve each one now.
- Social Outbox is enabled as the local draft-only surface. Live Discord, Telegram, WhatsApp, Slack, and email remain locked until credentials are configured and actions are approved.
- Camera, screen, continuous timeline capture, and biometric identity remain approval-gated by default.
- The HUD is verified in browser-based Playwright smoke tests. The packaged Electron shell is still verified by build/package flows and tray/startup scripts.
