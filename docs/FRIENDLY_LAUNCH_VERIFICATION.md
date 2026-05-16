# Friendly Launch Verification

Verified for Phase 33 on 2026-05-17.

## Friendly Controls

Passed:
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\jarvis-control.ps1 -Action Start -CheckOnly`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\jarvis-control.ps1 -Action Stop -CheckOnly`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\jarvis-control.ps1 -Action RegisterStartup -CheckOnly`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\jarvis-control.ps1 -Action SelfTest -CheckOnly`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install-shortcuts.ps1 -All -CheckOnly`
- `npm.cmd run jarvis:startup:check`

## Build And Test

Passed:
- `npm.cmd run test`
- `npm.cmd run build -w @jarvis/gateway`
- `npm.cmd run build -w @jarvis/hud`
- `npm.cmd run test:ui -w @jarvis/hud`
- `npm.cmd run smoke:runtime -- -SkipBuild`

## Notes

- The friendly stop path keeps Ollama running by default.
- Shortcut installation is explicit and can be previewed with `-CheckOnly`.
- Windows startup registration is still explicit and can be previewed with `-CheckOnly`.
- A date-sensitive undo test was stabilized so the 20-minute undo window stays valid across future dates.
- A mobile HUD orb test was stabilized to wait for the lazy orb render before measuring its center position.
