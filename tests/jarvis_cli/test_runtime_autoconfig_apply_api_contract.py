import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SRC_ROOT = ROOT / "src"


class RuntimeAutoconfigApplyApiContractTests(unittest.TestCase):
    def test_web_server_exposes_autoconfig_apply_endpoint(self) -> None:
        source = (SRC_ROOT / "jarvis_cli" / "web_server.py").read_text(encoding="utf-8")

        self.assertIn('@app.post("/api/runtime/autoconfig/apply")', source)
        self.assertIn("merge_runtime_config", source)
        self.assertIn("save_config(", source)


if __name__ == "__main__":
    unittest.main()
