import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class ElectronShellContractTests(unittest.TestCase):
    def test_package_declares_electron_desktop_shell(self) -> None:
        package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))

        self.assertEqual(package["productName"], "JARVIS")
        self.assertEqual(package["main"], "electron/main.js")
        self.assertEqual(package["scripts"]["desktop:dev"], "electron .")
        self.assertEqual(package["scripts"]["desktop:pack"], "electron-builder")
        self.assertIn("electron", package["devDependencies"])
        self.assertIn("electron-builder", package["devDependencies"])
        extra_resources = package["build"]["extraResources"]
        self.assertIn(
            {"from": "dist/jarvis-backend", "to": "backend"},
            extra_resources,
        )

    def test_main_process_starts_backend_and_uses_frameless_window(self) -> None:
        source = (ROOT / "electron" / "main.js").read_text(encoding="utf-8")

        self.assertIn("const { app, BrowserWindow, ipcMain, Menu, Tray } = require('electron')", source)
        self.assertIn("spawn(", source)
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

    def test_main_process_runs_backend_preflight_before_launch(self) -> None:
        source = (ROOT / "electron" / "main.js").read_text(encoding="utf-8")

        self.assertIn("spawnSync", source)
        self.assertIn("runBackendPreflight", source)
        self.assertIn("'--preflight'", source)
        self.assertIn("backend preflight failed", source)
        self.assertLess(source.index("runBackendPreflight()"), source.index("startBackendProcess()"))

    def test_main_process_shutdown_calls_backend_before_kill(self) -> None:
        source = (ROOT / "electron" / "main.js").read_text(encoding="utf-8")

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
        source = (ROOT / "electron" / "main.js").read_text(encoding="utf-8")

        self.assertIn("Tray", source)
        self.assertIn("Menu", source)
        self.assertIn("JARVIS_MINIMIZE_TO_TRAY", source)
        self.assertIn("createTray", source)
        self.assertIn("mainWindow.hide()", source)
        self.assertIn("Quit JARVIS", source)
        self.assertIn("runAppShutdown()", source)

    def test_packaged_app_uses_local_model_folder_without_docker_autostart(self) -> None:
        source = (ROOT / "electron" / "main.js").read_text(encoding="utf-8")

        self.assertIn("JARVIS_MODELS_DIR", source)
        self.assertIn("defaultModelsDir", source)
        self.assertIn("/api/runtime/local/start", source)
        self.assertIn("/api/runtime/local/stop", source)
        self.assertNotIn("JARVIS_DOCKER_AUTOSTART", source)
        self.assertNotIn("/api/runtime/docker/start", source)

    def test_preload_exposes_limited_desktop_bridge(self) -> None:
        source = (ROOT / "electron" / "preload.js").read_text(encoding="utf-8")

        self.assertIn("contextBridge.exposeInMainWorld('jarvisDesktop'", source)
        self.assertIn("getBackendStatus", source)
        self.assertIn("windowControl", source)
        self.assertNotIn("nodeIntegration: true", source)


if __name__ == "__main__":
    unittest.main()
