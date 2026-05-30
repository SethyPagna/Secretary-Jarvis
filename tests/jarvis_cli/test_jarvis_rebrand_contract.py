import importlib
import os
import tempfile
import tomllib
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class JarvisRebrandContractTests(unittest.TestCase):
    def test_pyproject_exposes_desktop_backend_without_standalone_cli(self) -> None:
        data = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))

        self.assertEqual(data["project"]["name"], "jarvis-agent")
        self.assertIn("JARVIS", data["project"]["description"])
        scripts = data["project"]["scripts"]
        self.assertEqual(scripts["jarvis-desktop-backend"], "jarvis_cli.desktop_entry:main")
        self.assertNotIn("jarvis", scripts)
        self.assertNotIn("jarvis-agent", scripts)
        self.assertNotIn("jarvis", scripts)
        self.assertNotIn("cli", data["project"].get("optional-dependencies", {}))
        self.assertNotIn("tts-premium", data["project"].get("optional-dependencies", {}))
        self.assertFalse(
            any(
                "elevenlabs" in dep.lower()
                for deps in data["project"].get("optional-dependencies", {}).values()
                for dep in deps
            )
        )
        self.assertFalse(any("prompt_toolkit" in dep for dep in data["project"]["dependencies"]))
        self.assertTrue(any(dep.startswith("fastapi==") for dep in data["project"]["dependencies"]))
        self.assertTrue(any(dep.startswith("uvicorn[standard]==") for dep in data["project"]["dependencies"]))
        self.assertNotIn("cli", data["tool"]["setuptools"]["py-modules"])
        self.assertIn("jarvis_cli", data["tool"]["setuptools"]["packages"]["find"]["include"])

    def test_uv_lock_matches_desktop_package_contract(self) -> None:
        lock = tomllib.loads((ROOT / "uv.lock").read_text(encoding="utf-8"))
        package = next(pkg for pkg in lock["package"] if pkg["source"].get("editable") == ".")

        self.assertFalse(any(pkg["name"] == "elevenlabs" for pkg in lock["package"]))
        self.assertFalse(any(pkg["name"] == "prompt-toolkit" for pkg in lock["package"]))
        self.assertFalse(any(pkg["name"] == "simple-term-menu" for pkg in lock["package"]))
        self.assertEqual(package["name"], "jarvis-agent")
        dependencies = {
            (dep["name"], tuple(dep.get("extra", [])))
            for dep in package["dependencies"]
        }
        self.assertIn(("fastapi", ()), dependencies)
        self.assertIn(("uvicorn", ("standard",)), dependencies)
        self.assertNotIn(("prompt-toolkit", ()), dependencies)

        optional = package.get("optional-dependencies", {})
        self.assertNotIn("cli", optional)
        self.assertNotIn("tts-premium", optional)
        self.assertEqual(optional.get("web", []), [])

        metadata = package["metadata"]
        requires_dist = metadata["requires-dist"]
        self.assertTrue(
            any(req["name"] == "fastapi" and "marker" not in req for req in requires_dist)
        )
        self.assertTrue(
            any(req["name"] == "uvicorn" and "marker" not in req for req in requires_dist)
        )
        self.assertFalse(any(req["name"] == "elevenlabs" for req in requires_dist))
        self.assertFalse(
            any(req["name"] == "jarvis-agent" and "marker" not in req for req in requires_dist)
        )
        self.assertNotIn("cli", metadata["provides-extras"])
        self.assertNotIn("tts-premium", metadata["provides-extras"])

    def test_frontend_lock_preserves_canonical_third_party_parser_package_names(self) -> None:
        package_lock = (ROOT / "web" / "package-lock.json").read_text(encoding="utf-8")

        self.assertIn('"hermes-parser": "^0.25.1"', package_lock)
        self.assertIn('"node_modules/hermes-parser"', package_lock)
        self.assertIn('"node_modules/hermes-estree"', package_lock)

    def test_desktop_backend_entrypoint_imports(self) -> None:
        entry = importlib.import_module("jarvis_cli.desktop_entry")

        self.assertTrue(callable(entry.main))

    def test_jarvis_cli_package_imports(self) -> None:
        jarvis_cli = importlib.import_module("jarvis_cli")

        self.assertEqual(jarvis_cli.__product_name__, "JARVIS")
        self.assertTrue(jarvis_cli.__version__)

    def test_jarvis_home_uses_jarvis_env_var_and_default(self) -> None:
        constants = importlib.import_module("jarvis_cli.constants")

        with tempfile.TemporaryDirectory() as tmp_dir:
            previous_jarvis = os.environ.get("JARVIS_HOME")
            try:
                os.environ["JARVIS_HOME"] = tmp_dir
                self.assertEqual(constants.get_jarvis_home(), Path(tmp_dir))

                del os.environ["JARVIS_HOME"]
                self.assertEqual(constants.get_jarvis_home(), Path.home() / ".jarvis")
            finally:
                if previous_jarvis is None:
                    os.environ.pop("JARVIS_HOME", None)
                else:
                    os.environ["JARVIS_HOME"] = previous_jarvis

    def test_default_soul_seed_is_jarvis_identity(self) -> None:
        soul_path = ROOT / "jarvis_cli" / "data" / "default_SOUL.md"

        content = soul_path.read_text(encoding="utf-8")
        self.assertIn("JARVIS", content)
        self.assertIn("Just A Rather Very Intelligent System", content)
        self.assertIn("You are JARVIS", content)
        self.assertIn("FRIDAY", content)
        self.assertNotIn("Hermes", content)


if __name__ == "__main__":
    unittest.main()
