import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class JarvisRunFilesContractTests(unittest.TestCase):
    def test_root_setup_run_stop_wrappers_exist(self) -> None:
        for name in (
            "setup-jarvis.cmd",
            "run-jarvis.cmd",
            "stop-jarvis.cmd",
            "ops/run/desktop/setup-jarvis.ps1",
            "ops/run/desktop/setup-jarvis.sh",
            "ops/run/desktop/run-jarvis.ps1",
            "ops/run/desktop/stop-jarvis.ps1",
        ):
            self.assertTrue((ROOT / name).is_file(), name)

    def test_setup_script_checks_python_and_node_without_docker(self) -> None:
        source = (ROOT / "ops/run/desktop/setup-jarvis.ps1").read_text(encoding="utf-8")

        self.assertIn("check-desktop-python-deps.ps1", source)
        self.assertIn("pip install", source)
        self.assertIn("npm.Source install", source)
        self.assertNotIn("docker-compose.local-models.yml", source)
        self.assertNotIn("SkipDockerCheck", source)
        self.assertIn(".\\run-jarvis.cmd", source)

    def test_run_script_launches_package_or_dev_with_local_models_env(self) -> None:
        source = (ROOT / "ops/run/desktop/run-jarvis.ps1").read_text(encoding="utf-8")

        self.assertIn("JARVIS_MODELS_DIR", source)
        self.assertIn("Using local models", source)
        self.assertNotIn("JARVIS_DOCKER_AUTOSTART", source)
        self.assertNotIn("DockerProfile", source)
        self.assertIn("JARVIS_MINIMIZE_TO_TRAY", source)
        self.assertIn("desktop/release/JARVIS 1.0.0.exe", source)
        self.assertNotIn("release/win-unpacked", source)
        self.assertIn("npm.Source run desktop:dev", source)

    def test_stop_script_stops_owned_desktop_processes_without_docker(self) -> None:
        source = (ROOT / "ops/run/desktop/stop-jarvis.ps1").read_text(encoding="utf-8")

        self.assertNotIn("scripts/jarvis-docker-models.ps1", source)
        self.assertNotIn("KeepDocker", source)
        self.assertIn("Get-CimInstance Win32_Process", source)
        self.assertIn("Stop-Process", source)
        self.assertIn("jarvis_cli\\.desktop_entry", source)
        self.assertIn("jarvis-backend", source)
        self.assertIn("Resolve-Path $RepoRoot", source)

    def test_package_json_exposes_plain_jarvis_scripts(self) -> None:
        package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
        scripts = package["scripts"]

        self.assertEqual(scripts["jarvis:setup"], "powershell -ExecutionPolicy Bypass -File ops/run/desktop/setup-jarvis.ps1")
        self.assertEqual(scripts["jarvis:run"], "powershell -ExecutionPolicy Bypass -File ops/run/desktop/run-jarvis.ps1")
        self.assertEqual(scripts["jarvis:stop"], "powershell -ExecutionPolicy Bypass -File ops/run/desktop/stop-jarvis.ps1")


if __name__ == "__main__":
    unittest.main()
