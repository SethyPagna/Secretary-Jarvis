# Run And Wake Jarvis

Jarvis is designed to run as a local background runtime with a non-browser Electron HUD in front. The browser preview is only a development fallback.

## Start Jarvis Manually

Run these from the repository root:

```powershell
cd "C:\Users\user\Downloads\Secretary Jarvis\jarvis"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start-jarvis.ps1
```

Useful variants:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start-jarvis.ps1 -CheckOnly
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start-jarvis.ps1 -NoDashboard
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\stop-jarvis.ps1
```

Expected background processes include `ollama.exe`, `python.exe`, `node.exe`, and `electron.exe` or the packaged `Secretary Jarvis HUD.exe`.

## Wake Jarvis

Current reliable wake methods:

- Use the Windows tray icon, then choose `Open HUD`.
- Click or tap the centered Jarvis orb to open radial controls.
- Choose `Text Input` to type a command.
- Choose `Voice Command` to use the manual voice panel.

Hotword wake by saying `Jarvis` is staged. It becomes live after a wake-word dependency such as Porcupine or a Vosk wake profile is installed, configured, and enabled. Until then, running in the background means the services and HUD are available, but the microphone should not continuously listen by default.

## Start Jarvis When Windows Starts

Preview startup registration without changing Windows:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\register-startup-task.ps1 -CheckOnly
```

Register standard background startup:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\register-startup-task.ps1
```

Register approved-admin startup:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\register-startup-task.ps1 -Elevated
```

Remove startup registration:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\register-startup-task.ps1 -Unregister
```

Approved-admin mode gives Jarvis the ability to request higher-trust local actions, but risky work still goes through policy approval.

## Verify Runtime Status

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:4317/api/status
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:4317/api/runtime/process-visibility
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:4317/api/runtime/packaging-readiness
```

The HUD Settings panel also shows process visibility, startup readiness, authority readiness, and packaging readiness in compact form.

## If The HUD Is Not Visible

1. Check the tray icon first.
2. Run `scripts\start-jarvis.ps1 -CheckOnly`.
3. Run `scripts\start-jarvis.ps1`.
4. If Electron is unavailable, open the dev renderer fallback at `http://127.0.0.1:5175/` while repairing Electron packaging.

