import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class DesktopDockerLifecycleContractTests(unittest.TestCase):
    def test_electron_can_autostart_and_stop_docker_runtime(self) -> None:
        source = (ROOT / "electron" / "main.js").read_text(encoding="utf-8")

        self.assertIn("JARVIS_DOCKER_AUTOSTART", source)
        self.assertIn("JARVIS_DOCKER_PROFILE", source)
        self.assertIn("JARVIS_DOCKER_INCLUDE_VOICE", source)
        self.assertIn("dockerAutostartEnv", source)
        self.assertIn("app.isPackaged", source)
        self.assertIn("maybeStartDockerRuntime", source)
        self.assertIn("stopDockerRuntime", source)
        self.assertIn("/api/runtime/docker/start", source)
        self.assertIn("/api/runtime/docker/stop", source)
        self.assertIn("X-Jarvis-Desktop-Shutdown-Token", source)
        self.assertIn("timeoutMs: DOCKER_START_TIMEOUT_MS", source)
        self.assertIn("timeoutMs: DOCKER_STOP_TIMEOUT_MS", source)
        self.assertLess(
            source.index("await stopDockerRuntime()"),
            source.index("await fetchJson('/api/shutdown'"),
        )
        self.assertLess(
            source.index("createTray()"),
            source.index("void maybeStartDockerRuntime()"),
        )

    def test_true_quit_stops_docker_but_close_to_tray_does_not(self) -> None:
        source = (ROOT / "electron" / "main.js").read_text(encoding="utf-8")

        self.assertIn("mainWindow.hide()", source)
        self.assertIn("Quit JARVIS", source)
        self.assertIn("{ label: 'Quit JARVIS', click: () => runAppShutdown() }", source)
        self.assertIn("await shutdownBackend()", source)
        self.assertIn("tray?.destroy()", source)

    def test_backend_allows_desktop_token_for_docker_lifecycle(self) -> None:
        source = (ROOT / "jarvis_cli" / "web_server.py").read_text(encoding="utf-8")

        self.assertIn('path.startswith("/api/runtime/docker")', source)
        self.assertIn("_has_valid_desktop_shutdown_token(request)", source)


if __name__ == "__main__":
    unittest.main()
