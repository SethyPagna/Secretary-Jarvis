import json
import tempfile
import unittest
from pathlib import Path

from jarvis_cli.shutdown import perform_graceful_shutdown


class ShutdownLifecycleTests(unittest.TestCase):
    def test_perform_graceful_shutdown_persists_session_and_runs_callbacks(self) -> None:
        callback_calls = []

        def cleanup_callback():
            callback_calls.append("cleanup")
            return {"closed": True}

        with tempfile.TemporaryDirectory() as temp_dir:
            home = Path(temp_dir)

            result = perform_graceful_shutdown(
                home,
                session_id="session-test",
                now=lambda: "2026-05-23T12:34:56Z",
                cleanup_callbacks=[("test-cleanup", cleanup_callback)],
            )

            session_path = home / "sessions" / "session-test.shutdown.json"
            clean_marker = home / ".clean_shutdown"
            payload = json.loads(session_path.read_text(encoding="utf-8"))

        self.assertEqual(result["status"], "saved")
        self.assertEqual(result["session_id"], "session-test")
        self.assertIn(str(session_path), result["saved_paths"])
        self.assertIn(str(clean_marker), result["saved_paths"])
        self.assertEqual(callback_calls, ["cleanup"])
        self.assertEqual(result["cleanup"][0]["name"], "test-cleanup")
        self.assertEqual(result["cleanup"][0]["ok"], True)
        self.assertEqual(payload["session_id"], "session-test")
        self.assertEqual(payload["shutdown_at"], "2026-05-23T12:34:56Z")

    def test_perform_graceful_shutdown_records_callback_failures(self) -> None:
        def failing_callback():
            raise RuntimeError("boom")

        with tempfile.TemporaryDirectory() as temp_dir:
            result = perform_graceful_shutdown(
                Path(temp_dir),
                session_id="session-test",
                cleanup_callbacks=[("bad-cleanup", failing_callback)],
            )

        self.assertEqual(result["status"], "saved")
        self.assertEqual(result["cleanup"][0]["ok"], False)
        self.assertIn("boom", result["cleanup"][0]["error"])


if __name__ == "__main__":
    unittest.main()
