import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
WEB_ROOT = ROOT / "desktop" / "web"


class DesktopWorkflowContractTests(unittest.TestCase):
    def test_workflow_route_uses_node_builder_surface(self) -> None:
        app_source = (WEB_ROOT / "src" / "App.tsx").read_text(encoding="utf-8")
        page_source = (WEB_ROOT / "src" / "pages" / "CronPage.tsx").read_text(
            encoding="utf-8",
        )

        self.assertIn('"/workflow": CronPage', app_source)
        self.assertIn("Workflow Builder", page_source)
        self.assertIn('const palette = ["Trigger", "LLM", "Soul", "Skill", "HTTP", "File", "TTS", "Approval"]', page_source)
        self.assertIn("JARVIS Router", page_source)
        self.assertIn("Soul: auto-delegate", page_source)
        self.assertIn("manual, scheduled, platform trigger", page_source)


if __name__ == "__main__":
    unittest.main()
