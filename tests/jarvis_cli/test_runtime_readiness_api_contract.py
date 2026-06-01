import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SRC_ROOT = ROOT / "src"


class RuntimeReadinessApiContractTests(unittest.TestCase):
    def test_web_server_exposes_runtime_readiness_endpoint(self) -> None:
        source = (SRC_ROOT / "jarvis_cli" / "web_server.py").read_text(encoding="utf-8")

        self.assertIn('@app.get("/api/runtime/readiness")', source)
        self.assertIn("build_runtime_readiness", source)
        self.assertIn("load_env()", source)

    def test_web_server_exposes_lightweight_desktop_ready_endpoint(self) -> None:
        source = (SRC_ROOT / "jarvis_cli" / "web_server.py").read_text(encoding="utf-8")

        self.assertIn('@app.get("/api/desktop/ready")', source)
        self.assertIn('"/api/desktop/ready"', source)
        self.assertIn('"status": "ready"', source)
        self.assertIn("_PROCESS_STARTED_AT", source)

    def test_web_server_exposes_non_blocking_desktop_warmup(self) -> None:
        source = (SRC_ROOT / "jarvis_cli" / "web_server.py").read_text(encoding="utf-8")

        self.assertIn('@app.post("/api/runtime/warmup")', source)
        self.assertIn('@app.get("/api/runtime/warmup")', source)
        self.assertIn("start_desktop_runtime_warmup", source)
        self.assertIn('name="jarvis-desktop-runtime-warmup"', source)
        self.assertIn("_local_model_payload(force_refresh=True)", source)
        self.assertIn("start_desktop_voice_warmup", source)
        self.assertIn("_DESKTOP_TOKEN_API_PATHS", source)


if __name__ == "__main__":
    unittest.main()
