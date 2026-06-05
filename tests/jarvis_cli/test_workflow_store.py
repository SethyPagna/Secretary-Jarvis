import tempfile
import unittest
from pathlib import Path

from jarvis_cli.workflow_store import (
    load_workflow_canvas,
    record_workflow_run,
    run_workflow_canvas,
    save_workflow_canvas,
    workflow_path,
)


class WorkflowStoreTests(unittest.TestCase):
    def test_save_load_and_run_canvas_routes_to_team_soul(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            canvas = save_workflow_canvas(
                home,
                "desktop-canvas",
                {
                    "nodes": [
                        {
                            "id": "trigger",
                            "label": "Trigger",
                            "title": "Incoming Telegram message",
                            "tone": "cyan",
                        },
                        {
                            "id": "router",
                            "label": "JARVIS Router",
                            "title": "Route the request to a coding or messaging soul",
                            "tone": "violet",
                        },
                        {
                            "id": "reply",
                            "label": "Reply",
                            "title": "Send response back to Telegram",
                            "tone": "amber",
                        },
                    ],
                    "selectedNodeId": "router",
                    "zoom": 2.5,
                },
            )

            self.assertTrue(workflow_path(home, "desktop-canvas").exists())
            self.assertEqual(canvas["zoom"], 1.5)
            self.assertEqual(load_workflow_canvas(home, "desktop-canvas")["selectedNodeId"], "router")

            run = run_workflow_canvas(home, "desktop-canvas", canvas)
            self.assertEqual(run.workflow_id, "desktop-canvas")
            self.assertEqual(len(run.executed_nodes), 3)
            self.assertIn("routed through", run.message)
            self.assertEqual(run.team_state["surface"], "workflow")
            self.assertEqual(run.team_state["workflow_id"], "desktop-canvas")

            saved = record_workflow_run(home, "desktop-canvas", canvas, run)
            self.assertIsNotNone(saved["last_run"])
            self.assertEqual(saved["last_run"]["active_soul"]["id"], run.active_soul["id"])


if __name__ == "__main__":
    unittest.main()
