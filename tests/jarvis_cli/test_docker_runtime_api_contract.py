import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class DockerRuntimeApiContractTests(unittest.TestCase):
    def test_web_server_exposes_docker_runtime_endpoints(self) -> None:
        source = (ROOT / "jarvis_cli" / "web_server.py").read_text(encoding="utf-8")

        self.assertIn('@app.get("/api/runtime/docker")', source)
        self.assertIn('@app.post("/api/runtime/docker/start")', source)
        self.assertIn('@app.post("/api/runtime/docker/stop")', source)
        self.assertIn('@app.post("/api/runtime/docker/apply")', source)
        self.assertIn("DockerRuntimeRequest", source)

    def test_setup_page_uses_docker_runtime_api(self) -> None:
        source = (ROOT / "web" / "src" / "pages" / "SetupPage.tsx").read_text(encoding="utf-8")

        self.assertIn("Docker Local Models", source)
        self.assertIn("api.startDockerRuntime", source)
        self.assertIn("api.applyDockerRuntime", source)
        self.assertIn("api.stopDockerRuntime", source)


if __name__ == "__main__":
    unittest.main()
