import { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, shell } from "electron";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const DEV_HUD_URL = "http://127.0.0.1:5175";
const HUD_URL = process.env.JARVIS_HUD_URL;
const HUD_MODE = process.env.JARVIS_HUD_MODE ?? "dev";
const WINDOW_MODE = process.env.JARVIS_WINDOW_MODE ?? (HUD_MODE === "app" ? "desktop" : "overlay");
const START_MINIMIZED = process.env.JARVIS_START_MINIMIZED === "1";
const DASHBOARD_URL = process.env.JARVIS_DASHBOARD_URL ?? "http://127.0.0.1:5174";
const GATEWAY_URL = process.env.JARVIS_GATEWAY_URL ?? "http://127.0.0.1:4317";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "../../..");
const ELECTRON_DEBUG_LOG = path.join(ROOT_DIR, "data", "logs", "electron-main.debug.log");

let hudWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function logElectron(message: string): void {
  try {
    mkdirSync(path.dirname(ELECTRON_DEBUG_LOG), { recursive: true });
    appendFileSync(ELECTRON_DEBUG_LOG, `${new Date().toISOString()} ${message}\n`, "utf8");
  } catch {
    // Best-effort diagnostics only.
  }
}

type TrayActionType =
  | "open-hud"
  | "open-dashboard"
  | "mute-mic"
  | "pause-agents"
  | "emergency-stop"
  | "stop-services"
  | "restart-services"
  | "live-test";

interface TrayAction {
  type: TrayActionType;
  label: string;
  state: "wake" | "planning" | "approval" | "error";
  message: string;
}

function createHudWindow(): BrowserWindow {
  const desktopMode = WINDOW_MODE === "desktop";
  logElectron(`creating-window mode=${WINDOW_MODE} hudMode=${HUD_MODE} cwd=${process.cwd()}`);
  const window = new BrowserWindow({
    width: desktopMode ? 1180 : undefined,
    height: desktopMode ? 760 : undefined,
    minWidth: 900,
    minHeight: 620,
    center: true,
    fullscreen: !desktopMode,
    frame: desktopMode,
    transparent: !desktopMode,
    alwaysOnTop: !desktopMode,
    skipTaskbar: false,
    hasShadow: desktopMode,
    title: "Secretary Jarvis",
    titleBarStyle: desktopMode ? "hidden" : "default",
    titleBarOverlay: desktopMode
      ? {
          color: "#02070a",
          symbolColor: "#00e5ff",
          height: 34
        }
      : false,
    backgroundColor: desktopMode ? "#02070a" : "#00000000",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.js")
    }
  });

  if (desktopMode) {
    window.setMenuBarVisibility(false);
  } else {
    window.setAlwaysOnTop(true, "screen-saver");
  }
  if (HUD_URL) {
    void window.loadURL(HUD_URL).then(() => logElectron(`loaded-url ${HUD_URL}`)).catch((error) => logElectron(`load-url-error ${String(error)}`));
  } else if (HUD_MODE === "app") {
    const rendererPath = path.join(__dirname, "../dist/index.html");
    void window.loadFile(rendererPath, { query: { shell: WINDOW_MODE } }).then(() => logElectron(`loaded-file ${rendererPath}`)).catch((error) => logElectron(`load-file-error ${String(error)}`));
  } else if (app.isPackaged) {
    const rendererPath = path.join(__dirname, "../dist/index.html");
    void window.loadFile(rendererPath, { query: { shell: WINDOW_MODE } }).then(() => logElectron(`loaded-packaged-file ${rendererPath}`)).catch((error) => logElectron(`load-packaged-error ${String(error)}`));
  } else {
    void window.loadURL(DEV_HUD_URL).then(() => logElectron(`loaded-dev-url ${DEV_HUD_URL}`)).catch((error) => logElectron(`load-dev-error ${String(error)}`));
  }
  window.once("ready-to-show", () => {
    logElectron("ready-to-show");
    if (START_MINIMIZED) {
      window.hide();
      return;
    }
    window.show();
    window.focus();
  });
  window.webContents.on("render-process-gone", (_event, details) => logElectron(`render-process-gone ${details.reason}`));
  window.webContents.on("did-fail-load", (_event, code, description) => logElectron(`did-fail-load ${code} ${description}`));
  window.on("closed", () => {
    logElectron("window-closed");
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
      message: "Stopping Jarvis services. Ollama stays available."
    },
    "restart-services": {
      type,
      label: "Restart Services",
      state: "approval",
      message: "Restarting Jarvis services with a clean supervisor pass."
    },
    "live-test": {
      type,
      label: "Live Test",
      state: "planning",
      message: "Running production live test."
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
    const ok = await runRuntimeSupervisor("Stop");
    emitTrayAction({ ...action, message: ok ? "Stop request sent to local services." : "Runtime supervisor was unavailable." });
  }

  if (type === "restart-services") {
    const ok = await runRuntimeSupervisor("Restart");
    emitTrayAction({ ...action, message: ok ? "Restart request sent to local services." : "Restart script was unavailable." });
  }

  if (type === "live-test") {
    const ok = await postGateway("/api/runtime/live-test", {
      source: "electron-tray"
    });
    emitTrayAction({ ...action, message: ok ? "Production live test completed." : "Live test could not complete." });
  }
}

async function stopLocalServices(): Promise<boolean> {
  return runRuntimeSupervisor("Stop");
}

async function runRuntimeSupervisor(action: "Stop" | "Restart"): Promise<boolean> {
  const supervisor = path.resolve(__dirname, "../../../scripts/jarvis-runtime.ps1");
  if (!existsSync(supervisor)) {
    return false;
  }
  const child = spawn(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", supervisor, "-Action", action],
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
  tray = new Tray(createTrayImage());
  tray.setToolTip("Jarvis HUD");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open HUD", click: () => void runTrayAction("open-hud") },
      { label: "Open Dashboard", click: () => void runTrayAction("open-dashboard") },
      { type: "separator" },
      { label: "Mute Mic", click: () => void runTrayAction("mute-mic") },
      { label: "Pause Agents", click: () => void runTrayAction("pause-agents") },
      { label: "Run Live Test", click: () => void runTrayAction("live-test") },
      { label: "Emergency Stop", click: () => void runTrayAction("emergency-stop") },
      { label: "Stop Local Services", click: () => void runTrayAction("stop-services") },
      { type: "separator" },
      { label: "Quit", click: () => void stopLocalServices().finally(() => app.quit()) }
    ])
  );
  tray.on("click", () => void runTrayAction("open-hud"));
}

function createTrayImage(): Electron.NativeImage {
  const svg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="8" fill="#02070a"/>
      <circle cx="16" cy="16" r="9" fill="#00e5ff" opacity="0.16"/>
      <circle cx="16" cy="16" r="6" fill="#00e5ff"/>
      <path d="M16 5v5M16 22v5M5 16h5M22 16h5" stroke="#00ff88" stroke-width="1.8" stroke-linecap="round"/>
    </svg>
  `);
  const image = nativeImage.createFromBuffer(svg);
  image.setTemplateImage(false);
  return image;
}

ipcMain.handle("jarvis:tray-command", async (_event, type: TrayActionType) => {
  await runTrayAction(type);
});

logElectron(`main-start electron=${process.versions.electron ?? "unknown"} mode=${HUD_MODE}/${WINDOW_MODE}`);
void app.whenReady().then(() => {
  logElectron("app-ready");
  createTray();
  showHud();
}).catch((error) => logElectron(`app-ready-error ${String(error)}`));

app.on("activate", showHud);
app.on("window-all-closed", () => {
  hudWindow?.hide();
});
