const DASHBOARD_URL = process.env.JARVIS_DASHBOARD_URL ?? "http://127.0.0.1:5174";
const WINDOW_WIDTH = 1180;
const WINDOW_HEIGHT = 820;

type DesktopWindow = {
  show(): void;
  hide(): void;
  focus(): void;
  isVisible(): boolean;
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
    width: 320,
    height: 120,
    x: display.x + display.width - 348,
    y: display.y + display.height - 150,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: true,
    title: "Jarvis Floating",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  void window.loadURL(`${DASHBOARD_URL}?floating=1`);
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
      { label: "Toggle Floating Jarvis", click: toggleFloatingWindow },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() },
    ]),
  );
  nextTray.on("click", showMainWindow);
  tray = nextTray;
}

await app.whenReady();
createTray();
showMainWindow();
floatingWindow = createFloatingWindow();

app.on("activate", showMainWindow);
app.on("window-all-closed", () => {
  mainWindow?.hide();
});
