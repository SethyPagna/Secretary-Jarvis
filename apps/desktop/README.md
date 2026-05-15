# Jarvis Desktop Shell

Jarvis is intended to run as desktop software with a tray icon, floating presence, and full control dashboard.

This package currently provides an Electron shell because Rust/Cargo is not installed on this machine. The `src-tauri/tauri.conf.json` file defines the Tauri target for the tiny production shell once Rust is available.

## Commands

```powershell
npm run build -w @jarvis/desktop
npm run dev:desktop
```

Run the gateway and dashboard first:

```powershell
npm run start:gateway
npm run dev:dashboard
```
