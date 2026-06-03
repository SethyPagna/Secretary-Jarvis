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
        self.assertIn("selectedNodeId", page_source)
        self.assertIn("updateSelectedNode", page_source)
        self.assertIn("removeSelectedNode", page_source)
        self.assertIn("WORKFLOW_CANVAS_STORAGE_KEY", page_source)
        self.assertIn("loadWorkflowCanvasState", page_source)
        self.assertIn("normalizeStoredWorkflowNode", page_source)
        self.assertIn("window.localStorage.setItem", page_source)
        self.assertIn("workflowIconForLabel(label)", page_source)
        self.assertIn("Node name", page_source)
        self.assertIn("Purpose", page_source)
        self.assertIn("Remove node", page_source)
        self.assertIn("Zoom workflow in", page_source)
        self.assertIn("Zoom workflow out", page_source)
        self.assertIn("manual, scheduled, platform trigger", page_source)


if __name__ == "__main__":
    unittest.main()
