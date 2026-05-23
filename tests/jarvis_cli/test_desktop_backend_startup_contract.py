import os
import subprocess
import sys
import unittest


class DesktopBackendStartupContractTests(unittest.TestCase):
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
