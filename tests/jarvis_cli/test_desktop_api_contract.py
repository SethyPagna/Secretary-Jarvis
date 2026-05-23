import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class DesktopApiContractTests(unittest.TestCase):
    def test_web_server_exposes_stats_stream_and_shutdown_endpoints(self) -> None:
        source = (ROOT / "jarvis_cli" / "web_server.py").read_text(encoding="utf-8")

        self.assertIn('@app.get("/api/stats")', source)
        self.assertIn('@app.websocket("/ws/stats")', source)
        self.assertIn('@app.post("/api/shutdown")', source)
        self.assertIn("collect_runtime_stats", source)
        self.assertIn("perform_graceful_shutdown", source)


if __name__ == "__main__":
    unittest.main()
