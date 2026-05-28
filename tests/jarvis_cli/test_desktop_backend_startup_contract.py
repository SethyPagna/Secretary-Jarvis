import os
import subprocess
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class DesktopBackendStartupContractTests(unittest.TestCase):
    def test_desktop_entry_preflight_reports_missing_dependencies_without_server_import(self) -> None:
        from jarvis_cli.desktop_entry import run_preflight

        result = run_preflight(
            host="127.0.0.1",
            port=8765,
            allow_public=False,
            check_port=False,
            find_spec=lambda name: object() if name != "fastapi" else None,
        )

        self.assertFalse(result["ok"])
        self.assertIn("fastapi", result["missing_modules"])
        self.assertIn("pip install -e .", " ".join(result["actions"]))

    def test_desktop_entry_preflight_rejects_public_bind_without_flag(self) -> None:
        from jarvis_cli.desktop_entry import run_preflight

        result = run_preflight(
            host="0.0.0.0",
            port=8765,
            allow_public=False,
            check_port=False,
            find_spec=lambda _name: object(),
        )

        self.assertFalse(result["ok"])
        self.assertIn("public bind", " ".join(result["issues"]).lower())

    def test_desktop_entry_preflight_cli_exits_quickly_with_json(self) -> None:
        completed = subprocess.run(
            [
                sys.executable,
                "-m",
                "jarvis_cli.desktop_entry",
                "--preflight",
                "--port",
                "0",
            ],
            capture_output=True,
            cwd=ROOT,
            text=True,
            timeout=6,
        )

        combined = f"{completed.stdout}\n{completed.stderr}".lower()
        self.assertIn('"ok"', completed.stdout)
        self.assertNotIn("lazy-installing", combined)
        self.assertNotIn("pip install timed out", combined)

    def test_packaged_backend_smoke_runs_preflight_before_launch(self) -> None:
        source = (ROOT / "scripts" / "smoke-desktop-backend.ps1").read_text(
            encoding="utf-8",
        )

        self.assertIn("--preflight", source)
        self.assertIn("preflight failed before launch", source)
        self.assertLess(source.index("$preflight = & $BackendCommand"), source.index("Start-Process"))

    def test_embedded_web_server_import_never_lazy_installs(self) -> None:
        env = {
            **os.environ,
            "JARVIS_DESKTOP_EMBEDDED": "1",
            "JARVIS_DISABLE_LAZY_INSTALLS": "1",
        }

        completed = subprocess.run(
            [
                sys.executable,
                "-c",
                (
                    "import importlib; "
                    "importlib.import_module('jarvis_cli.web_server'); "
                    "print('imported')"
                ),
            ],
            capture_output=True,
            env=env,
            text=True,
            timeout=6,
        )

        combined = f"{completed.stdout}\n{completed.stderr}".lower()
        self.assertNotIn("lazy-installing", combined)
        self.assertNotIn("pip install timed out", combined)
        self.assertTrue(
            completed.returncode == 0 or "web ui requires fastapi" in combined,
            combined,
        )


if __name__ == "__main__":
    unittest.main()
