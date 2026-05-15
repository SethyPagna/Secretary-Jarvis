const DASHBOARD_URL = process.env.JARVIS_DASHBOARD_URL ?? "http://127.0.0.1:5174";
const GATEWAY_URL = process.env.JARVIS_GATEWAY_URL ?? "http://127.0.0.1:4317";
const WINDOW_WIDTH = 1180;
const WINDOW_HEIGHT = 820;
const HUD_ONLY = process.argv.includes("--hud-only");

type DesktopWindow = {
  show(): void;
  hide(): void;
  focus(): void;
  isVisible(): boolean;
  setAlwaysOnTop(flag: boolean, level?: string): void;
  on(event: "closed", listener: () => void): void;
  loadURL(url: string): Promise<void>;
};

let mainWindow: DesktopWindow | null = null;
let floatingWindow: DesktopWindow | null = null;
let tray: { setToolTip(value: string): void; setContextMenu(value: unknown): void; on(event: "click", listener: () => void): void } | null =
  null;

if (process.argv.includes("doctor")) {
  console.log(JSON.stringify({ ok: true, shell: "electron-or-tauri", dashboardUrl: DASHBOARD_URL }, null, 2));
  process.exit(0);
}

const electronModuleName = "electron";
const electron = await import(electronModuleName);
const { app, BrowserWindow, Tray, Menu, nativeImage, screen } = electron.default ?? electron;

function createMainWindow(): DesktopWindow {
  const window = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: 920,
    minHeight: 680,
    title: "Jarvis",
    backgroundColor: "#070807",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  void window.loadURL(DASHBOARD_URL);
  window.on("closed", () => {
    mainWindow = null;
  });
  return window;
}

function createFloatingWindow(): DesktopWindow {
  const display = screen.getPrimaryDisplay().workArea;
  const window = new BrowserWindow({
    width: 560,
    height: 160,
    x: display.x + display.width - 590,
    y: display.y + display.height - 190,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    focusable: true,
    skipTaskbar: true,
    transparent: true,
    hasShadow: false,
    title: "Jarvis Floating",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.setAlwaysOnTop(true, "screen-saver");
  void window.loadURL(`${DASHBOARD_URL}?hud=1`);
  window.on("closed", () => {
    floatingWindow = null;
  });
  return window;
}

function showMainWindow(): void {
  mainWindow ??= createMainWindow();
  mainWindow.show();
  mainWindow.focus();
}

function toggleFloatingWindow(): void {
  floatingWindow ??= createFloatingWindow();
  if (floatingWindow.isVisible()) {
    floatingWindow.hide();
    return;
  }

  floatingWindow.show();
}

function createTray(): void {
  const icon = nativeImage.createEmpty();
  const nextTray = new Tray(icon);
  nextTray.setToolTip("Jarvis");
  nextTray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open Jarvis", click: showMainWindow },
      { label: "Toggle HUD", click: toggleFloatingWindow },
      {
        label: "Emergency Stop",
        click: () => {
          void fetch(`${GATEWAY_URL}/api/emergency-stop`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ reason: "Emergency stop from Electron tray." }),
          }).catch(() => undefined);
        },
      },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() },
    ]),
  );
  nextTray.on("click", showMainWindow);
  tray = nextTray;
}

await app.whenReady();
createTray();
floatingWindow = createFloatingWindow();
if (!HUD_ONLY) {
  showMainWindow();
}

app.on("activate", showMainWindow);
app.on("window-all-closed", () => {
  mainWindow?.hide();
});
