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
        self.assertNotIn("hermes", scripts)
        self.assertNotIn("cli", data["project"].get("optional-dependencies", {}))
        self.assertFalse(any("prompt_toolkit" in dep for dep in data["project"]["dependencies"]))
        self.assertNotIn("cli", data["tool"]["setuptools"]["py-modules"])
        self.assertIn("jarvis_cli", data["tool"]["setuptools"]["packages"]["find"]["include"])

    def test_desktop_backend_entrypoint_imports(self) -> None:
        entry = importlib.import_module("jarvis_cli.desktop_entry")

        self.assertTrue(callable(entry.main))

    def test_jarvis_cli_package_imports(self) -> None:
        jarvis_cli = importlib.import_module("jarvis_cli")

        self.assertEqual(jarvis_cli.__product_name__, "JARVIS")
        self.assertTrue(jarvis_cli.__version__)

    def test_jarvis_home_uses_jarvis_env_var_and_default(self) -> None:
        constants = importlib.import_module("jarvis_constants")

        with tempfile.TemporaryDirectory() as tmp_dir:
            previous_jarvis = os.environ.get("JARVIS_HOME")
            previous_hermes = os.environ.get("HERMES_HOME")
            try:
                os.environ["JARVIS_HOME"] = tmp_dir
                os.environ["HERMES_HOME"] = str(Path(tmp_dir) / "wrong")
                self.assertEqual(constants.get_jarvis_home(), Path(tmp_dir))

                del os.environ["JARVIS_HOME"]
                del os.environ["HERMES_HOME"]
                self.assertEqual(constants.get_jarvis_home(), Path.home() / ".jarvis")
            finally:
                if previous_jarvis is None:
                    os.environ.pop("JARVIS_HOME", None)
                else:
                    os.environ["JARVIS_HOME"] = previous_jarvis
                if previous_hermes is None:
                    os.environ.pop("HERMES_HOME", None)
                else:
                    os.environ["HERMES_HOME"] = previous_hermes

    def test_default_soul_seed_is_jarvis_identity(self) -> None:
        soul_path = ROOT / "jarvis_cli" / "data" / "default_SOUL.md"

        content = soul_path.read_text(encoding="utf-8")
        self.assertIn("JARVIS", content)
        self.assertIn("Just A Rather Very Intelligent System", content)
        self.assertNotIn("You are Hermes Agent", content)


if __name__ == "__main__":
    unittest.main()
