import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class ElectronShellContractTests(unittest.TestCase):
    def test_package_declares_electron_desktop_shell(self) -> None:
        package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))

        self.assertEqual(package["productName"], "JARVIS")
        self.assertEqual(package["main"], "desktop/electron/main.js")
        self.assertEqual(package["scripts"]["desktop:dev"], "electron .")
        self.assertIn("stage_llamacpp_runtime.py", package["scripts"]["desktop:pack"])
        self.assertIn("electron-builder", package["scripts"]["desktop:pack"])
        self.assertIn("electron", package["devDependencies"])
        self.assertIn("electron-builder", package["devDependencies"])
        extra_resources = package["build"]["extraResources"]
        self.assertIn(
            {"from": "dist/jarvis-backend", "to": "backend"},
            extra_resources,
        )

    def test_main_process_starts_backend_and_uses_frameless_window(self) -> None:
        source = (ROOT / "desktop" / "electron" / "main.js").read_text(encoding="utf-8")

        self.assertIn("const { app, BrowserWindow, ipcMain, Menu, Tray, session } = require('electron')", source)
        self.assertIn("app.setAppUserModelId(APP_USER_MODEL_ID)", source)
        self.assertIn("app.requestSingleInstanceLock({ appId: APP_USER_MODEL_ID })", source)
        self.assertIn("app.exit(0)", source)
        self.assertIn("second-instance", source)
        self.assertIn("showMainWindow()", source)
        self.assertIn("spawn(", source)
        self.assertIn("probeExistingBackend", source)
        self.assertIn("/api/desktop/ready", source)
        self.assertIn("desktop_shutdown_token_valid", source)
        self.assertIn("stopStaleProcessTree", source)
        self.assertIn("taskkill", source)
        self.assertIn("!isPidRunning(parentPid)", source)
        self.assertIn("existing backend is not owned", source)
        self.assertIn("backend already running; not spawning child", source)
        self.assertIn("jarvis_cli.desktop_entry", source)
        self.assertIn("WindowStyle Hidden", source)
        self.assertIn("frame: false", source)
        self.assertIn("contextIsolation: true", source)
        self.assertIn("preload.js", source)
        self.assertIn("cwd: path.dirname(packagedBackend)", source)
        self.assertIn("window.loadURL(BACKEND_BASE_URL)", source)
        self.assertLess(source.index("window.loadURL(BACKEND_BASE_URL)"), source.index("window.loadFile(indexPath)"))
        self.assertIn("did-fail-load", source)
        self.assertIn("console-message", source)

    def test_main_process_grants_local_microphone_capture_only_to_renderer(self) -> None:
        source = (ROOT / "desktop" / "electron" / "main.js").read_text(encoding="utf-8")

        self.assertIn("installLocalMediaPermissions", source)
        self.assertIn("session.defaultSession.setPermissionRequestHandler", source)
        self.assertIn("session.defaultSession.setPermissionCheckHandler", source)
        self.assertIn("new Set(['media', 'audioCapture'])", source)
        self.assertIn("trustedWindow && trustedUrl && audioOnly", source)
        self.assertIn("isTrustedRendererUrl", source)
        self.assertIn("parsed.hostname === '127.0.0.1'", source)
        self.assertIn("parsed.hostname === 'localhost'", source)
        self.assertIn("installLocalMediaPermissions()", source)

    def test_main_process_runs_backend_preflight_before_launch(self) -> None:
        source = (ROOT / "desktop" / "electron" / "main.js").read_text(encoding="utf-8")

        self.assertIn("spawnSync", source)
        self.assertIn("runBackendPreflight", source)
        self.assertIn("shouldRunBackendPreflight", source)
        self.assertIn("JARVIS_FORCE_BACKEND_PREFLIGHT", source)
        self.assertIn("JARVIS_SKIP_BACKEND_PREFLIGHT", source)
        self.assertIn("'--preflight'", source)
        self.assertIn("backend preflight failed", source)
        app_block = source[source.index("app.whenReady().then") :]
        self.assertLess(app_block.index("!needsBackendPreflight || runBackendPreflight()"), app_block.index("startBackendProcess()"))

    def test_main_process_shutdown_calls_backend_before_kill(self) -> None:
        source = (ROOT / "desktop" / "electron" / "main.js").read_text(encoding="utf-8")

        self.assertIn("/api/shutdown", source)
        self.assertIn("SIGTERM", source)
        self.assertIn("SIGKILL", source)
        self.assertIn("before-quit", source)
        self.assertIn("shutdownBackend", source)
        self.assertIn("crypto.randomBytes", source)
        self.assertIn("JARVIS_DESKTOP_SHUTDOWN_TOKEN", source)
        self.assertIn("X-Jarvis-Desktop-Shutdown-Token", source)
        self.assertIn("let exited = false", source)
        self.assertIn("if (!exited) {", source)
        self.assertNotIn("!processToStop.killed) {\n        processToStop.kill('SIGKILL')", source)

    def test_main_process_supports_explicit_minimize_to_tray(self) -> None:
        source = (ROOT / "desktop" / "electron" / "main.js").read_text(encoding="utf-8")

        self.assertIn("Tray", source)
        self.assertIn("Menu", source)
        self.assertIn("JARVIS_MINIMIZE_TO_TRAY", source)
        self.assertIn("createTray", source)
        self.assertIn("mainWindow.hide()", source)
        self.assertIn("Quit JARVIS", source)
        self.assertIn("runAppShutdown()", source)

    def test_packaged_app_uses_local_model_folder_without_docker_autostart(self) -> None:
        source = (ROOT / "desktop" / "electron" / "main.js").read_text(encoding="utf-8")

        self.assertIn("JARVIS_MODELS_DIR", source)
        self.assertIn("defaultModelsDir", source)
        self.assertIn("/api/runtime/local/start", source)
        self.assertIn("/api/runtime/local/stop", source)
        self.assertNotIn("JARVIS_DOCKER_AUTOSTART", source)
        self.assertNotIn("/api/runtime/docker/start", source)

    def test_main_process_warms_desktop_services_after_backend_ready(self) -> None:
        source = (ROOT / "desktop" / "electron" / "main.js").read_text(encoding="utf-8")

        self.assertIn("DESKTOP_WARMUP_ENDPOINTS", source)
        self.assertIn("startupShellHtml", source)
        self.assertIn("loadStartupShell", source)
        self.assertIn("warmBackendServices", source)
        self.assertIn("maybeStartLocalRuntime()", source)
        self.assertIn("/api/runtime/warmup", source)
        self.assertIn("'X-Jarvis-Desktop-Shutdown-Token': BACKEND_SHUTDOWN_TOKEN", source)
        self.assertIn("/api/runtime/readiness", source)
        self.assertIn("/api/models/list", source)
        self.assertIn("/api/souls/team", source)
        self.assertIn("/api/skills", source)
        self.assertIn("backendReady", source)
        app_block = source[source.index("app.whenReady().then") :]
        self.assertLess(app_block.index("createMainWindow()"), app_block.index("await waitForBackend()"))
        self.assertLess(app_block.index("await waitForBackend()"), app_block.index("loadRenderer(mainWindow)"))
        self.assertLess(app_block.index("await waitForBackend()"), app_block.index("void warmBackendServices()"))

    def test_preload_exposes_limited_desktop_bridge(self) -> None:
        source = (ROOT / "desktop" / "electron" / "preload.js").read_text(encoding="utf-8")

        self.assertIn("contextBridge.exposeInMainWorld('jarvisDesktop'", source)
        self.assertIn("getBackendStatus", source)
        self.assertIn("windowControl", source)
        self.assertNotIn("nodeIntegration: true", source)


if __name__ == "__main__":
    unittest.main()
