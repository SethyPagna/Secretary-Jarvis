import { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEV_HUD_URL = "http://127.0.0.1:5175";
const HUD_URL = process.env.JARVIS_HUD_URL;
const DASHBOARD_URL = process.env.JARVIS_DASHBOARD_URL ?? "http://127.0.0.1:5174";
const GATEWAY_URL = process.env.JARVIS_GATEWAY_URL ?? "http://127.0.0.1:4317";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let hudWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

type TrayActionType = "open-hud" | "open-dashboard" | "mute-mic" | "pause-agents" | "emergency-stop";

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
  }
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
      { type: "separator" },
      { label: "Quit", click: () => app.quit() }
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
