import { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, shell } from "electron";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const DEV_HUD_URL = "http://127.0.0.1:5175";
const HUD_URL = process.env.JARVIS_HUD_URL;
const HUD_MODE = process.env.JARVIS_HUD_MODE ?? "dev";
const DASHBOARD_URL = process.env.JARVIS_DASHBOARD_URL ?? "http://127.0.0.1:5174";
const GATEWAY_URL = process.env.JARVIS_GATEWAY_URL ?? "http://127.0.0.1:4317";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let hudWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

type TrayActionType = "open-hud" | "open-dashboard" | "mute-mic" | "pause-agents" | "emergency-stop" | "stop-services";

interface TrayAction {
  type: TrayActionType;
  label: string;
  state: "wake" | "approval" | "error";
  message: string;
}

function createHudWindow(): BrowserWindow {
  const window = new BrowserWindow({
    fullscreen: true,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    title: "Jarvis HUD",
    backgroundColor: "#00000000",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.js")
    }
  });

  window.setAlwaysOnTop(true, "screen-saver");
  if (HUD_URL) {
    void window.loadURL(HUD_URL);
  } else if (HUD_MODE === "app") {
    void window.loadFile(path.join(__dirname, "../dist/index.html"));
  } else if (app.isPackaged) {
    void window.loadFile(path.join(__dirname, "../dist/index.html"));
  } else {
    void window.loadURL(DEV_HUD_URL);
  }
  window.on("closed", () => {
    hudWindow = null;
  });
  return window;
}

function showHud(): void {
  hudWindow ??= createHudWindow();
  hudWindow.show();
  hudWindow.focus();
}

function emitTrayAction(action: TrayAction): void {
  hudWindow?.webContents.send("jarvis:tray-action", action);
}

async function postGateway(path: string, body: Record<string, unknown>): Promise<boolean> {
  try {
    const response = await fetch(`${GATEWAY_URL}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function runTrayAction(type: TrayActionType): Promise<void> {
  const actions: Record<TrayActionType, TrayAction> = {
    "open-hud": {
      type,
      label: "Open HUD",
      state: "wake",
      message: "HUD online."
    },
    "open-dashboard": {
      type,
      label: "Open Dashboard",
      state: "wake",
      message: "Opening dashboard."
    },
    "mute-mic": {
      type,
      label: "Mute Mic",
      state: "approval",
      message: "Microphone mute requested. Sensor changes are approval-gated."
    },
    "pause-agents": {
      type,
      label: "Pause Agents",
      state: "approval",
      message: "Pausing agents at checkpoints."
    },
    "emergency-stop": {
      type,
      label: "Emergency Stop",
      state: "error",
      message: "Emergency stop sent. Queue and capture are being halted."
    },
    "stop-services": {
      type,
      label: "Stop Services",
      state: "approval",
      message: "Stopping local Jarvis services gracefully."
    }
  };

  const action = actions[type];
  showHud();
  emitTrayAction(action);

  if (type === "open-dashboard") {
    void shell.openExternal(DASHBOARD_URL);
    return;
  }

  if (type === "mute-mic") {
    const ok = await postGateway("/api/system/actions/dry-run", {
      label: "Mute microphone",
      command: "mute mic",
      target: "microphone"
    });
    emitTrayAction({ ...action, message: ok ? "Mic mute dry-run recorded for approval." : "Gateway offline. Mic state unchanged." });
    return;
  }

  if (type === "pause-agents") {
    const ok = await postGateway("/api/agents/pause", {
      reason: "Pause agents from HUD tray."
    });
    emitTrayAction({ ...action, message: ok ? "Agents paused with checkpoints preserved." : "Gateway offline. Agents not paused." });
    return;
  }

  if (type === "emergency-stop") {
    const ok = await postGateway("/api/emergency-stop", {
      reason: "Emergency stop from HUD tray."
    });
    emitTrayAction({ ...action, message: ok ? "Emergency stop complete. Logs and checkpoints preserved." : "Gateway offline. Use local controls to stop services." });
    return;
  }

  if (type === "stop-services") {
    const ok = await stopLocalServices();
    emitTrayAction({ ...action, message: ok ? "Stop request sent to local services." : "Stop script was unavailable; gateway emergency stop was attempted." });
  }
}

async function stopLocalServices(): Promise<boolean> {
  await postGateway("/api/emergency-stop", {
    reason: "Graceful shutdown from HUD tray."
  });
  const stopScript = path.resolve(__dirname, "../../../scripts/stop-jarvis.ps1");
  if (!existsSync(stopScript)) {
    return false;
  }
  const child = spawn(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", stopScript],
    {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    }
  );
  child.unref();
  return true;
}

function createTray(): void {
  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip("Jarvis HUD");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open HUD", click: () => void runTrayAction("open-hud") },
      { label: "Open Dashboard", click: () => void runTrayAction("open-dashboard") },
      { type: "separator" },
      { label: "Mute Mic", click: () => void runTrayAction("mute-mic") },
      { label: "Pause Agents", click: () => void runTrayAction("pause-agents") },
      { label: "Emergency Stop", click: () => void runTrayAction("emergency-stop") },
      { label: "Stop Local Services", click: () => void runTrayAction("stop-services") },
      { type: "separator" },
      { label: "Quit", click: () => void stopLocalServices().finally(() => app.quit()) }
    ])
  );
  tray.on("click", () => void runTrayAction("open-hud"));
}

ipcMain.handle("jarvis:tray-command", async (_event, type: TrayActionType) => {
  await runTrayAction(type);
});

await app.whenReady();
createTray();
showHud();

app.on("activate", showHud);
app.on("window-all-closed", () => {
  hudWindow?.hide();
});
