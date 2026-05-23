import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class DesktopPackagingContractTests(unittest.TestCase):
    def test_build_script_smokes_packaged_backend_before_installer(self) -> None:
        build_script = (ROOT / "scripts" / "build-desktop.ps1").read_text(
            encoding="utf-8",
        )

        self.assertIn("check-desktop-python-deps.ps1", build_script)
        self.assertIn("[switch]$SkipSmoke", build_script)
        self.assertIn("smoke-desktop-backend.ps1", build_script)
        self.assertIn("$backendLaunch", build_script)
        self.assertIn("jarvis-backend.exe", build_script)
        self.assertIn("jarvis-backend", build_script)
        self.assertLess(
            build_script.index("smoke-desktop-backend.ps1"),
            build_script.index("desktop:pack"),
        )

    def test_smoke_script_starts_hidden_backend_and_shuts_down(self) -> None:
        smoke_script = (ROOT / "scripts" / "smoke-desktop-backend.ps1").read_text(
            encoding="utf-8",
        )

        self.assertIn("Start-Process", smoke_script)
        self.assertIn("-WindowStyle Hidden", smoke_script)
        self.assertIn("JARVIS_DESKTOP_EMBEDDED", smoke_script)
        self.assertIn("JARVIS_DISABLE_LAZY_INSTALLS", smoke_script)
        self.assertIn("JARVIS_DESKTOP_SHUTDOWN_TOKEN", smoke_script)
        self.assertIn("X-Jarvis-Desktop-Shutdown-Token", smoke_script)
        self.assertIn("[string]$BindHost", smoke_script)
        self.assertNotIn("[string]$Host", smoke_script)
        self.assertIn("/api/status", smoke_script)
        self.assertIn("/api/shutdown", smoke_script)
        self.assertIn("Stop-Process", smoke_script)

    def test_pyinstaller_spec_embeds_runtime_assets(self) -> None:
        spec = (ROOT / "packaging" / "jarvis-backend.spec").read_text(
            encoding="utf-8",
        )

        self.assertIn("jarvis_cli", spec)
        self.assertIn("web_dist", spec)
        self.assertIn("default_SOUL.md", spec)
        self.assertIn("fastapi", spec)
        self.assertIn("uvicorn", spec)
        self.assertIn("pydantic", spec)

    def test_package_json_exposes_build_with_smoke_default(self) -> None:
        package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))

        self.assertIn("desktop:build", package["scripts"])
        self.assertIn("build-desktop.ps1", package["scripts"]["desktop:build"])
        self.assertNotIn("SkipSmoke", package["scripts"]["desktop:build"])

    def test_desktop_python_dependency_check_reports_wheelhouse_recovery(self) -> None:
        checker = (ROOT / "scripts" / "check-desktop-python-deps.ps1").read_text(
            encoding="utf-8",
        )

        self.assertIn("jarvis_cli.desktop_entry", checker)
        self.assertIn("--preflight", checker)
        self.assertIn("PyInstaller", checker)
        self.assertIn("wheelhouse", checker)
        self.assertIn("--no-index", checker)
        self.assertIn("--find-links", checker)
        self.assertIn("prepare-desktop-wheelhouse.ps1", checker)

    def test_desktop_wheelhouse_script_downloads_backend_and_build_deps(self) -> None:
        wheelhouse = (ROOT / "scripts" / "prepare-desktop-wheelhouse.ps1").read_text(
            encoding="utf-8",
        )

        self.assertIn("pip", wheelhouse)
        self.assertIn("download", wheelhouse)
        self.assertIn("pyinstaller", wheelhouse.lower())
        self.assertIn("--prefer-binary", wheelhouse)
        self.assertIn("wheelhouse", wheelhouse)


if __name__ == "__main__":
    unittest.main()
