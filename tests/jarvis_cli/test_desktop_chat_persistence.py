import tempfile
import unittest
import json
import types
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
    def test_explicit_dead_local_provider_falls_back_to_cloud_runtime(self) -> None:
        created_agents = []

        class FakeAgent:
            def __init__(self, **kwargs):
                self.kwargs = kwargs
                self.model = kwargs["model"]
                self.last_message = ""
                self.session_input_tokens = 4
                self.session_output_tokens = 5
                created_agents.append(self)

            def chat(self, message, stream_callback=None):
                self.last_message = message
                if stream_callback:
                    stream_callback("JARVIS live chat OK.")
                return "JARVIS live chat OK."

        with tempfile.TemporaryDirectory() as temp_dir, patch.object(
            desktop_chat,
            "_endpoint_has_chat_completions",
            return_value=False,
        ), patch.object(
            desktop_chat,
            "_desktop_cloud_runtime_from_env",
            return_value=(
                {
                    "provider": "custom",
                    "requested_provider": "mistral_api",
                    "api_mode": "chat_completions",
                    "base_url": "https://api.mistral.ai/v1",
                    "api_key": "sk-test",
                },
                "mistral-small-latest",
            ),
        ), patch.object(
            desktop_chat,
            "_create_session_db",
            return_value=None,
        ), patch(
            "jarvis_cli.config.load_config",
            return_value={"providers": {}},
        ), patch(
            "jarvis_cli.runtime_provider.resolve_runtime_provider",
            return_value={
                "provider": "custom",
                "base_url": "http://127.0.0.1:8080/v1",
                "api_key": "no-key-required",
                "api_mode": "chat_completions",
            },
        ):
            fake_runtime = types.ModuleType("agent.runtime")
            fake_runtime.AIAgent = FakeAgent
            with patch.dict("sys.modules", {"agent.runtime": fake_runtime}):
                result = desktop_chat.run_desktop_chat_turn(
                    "Say OK",
                    jarvis_home=Path(temp_dir),
                    model="qwen3.5-9b-q4_k_m",
                    provider="llama_cpp_local",
                )

        self.assertEqual(result.response, "JARVIS live chat OK.")
        self.assertEqual(created_agents[0].kwargs["base_url"], "https://api.mistral.ai/v1")
        self.assertEqual(created_agents[0].kwargs["model"], "mistral-small-latest")
        self.assertEqual(created_agents[0].last_message, "Say OK")
        self.assertTrue(created_agents[0].kwargs["skip_context_files"])
        self.assertFalse(created_agents[0].kwargs["load_soul_identity"])
        self.assertEqual(created_agents[0].kwargs["max_iterations"], 8)
        self.assertEqual(created_agents[0].kwargs["tool_delay"], 0.0)
        self.assertEqual(created_agents[0].kwargs["enabled_toolsets"], [])
        self.assertIn("Desktop voice/chat contract", created_agents[0].kwargs["ephemeral_system_prompt"])
        self.assertNotIn("User request:", created_agents[0].last_message)

    def test_desktop_tool_gate_keeps_plain_voice_turns_lean(self) -> None:
        self.assertFalse(desktop_chat._desktop_prompt_needs_tools("Can you hear me?"))
        self.assertFalse(desktop_chat._desktop_prompt_needs_tools("What is your name?"))
        self.assertTrue(desktop_chat._desktop_prompt_needs_tools("Search the web for this."))
        self.assertTrue(desktop_chat._desktop_prompt_needs_tools("Send that on Telegram."))
        self.assertTrue(desktop_chat._desktop_prompt_needs_tools("Read the attached file."))

    def test_desktop_local_qwen_turns_disable_thinking_without_persisting_prefix(self) -> None:
        runtime = {
            "provider": "custom",
            "requested_provider": "llama_cpp_local",
            "base_url": "http://127.0.0.1:8081/v1",
        }

        self.assertEqual(
            desktop_chat._desktop_model_prompt("Can you hear me?", runtime, "qwen3.5-9b-q4_k_m"),
            "/no_think\nCan you hear me?",
        )
        overrides = desktop_chat._desktop_request_overrides(runtime, "qwen3.5-9b-q4_k_m")
        self.assertEqual(
            overrides["extra_body"]["chat_template_kwargs"],
            {"enable_thinking": False},
        )
        self.assertEqual(overrides["extra_body"]["reasoning"], {"enabled": False})
        self.assertFalse(overrides["extra_body"]["include_reasoning"])

    def test_desktop_cloud_turns_do_not_receive_qwen_no_think_controls(self) -> None:
        runtime = {"provider": "custom", "base_url": "https://api.mistral.ai/v1"}

        self.assertEqual(
            desktop_chat._desktop_model_prompt("Can you hear me?", runtime, "mistral-small-latest"),
            "Can you hear me?",
        )
        self.assertEqual(
            desktop_chat._desktop_request_overrides(runtime, "mistral-small-latest"),
            {},
        )

    def test_direct_desktop_payload_is_compact_streaming_local_qwen_request(self) -> None:
        runtime = {
            "provider": "custom",
            "requested_provider": "llama_cpp_local",
            "api_mode": "chat_completions",
            "base_url": "http://127.0.0.1:8081/v1",
        }

        self.assertTrue(
            desktop_chat._direct_desktop_chat_available(
                runtime,
                [],
                "qwen3.5-9b-q4_k_m",
            )
        )
        self.assertFalse(
            desktop_chat._direct_desktop_chat_available(
                runtime,
                ["web"],
                "qwen3.5-9b-q4_k_m",
            )
        )
        payload = desktop_chat._direct_desktop_chat_payload(
            model="qwen3.5-9b-q4_k_m",
            prompt="Can you hear me?",
            system_prompt="JARVIS direct system",
            runtime=runtime,
            stream=True,
            max_tokens=128,
        )

        self.assertEqual(payload["messages"][0], {"role": "system", "content": "JARVIS direct system"})
        self.assertEqual(payload["messages"][1]["content"], "/no_think\nCan you hear me?")
        self.assertTrue(payload["stream"])
        self.assertEqual(payload["max_tokens"], 128)
        self.assertEqual(payload["chat_template_kwargs"], {"enable_thinking": False})

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

    def test_gateway_session_turn_uses_platform_source_and_state(self) -> None:
        fake_db = FakeSessionDB()

        with tempfile.TemporaryDirectory() as temp_dir, patch.object(
            desktop_chat,
            "_create_session_db",
            return_value=fake_db,
        ):
            home = Path(temp_dir)
            session_id = desktop_chat._record_desktop_session_turn(
                home,
                prompt="Can you send this through Telegram?",
                response="JARVIS routed this Telegram request through the team.",
                input_tokens=24,
                output_tokens=15,
                model="qwen3.5-9b-q4_k_m",
                provider="llama.cpp",
                active_soul="jarvis",
                delegate_souls=["friday"],
                surface="gateway",
                platform="telegram",
                session_key="123456",
                user_id="42",
            )

            state = desktop_chat._read_json(
                home / "gateway" / "sessions" / "telegram" / "123456.json",
            )

        self.assertIsNotNone(session_id)
        self.assertTrue(str(session_id).startswith("telegram-"))
        self.assertEqual(fake_db.sessions[0][1], "telegram")
        self.assertEqual(fake_db.sessions[0][2]["user_id"], "42")
        self.assertEqual(fake_db.sessions[0][2]["model_config"]["surface"], "gateway")
        self.assertEqual(fake_db.sessions[0][2]["model_config"]["platform"], "telegram")
        self.assertEqual(fake_db.sessions[0][2]["model_config"]["session_key"], "123456")
        self.assertEqual(state["surface"], "gateway")
        self.assertEqual(state["platform"], "telegram")
        self.assertEqual(state["session_key"], "123456")

    def test_desktop_token_stats_include_surface_and_team_route(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            home = Path(temp_dir)
            desktop_chat._record_desktop_tokens(
                home,
                input_tokens=40,
                output_tokens=20,
                model="qwen3.5-9b-q4_k_m",
                provider="llama.cpp",
                active_soul="argus",
                delegate_souls=["jarvis", "sentinel"],
                surface="gateway",
                platform="telegram",
                session_key="123456",
                user_id="42",
            )

            stats = desktop_chat._read_json(home / "stats.json")

        current = stats["desktop_current_tokens"]
        self.assertEqual(stats["tokens_total_lifetime"], 60)
        self.assertEqual(current["surface"], "gateway")
        self.assertEqual(current["platform"], "telegram")
        self.assertEqual(current["session_key"], "123456")
        self.assertEqual(current["user_id"], "42")
        self.assertEqual(current["active_soul"], "argus")
        self.assertEqual(current["delegate_souls"], ["jarvis", "sentinel"])

    def test_status_counts_recent_desktop_and_gateway_session_files(self) -> None:
        from jarvis_cli.web_server import _desktop_surface_active_sessions

        with tempfile.TemporaryDirectory() as temp_dir:
            home = Path(temp_dir)
            desktop_state = home / "desktop" / "session.json"
            telegram_state = home / "gateway" / "sessions" / "telegram" / "123456.json"
            stale_state = home / "gateway" / "sessions" / "telegram" / "old.json"
            desktop_state.parent.mkdir(parents=True)
            telegram_state.parent.mkdir(parents=True)
            desktop_state.write_text(
                json.dumps({"session_id": "desktop-live", "updated_at": 1000.0}),
                encoding="utf-8",
            )
            telegram_state.write_text(
                json.dumps({"session_id": "telegram-live", "updated_at": 990.0}),
                encoding="utf-8",
            )
            stale_state.write_text(
                json.dumps({"session_id": "telegram-stale", "updated_at": 100.0}),
                encoding="utf-8",
            )

            count = _desktop_surface_active_sessions(home, max_age_seconds=60, now=1001.0)

        self.assertEqual(count, 2)


if __name__ == "__main__":
    unittest.main()
