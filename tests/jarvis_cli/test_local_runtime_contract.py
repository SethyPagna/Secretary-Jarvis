import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class LocalRuntimeContractTests(unittest.TestCase):
    def test_local_runtime_module_uses_native_llama_server_not_docker(self) -> None:
        source = (ROOT / "jarvis_cli" / "local_runtime.py").read_text(encoding="utf-8")

        self.assertIn("llama-server", source)
        self.assertIn("CREATE_NO_WINDOW", source)
        self.assertIn("/models", source)
        self.assertNotIn("docker_models", source)

    def test_web_server_exposes_native_runtime_lifecycle(self) -> None:
        source = (ROOT / "jarvis_cli" / "web_server.py").read_text(encoding="utf-8")

        self.assertIn('/api/runtime/local"', source)
        self.assertIn('/api/runtime/local/start"', source)
        self.assertIn('/api/runtime/local/stop"', source)
        self.assertIn("start_local_runtime", source)
        self.assertIn("stop_local_runtime", source)


if __name__ == "__main__":
    unittest.main()
