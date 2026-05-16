from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

try:
    from .vision import VisionService
except ImportError:  # Allows running this file directly from services/brain.
    from vision import VisionService


class VisionServiceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.project_root = Path(__file__).resolve().parents[2]
        self.secretary_root = self.project_root.parent
        self.service = VisionService(self.project_root, self.secretary_root)

    def test_analyze_existing_local_file_without_hosted_inference(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            fixture = Path(directory) / "fixture.png"
            fixture.write_bytes(b"\x89PNG\r\n\x1a\n")

            result = self.service.analyze_image(str(fixture))

            self.assertEqual(result["status"], "ready")
            self.assertEqual(result["file"]["name"], "fixture.png")
            self.assertIn("No hosted vision inference was used.", result["observations"])

    def test_screen_and_camera_capture_are_dry_run_only(self) -> None:
        screen = self.service.capture_screen_dry_run()
        camera = self.service.capture_camera_dry_run()

        self.assertEqual(screen["status"], "requires-approval")
        self.assertFalse(screen["captured"])
        self.assertEqual(camera["status"], "requires-approval")
        self.assertFalse(camera["captured"])


if __name__ == "__main__":
    unittest.main()
