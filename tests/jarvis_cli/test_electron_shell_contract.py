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
            {"from": "dist/jarvis-backend", "to": "backend/jarvis-backend"},
            extra_resources,
        )

    def test_main_process_starts_backend_and_uses_frameless_window(self) -> None:
        source = (ROOT / "electron" / "main.js").read_text(encoding="utf-8")

        self.assertIn("const { app, BrowserWindow, ipcMain } = require('electron')", source)
        self.assertIn("spawn(", source)
        self.assertIn("jarvis_cli.desktop_entry", source)
        self.assertIn("WindowStyle Hidden", source)
        self.assertIn("frame: false", source)
        self.assertIn("contextIsolation: true", source)
        self.assertIn("preload.js", source)

    def test_main_process_shutdown_calls_backend_before_kill(self) -> None:
        source = (ROOT / "electron" / "main.js").read_text(encoding="utf-8")

        self.assertIn("/api/shutdown", source)
        self.assertIn("SIGTERM", source)
        self.assertIn("SIGKILL", source)
        self.assertIn("before-quit", source)
        self.assertIn("shutdownBackend", source)
        self.assertIn("let exited = false", source)
        self.assertIn("if (!exited) {", source)
        self.assertNotIn("!processToStop.killed) {\n        processToStop.kill('SIGKILL')", source)

    def test_preload_exposes_limited_desktop_bridge(self) -> None:
        source = (ROOT / "electron" / "preload.js").read_text(encoding="utf-8")

        self.assertIn("contextBridge.exposeInMainWorld('jarvisDesktop'", source)
        self.assertIn("getBackendStatus", source)
        self.assertIn("windowControl", source)
        self.assertNotIn("nodeIntegration: true", source)


if __name__ == "__main__":
    unittest.main()
