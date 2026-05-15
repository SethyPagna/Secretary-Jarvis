import { app, BrowserWindow, Menu, Tray, nativeImage, shell } from "electron";

const HUD_URL = process.env.JARVIS_HUD_URL ?? "http://127.0.0.1:5175";
const DASHBOARD_URL = process.env.JARVIS_DASHBOARD_URL ?? "http://127.0.0.1:5174";
const GATEWAY_URL = process.env.JARVIS_GATEWAY_URL ?? "http://127.0.0.1:4317";

let hudWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

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
      sandbox: true
    }
  });

  window.setAlwaysOnTop(true, "screen-saver");
  void window.loadURL(HUD_URL);
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

function postGateway(path: string, body: Record<string, unknown>): void {
  void fetch(`${GATEWAY_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  }).catch(() => undefined);
}

function createTray(): void {
  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip("Jarvis HUD");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open HUD", click: showHud },
      { label: "Open Dashboard", click: () => void shell.openExternal(DASHBOARD_URL) },
      { type: "separator" },
      { label: "Mute Mic", click: () => postGateway("/api/system/actions/dry-run", { label: "Mute microphone", command: "mute mic", target: "microphone" }) },
      { label: "Pause Agents", click: () => postGateway("/api/emergency-stop", { reason: "Pause agents from HUD tray." }) },
      { label: "Emergency Stop", click: () => postGateway("/api/emergency-stop", { reason: "Emergency stop from HUD tray." }) },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() }
    ])
  );
  tray.on("click", showHud);
}

await app.whenReady();
createTray();
showHud();

app.on("activate", showHud);
app.on("window-all-closed", () => {
  hudWindow?.hide();
});
