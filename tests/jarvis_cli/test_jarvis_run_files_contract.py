import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class JarvisRunFilesContractTests(unittest.TestCase):
    def test_root_setup_run_stop_wrappers_exist(self) -> None:
        for name in (
            "setup-jarvis.ps1",
            "setup-jarvis.cmd",
            "run-jarvis.ps1",
            "run-jarvis.cmd",
            "stop-jarvis.ps1",
            "stop-jarvis.cmd",
        ):
            self.assertTrue((ROOT / name).is_file(), name)

    def test_setup_script_checks_python_node_and_docker_without_starting_models(self) -> None:
        source = (ROOT / "setup-jarvis.ps1").read_text(encoding="utf-8")

        self.assertIn("check-desktop-python-deps.ps1", source)
        self.assertIn("pip install", source)
        self.assertIn("npm.Source install", source)
        self.assertIn("docker-compose.local-models.yml", source)
        self.assertIn("compose -f docker-compose.local-models.yml config", source)
        self.assertIn(".\\run-jarvis.cmd", source)

    def test_run_script_launches_package_or_dev_with_docker_env(self) -> None:
        source = (ROOT / "run-jarvis.ps1").read_text(encoding="utf-8")

        self.assertIn("JARVIS_DOCKER_AUTOSTART", source)
        self.assertIn("JARVIS_DOCKER_PROFILE", source)
        self.assertIn("JARVIS_DOCKER_INCLUDE_VOICE", source)
        self.assertIn("JARVIS_MINIMIZE_TO_TRAY", source)
        self.assertIn("release/win-unpacked/JARVIS.exe", source)
        self.assertIn("npm.Source run desktop:dev", source)

    def test_stop_script_stops_compose_and_owned_desktop_processes(self) -> None:
        source = (ROOT / "stop-jarvis.ps1").read_text(encoding="utf-8")

        self.assertIn("scripts/jarvis-docker-models.ps1", source)
        self.assertIn("Get-CimInstance Win32_Process", source)
        self.assertIn("Stop-Process", source)
        self.assertIn("jarvis_cli\\.desktop_entry", source)
        self.assertIn("jarvis-backend", source)
        self.assertIn("Resolve-Path $RepoRoot", source)

    def test_package_json_exposes_plain_jarvis_scripts(self) -> None:
        package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
        scripts = package["scripts"]

        self.assertEqual(scripts["jarvis:setup"], "powershell -ExecutionPolicy Bypass -File setup-jarvis.ps1")
        self.assertEqual(scripts["jarvis:run"], "powershell -ExecutionPolicy Bypass -File run-jarvis.ps1")
        self.assertEqual(scripts["jarvis:stop"], "powershell -ExecutionPolicy Bypass -File stop-jarvis.ps1")


if __name__ == "__main__":
    unittest.main()
