import importlib
import os
import tempfile
import tomllib
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class JarvisRebrandContractTests(unittest.TestCase):
    def test_pyproject_exposes_jarvis_package_and_cli(self) -> None:
        data = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))

        self.assertEqual(data["project"]["name"], "jarvis-agent")
        self.assertIn("JARVIS", data["project"]["description"])
        self.assertEqual(data["project"]["scripts"]["jarvis"], "jarvis_cli.main:main")
        self.assertNotIn("hermes", data["project"]["scripts"])
        self.assertIn("jarvis_cli", data["tool"]["setuptools"]["packages"]["find"]["include"])

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
