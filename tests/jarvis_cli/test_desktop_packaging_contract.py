import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class DesktopPackagingContractTests(unittest.TestCase):
    def test_build_script_smokes_packaged_backend_before_installer(self) -> None:
        build_script = (ROOT / "ops" / "scripts" / "build" / "build-desktop.ps1").read_text(
            encoding="utf-8",
        )

        self.assertIn("check-desktop-python-deps.ps1", build_script)
        self.assertIn('Join-Path $PSScriptRoot "..\\..\\.."', build_script)
        self.assertIn("[switch]$SkipSmoke", build_script)
        self.assertIn("smoke-desktop-backend.ps1", build_script)
        self.assertIn("$backendLaunch", build_script)
        self.assertIn("jarvis-backend.exe", build_script)
        self.assertIn("jarvis-backend", build_script)
        self.assertIn("Invoke-Checked", build_script)
        self.assertIn("$LASTEXITCODE", build_script)
        self.assertLess(
            build_script.index("smoke-desktop-backend.ps1"),
            build_script.index("desktop:pack"),
        )

    def test_build_script_handles_vite_direct_embedded_output(self) -> None:
        build_script = (ROOT / "ops" / "scripts" / "build" / "build-desktop.ps1").read_text(
            encoding="utf-8",
        )
        vite_config = (ROOT / "desktop" / "web" / "config" / "vite.config.ts").read_text(encoding="utf-8")

        self.assertIn('outDir: "../../jarvis_cli/web_dist"', vite_config)
        self.assertIn("$viteEmbeddedDist", build_script)
        self.assertIn("Vite already emitted", build_script)
        self.assertIn("desktop/web/dist", build_script)

    def test_smoke_script_starts_hidden_backend_and_shuts_down(self) -> None:
        smoke_script = (ROOT / "ops" / "scripts" / "checks" / "smoke-desktop-backend.ps1").read_text(
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
        self.assertIn('Join-Path $PSScriptRoot "..\\..\\.."', smoke_script)

    def test_pyinstaller_spec_embeds_runtime_assets(self) -> None:
        spec = (ROOT / "ops" / "packaging" / "jarvis-backend.spec").read_text(
            encoding="utf-8",
        )

        self.assertIn("repo_root = Path(SPECPATH).parents[1]", spec)
        self.assertNotIn("repo_root = Path(SPECPATH).parent\n", spec)
        self.assertIn("jarvis_cli", spec)
        self.assertIn("web_dist", spec)
        self.assertIn("default_SOUL.md", spec)
        self.assertIn('"souls"', spec)
        self.assertIn("fastapi", spec)
        self.assertIn("uvicorn", spec)
        self.assertIn("pydantic", spec)
        self.assertIn("console=True", spec)

    def test_package_json_exposes_build_with_smoke_default(self) -> None:
        package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))

        self.assertIn("desktop:check", package["scripts"])
        self.assertIn("check-production.ps1", package["scripts"]["desktop:check"])
        self.assertIn("desktop:build", package["scripts"])
        self.assertIn("build-desktop.ps1", package["scripts"]["desktop:build"])
        self.assertNotIn("SkipSmoke", package["scripts"]["desktop:build"])
        self.assertFalse(package["build"]["win"]["signAndEditExecutable"])
        self.assertEqual(package["build"]["afterPack"], "ops/scripts/build/after-pack-icon.cjs")
        self.assertNotIn("nsis", package["build"])
        self.assertIn("portable", package["build"]["win"]["target"])
        self.assertNotIn("nsis", package["build"]["win"]["target"])
        self.assertIn({"from": "desktop/assets", "to": "assets"}, package["build"]["extraResources"])
        self.assertIn({"from": "skills", "to": "skills"}, package["build"]["extraResources"])
        self.assertIn({"from": "optional-skills", "to": "optional-skills"}, package["build"]["extraResources"])
        self.assertNotIn(
            {"from": "docker-compose.local-models.yml", "to": "docker-compose.local-models.yml"},
            package["build"]["extraResources"],
        )

    def test_after_pack_hook_applies_orb_icon_without_win_code_sign(self) -> None:
        hook = (ROOT / "ops" / "scripts" / "build" / "after-pack-icon.cjs").read_text(encoding="utf-8")

        self.assertIn("rcedit-x64.exe", hook)
        self.assertIn("--set-icon", hook)
        self.assertIn("assets", hook)
        self.assertIn("icon.ico", hook)
        self.assertIn("FileDescription", hook)

    def test_vite_build_uses_relative_asset_paths_for_file_fallback(self) -> None:
        vite_config = (ROOT / "desktop" / "web" / "config" / "vite.config.ts").read_text(encoding="utf-8")
        built_index = (ROOT / "jarvis_cli" / "web_dist" / "index.html").read_text(
            encoding="utf-8",
        )

        self.assertIn('base: "./"', vite_config)
        if 'src="/assets/' in built_index or 'href="/assets/' in built_index:
            self.fail("Built desktop index still has absolute /assets paths")

    def test_desktop_python_dependency_check_reports_wheelhouse_recovery(self) -> None:
        checker = (ROOT / "ops" / "scripts" / "checks" / "check-desktop-python-deps.ps1").read_text(
            encoding="utf-8",
        )

        self.assertIn("jarvis_cli.desktop_entry", checker)
        self.assertIn("--preflight", checker)
        self.assertIn("PyInstaller", checker)
        self.assertIn("kokoro", checker)
        self.assertIn("faster_whisper", checker)
        self.assertIn("wheelhouse", checker)
        self.assertIn("--no-index", checker)
        self.assertIn("--find-links", checker)
        self.assertIn("prepare-desktop-wheelhouse.ps1", checker)
        self.assertIn('Join-Path $PSScriptRoot "..\\..\\.."', checker)

    def test_desktop_wheelhouse_script_downloads_backend_and_build_deps(self) -> None:
        wheelhouse = (ROOT / "ops" / "scripts" / "build" / "prepare-desktop-wheelhouse.ps1").read_text(
            encoding="utf-8",
        )

        self.assertIn("pip", wheelhouse)
        self.assertIn("download", wheelhouse)
        self.assertIn("pyinstaller", wheelhouse.lower())
        self.assertIn("--prefer-binary", wheelhouse)
        self.assertIn("wheelhouse", wheelhouse)
        self.assertIn('Join-Path $PSScriptRoot "..\\..\\.."', wheelhouse)

    def test_production_check_runs_contracts_build_preflight_and_process_guard(self) -> None:
        checker = (ROOT / "ops" / "scripts" / "checks" / "check-production.ps1").read_text(
            encoding="utf-8",
        )

        self.assertIn("test_repository_layout_contract", checker)
        self.assertIn("test_desktop_packaging_contract", checker)
        self.assertIn("test_runtime_smoke", checker)
        self.assertIn("Test-NodeRuntimeScripts", checker)
        self.assertIn("desktop/electron/main.js", checker)
        self.assertIn("desktop/electron/preload.js", checker)
        self.assertIn("ops/scripts/checks/whatsapp-bridge/bridge.mjs", checker)
        self.assertIn("skills/creative/p5js/scripts/export-frames.js", checker)
        self.assertIn("--check", checker)
        self.assertIn("npm.cmd --prefix desktop/web run build", checker)
        self.assertIn("Resolve-DesktopPython", checker)
        self.assertIn('@("3.11", "3.12")', checker)
        self.assertIn(' "-$version"', checker)
        self.assertIn("check-desktop-python-deps.ps1", checker)
        self.assertIn("-Python $desktopPython", checker)
        self.assertIn("desktop/release/JARVIS 1.0.0.exe", checker)
        self.assertIn("Test-OwnedRuntimeProcesses", checker)
        self.assertIn('Join-Path $PSScriptRoot "..\\..\\.."', checker)


if __name__ == "__main__":
    unittest.main()
