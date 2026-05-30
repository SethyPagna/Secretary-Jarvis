import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SRC_ROOT = ROOT / "src"


class DesktopApiContractTests(unittest.TestCase):
    def test_web_server_exposes_stats_stream_and_shutdown_endpoints(self) -> None:
        source = (SRC_ROOT / "jarvis_cli" / "web_server.py").read_text(encoding="utf-8")

        self.assertIn('@app.get("/api/stats")', source)
        self.assertIn('@app.websocket("/ws/stats")', source)
        self.assertIn('@app.post("/api/shutdown")', source)
        self.assertIn("collect_runtime_stats", source)
        self.assertIn("perform_graceful_shutdown", source)

    def test_shutdown_endpoint_accepts_desktop_shutdown_token(self) -> None:
        source = (SRC_ROOT / "jarvis_cli" / "web_server.py").read_text(encoding="utf-8")

        self.assertIn("JARVIS_DESKTOP_SHUTDOWN_TOKEN", source)
        self.assertIn("X-Jarvis-Desktop-Shutdown-Token", source)
        self.assertIn("_has_valid_desktop_shutdown_token", source)
        self.assertIn('path == "/api/shutdown"', source)
        self.assertNotIn('"/api/shutdown",\n}', source)


if __name__ == "__main__":
    unittest.main()
