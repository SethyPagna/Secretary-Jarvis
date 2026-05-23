import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class RuntimeSmokeApiContractTests(unittest.TestCase):
    def test_web_server_exposes_runtime_smoke_test_endpoint(self) -> None:
        source = (ROOT / "jarvis_cli" / "web_server.py").read_text(encoding="utf-8")

        self.assertIn('@app.post("/api/runtime/smoke-test")', source)
        self.assertIn("run_runtime_smoke_test", source)
        self.assertIn("load_config()", source)
        self.assertIn("load_env()", source)


if __name__ == "__main__":
    unittest.main()
