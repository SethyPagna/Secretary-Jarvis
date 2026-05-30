import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SRC_ROOT = ROOT / "src"


class RuntimeAutoconfigApiContractTests(unittest.TestCase):
    def test_web_server_exposes_runtime_autoconfig_endpoint(self) -> None:
        source = (SRC_ROOT / "jarvis_cli" / "web_server.py").read_text(encoding="utf-8")

        self.assertIn('@app.get("/api/runtime/autoconfig")', source)
        self.assertIn("build_runtime_autoconfig_plan", source)
        self.assertIn("load_config()", source)


if __name__ == "__main__":
    unittest.main()
