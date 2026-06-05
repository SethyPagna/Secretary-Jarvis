import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from jarvis_cli import desktop_chat


class FakeSessionDB:
    def __init__(self) -> None:
        self.sessions: list[tuple[str, str, dict]] = []
        self.messages: list[tuple[str, str, str, int]] = []
        self.token_updates: list[tuple[str, dict]] = []
        self.closed = False

    def create_session(self, session_id: str, source: str, **kwargs):
        self.sessions.append((session_id, source, kwargs))
        return session_id

    def append_message(self, session_id: str, role: str, content: str, token_count: int = 0, **_kwargs):
        self.messages.append((session_id, role, content, token_count))
        return len(self.messages)

    def update_token_counts(self, session_id: str, **kwargs):
        self.token_updates.append((session_id, kwargs))

    def close(self) -> None:
        self.closed = True


class DesktopChatPersistenceTests(unittest.TestCase):
    def test_sessions_page_has_desktop_source_mapping(self) -> None:
        source = (
            Path(__file__).resolve().parents[2]
            / "desktop"
            / "web"
            / "src"
            / "pages"
            / "SessionsPage.tsx"
        ).read_text(encoding="utf-8")

        self.assertIn('desktop: { icon: MessageSquare, color: "text-primary" }', source)

    def test_record_desktop_session_turn_writes_shared_session_transcript(self) -> None:
        fake_db = FakeSessionDB()

        with tempfile.TemporaryDirectory() as temp_dir, patch.object(
            desktop_chat,
            "_create_session_db",
            return_value=fake_db,
        ):
            session_id = desktop_chat._record_desktop_session_turn(
                Path(temp_dir),
                prompt="Can you summarize this meeting?",
                response="Friday can summarize the meeting and extract actions.",
                input_tokens=32,
                output_tokens=18,
                model="qwen3.5-9b-q4_k_m",
                provider="llama.cpp",
                active_soul="friday",
                delegate_souls=["jarvis", "oracle"],
            )

        self.assertIsNotNone(session_id)
        self.assertEqual(fake_db.sessions[0][1], "desktop")
        self.assertEqual(fake_db.sessions[0][2]["model"], "qwen3.5-9b-q4_k_m")
        self.assertEqual(fake_db.sessions[0][2]["model_config"]["active_soul"], "friday")
        self.assertEqual(fake_db.messages[0][1:], ("user", "Can you summarize this meeting?", 32))
        self.assertEqual(fake_db.messages[1][1:], ("assistant", "Friday can summarize the meeting and extract actions.", 18))
        self.assertEqual(fake_db.token_updates[0][1]["input_tokens"], 32)
        self.assertEqual(fake_db.token_updates[0][1]["output_tokens"], 18)
        self.assertEqual(fake_db.token_updates[0][1]["api_call_count"], 1)
        self.assertTrue(fake_db.closed)

    def test_desktop_session_id_is_reused_for_rolling_voice_chat(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            home = Path(temp_dir)
            first = desktop_chat._get_or_create_desktop_session_id(
                home,
                model="qwen",
                provider="llama.cpp",
                active_soul="jarvis",
            )
            second = desktop_chat._get_or_create_desktop_session_id(
                home,
                model="qwen",
                provider="llama.cpp",
                active_soul="argus",
                delegate_souls=["jarvis"],
            )

            self.assertEqual(first, second)
            state = desktop_chat._read_json(home / "desktop" / "session.json")
            self.assertEqual(state["active_soul"], "argus")
            self.assertEqual(state["delegate_souls"], ["jarvis"])


if __name__ == "__main__":
    unittest.main()
