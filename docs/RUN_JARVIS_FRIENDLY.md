# Run Jarvis Like Software

You do not need to remember PowerShell commands for day-to-day use. The scripts remain the reliable engine, but the friendly layer is now:

## Best Daily Path

Double-click:

`Start Jarvis.cmd`

This starts:
- Python Brain
- TypeScript Gateway
- Dashboard service
- HUD renderer
- Electron HUD
- Ollama, if available on PATH

The normal wake surface is the centered Jarvis orb. Click the orb to open the radial menu. Use Voice or Text from there.

## Control Menu

Double-click:

`Jarvis.cmd`

It opens a small menu:
- start Jarvis
- stop Jarvis
- restart Jarvis
- verify Jarvis
- runtime self-test
- install Desktop and Start Menu shortcuts
- register or remove Windows startup
- open dashboard

## Desktop And Start Menu Shortcuts

Double-click:

`Install Jarvis Shortcuts.cmd`

This creates:
- Desktop `Jarvis`
- Desktop `Start Jarvis`
- Start Menu `Secretary Jarvis`
- Start, Stop, Verify, and Control shortcuts

Preview first without changing anything:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install-shortcuts.ps1 -All -CheckOnly
```

## Start Jarvis When Windows Starts

Use `Jarvis.cmd`, choose `Register Jarvis at Windows startup`.

Preview first:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\jarvis-control.ps1 -Action RegisterStartup -CheckOnly
```

Remove startup later with `Jarvis.cmd`, choose `Remove Jarvis startup`.

## Stop Jarvis

Double-click:

`Stop Jarvis.cmd`

The friendly stop path keeps Ollama running by default, because Ollama may also be used by other local AI tools. If you intentionally want to stop Ollama too, use the lower-level script:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\stop-jarvis.ps1
```

## Verify

Double-click:

`Verify Jarvis.cmd`

For deeper checks, use the runtime self-test inside the HUD Settings panel or choose `Runtime self-test` from `Jarvis.cmd`.
