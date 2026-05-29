from __future__ import annotations

import subprocess
import sys
import tomllib
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]

ROOT_FILE_ALLOWLIST = {
    ".env.example",
    ".gitattributes",
    ".gitignore",
    "AGENTS.md",
    "LICENSE",
    "MANIFEST.in",
    "README.md",
    "cli.py",
    "jarvis_bootstrap.py",
    "jarvis_constants.py",
    "jarvis_logging.py",
    "jarvis_state.py",
    "jarvis_time.py",
    "model_tools.py",
    "package-lock.json",
    "package.json",
    "pyproject.toml",
    "run-jarvis.cmd",
    "run_agent.py",
    "setup-jarvis.cmd",
    "setup.py",
    "stop-jarvis.cmd",
    "toolset_distributions.py",
    "toolsets.py",
    "utils.py",
    "uv.lock",
}

ROOT_DIR_ALLOWLIST = {
    ".github",
    "acp_adapter",
    "acp_registry",
    "agent",
    "assets",
    "cron",
    "docs",
    "electron",
    "gateway",
    "jarvis_cli",
    "optional-skills",
    "packaging",
    "plugins",
    "providers",
    "run",
    "scripts",
    "skills",
    "tests",
    "tools",
    "vendor",
    "web",
}

ROOT_PY_MODULES = {
    "jarvis_bootstrap",
    "jarvis_constants",
    "jarvis_logging",
    "jarvis_state",
    "jarvis_time",
    "model_tools",
    "run_agent",
    "toolset_distributions",
    "toolsets",
    "utils",
}


def _tracked_paths() -> list[Path]:
    result = subprocess.run(
        ["git", "ls-files"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return [Path(line) for line in result.stdout.splitlines() if line]


def _is_git_ignored(path: str) -> bool:
    result = subprocess.run(
        ["git", "check-ignore", "-q", path],
        cwd=ROOT,
        check=False,
    )
    return result.returncode == 0


class RepositoryLayoutContractTests(unittest.TestCase):
    def test_tracked_root_files_are_intentional(self) -> None:
        tracked_root_files = {
            path.as_posix()
            for path in _tracked_paths()
            if len(path.parts) == 1
        }

        self.assertLessEqual(tracked_root_files, ROOT_FILE_ALLOWLIST)
        self.assertNotIn("CONTRIBUTING.md", tracked_root_files)
        self.assertNotIn("SECURITY.md", tracked_root_files)
        self.assertNotIn("tsconfig.base.json", tracked_root_files)

    def test_tracked_root_directories_are_intentional(self) -> None:
        tracked_root_dirs = {
            path.parts[0]
            for path in _tracked_paths()
            if len(path.parts) > 1
        }

        self.assertLessEqual(tracked_root_dirs, ROOT_DIR_ALLOWLIST)
        self.assertNotIn("locales", tracked_root_dirs)
        self.assertNotIn("runtime", tracked_root_dirs)
        self.assertNotIn("release", tracked_root_dirs)

    def test_root_python_modules_are_still_packaging_entrypoints(self) -> None:
        pyproject = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))
        packaged_modules = set(pyproject["tool"]["setuptools"]["py-modules"])

        self.assertEqual(packaged_modules, ROOT_PY_MODULES)
        for module_name in ROOT_PY_MODULES:
            self.assertTrue((ROOT / f"{module_name}.py").is_file(), module_name)

    def test_policy_and_locale_assets_live_under_package_or_metadata_dirs(self) -> None:
        self.assertTrue((ROOT / ".github" / "CONTRIBUTING.md").is_file())
        self.assertTrue((ROOT / ".github" / "SECURITY.md").is_file())
        self.assertTrue((ROOT / "jarvis_cli" / "data" / "locales" / "en.yaml").is_file())
        self.assertFalse((ROOT / "locales").exists())

    def test_gitignore_keeps_skill_assets_trackable(self) -> None:
        self.assertFalse(_is_git_ignored("skills/creative/p5js/references/export-pipeline.md"))
        self.assertFalse(_is_git_ignored("skills/creative/p5js/scripts/export-frames.js"))
        self.assertFalse(_is_git_ignored("optional-skills/creative/concept-diagrams/examples/wind-turbine-structure.md"))
        self.assertFalse(_is_git_ignored("plugins/jarvis-achievements/dashboard/dist/index.js"))

    def test_gitignore_still_ignores_generated_dependency_and_release_dirs(self) -> None:
        self.assertTrue(_is_git_ignored("node_modules/example-package/index.js"))
        self.assertTrue(_is_git_ignored("web/node_modules/example-package/index.js"))
        self.assertTrue(_is_git_ignored("release/JARVIS 1.0.0.exe"))
        self.assertTrue(_is_git_ignored("runtime/llama.cpp/llama-server.exe"))
        self.assertTrue(_is_git_ignored("jarvis_cli/web_dist/index.html"))
        self.assertTrue(_is_git_ignored("web/public/fonts/Collapse-Regular.woff2"))
        self.assertTrue(_is_git_ignored("web/public/ds-assets/crest.svg"))

    def test_skill_and_plugin_assets_referenced_by_manifests_are_tracked(self) -> None:
        tracked = {path.as_posix() for path in _tracked_paths()}

        self.assertIn("skills/creative/p5js/references/export-pipeline.md", tracked)
        self.assertIn("skills/creative/p5js/scripts/export-frames.js", tracked)
        self.assertIn("optional-skills/creative/concept-diagrams/examples/wind-turbine-structure.md", tracked)
        self.assertIn("plugins/jarvis-achievements/dashboard/dist/index.js", tracked)
        self.assertIn("plugins/jarvis-achievements/dashboard/dist/style.css", tracked)


if __name__ == "__main__":
    unittest.main()
