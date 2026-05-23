import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from jarvis_cli import runtime_smoke
from jarvis_cli.runtime_smoke import SMOKE_PROMPT, run_runtime_smoke_test


class RuntimeSmokeTests(unittest.TestCase):
    def test_smoke_prompt_disables_reasoning_for_reasoning_models(self) -> None:
        self.assertIn("/no_think", SMOKE_PROMPT)
        self.assertIn("exactly", SMOKE_PROMPT.lower())

    def test_ollama_probe_uses_native_chat_with_think_disabled(self) -> None:
        captured = {}

        def fake_request(url, payload, **kwargs):
            captured["url"] = url
            captured["payload"] = payload
            return {
                "message": {"content": "ready"},
                "eval_count": 2,
                "eval_duration": 100_000_000,
            }

        with patch.object(runtime_smoke, "_json_request", side_effect=fake_request):
            result = runtime_smoke._ollama_probe(
                {
                    "base_url": "http://127.0.0.1:11434/v1",
                    "model": "qwen3:8b",
                    "backend": "ollama",
                    "provider_name": "ollama_local",
                },
                "Reply with exactly: ready",
            )

        self.assertEqual(captured["url"], "http://127.0.0.1:11434/api/chat")
        self.assertEqual(captured["payload"]["think"], False)
        self.assertEqual(captured["payload"]["options"]["num_predict"], 32)
        self.assertTrue(result["ready"])
        self.assertEqual(result["response"], "ready")
        self.assertEqual(result["tokens_per_second"], 20.0)

    def test_smoke_test_marks_runtime_ready_when_all_probes_succeed(self) -> None:
        calls = []

        def llm_probe(config, env, prompt):
            calls.append(("llm", prompt))
            return {
                "ready": True,
                "response": "ready",
                "latency_ms": 80,
                "tokens_per_second": 54.2,
                "model": "qwen-test",
            }

        def tts_probe(config, env, text, output_dir):
            calls.append(("tts", text, str(output_dir)))
            output = Path(output_dir) / "voice.mp3"
            output.write_bytes(b"audio-bytes")
            return {
                "ready": True,
                "audio_path": str(output),
                "audio_bytes": output.stat().st_size,
                "latency_ms": 120,
                "engine": "kokoro",
            }

        def stt_probe(config, env, sample_audio):
            calls.append(("stt", str(sample_audio)))
            return {
                "ready": True,
                "transcript": "ready",
                "latency_ms": 90,
                "engine": "faster-whisper",
            }

        with tempfile.TemporaryDirectory() as temp_dir:
            result = run_runtime_smoke_test(
                {"providers": {"ollama": {"model": "qwen-test"}}},
                env={},
                output_dir=Path(temp_dir),
                llm_probe=llm_probe,
                tts_probe=tts_probe,
                stt_probe=stt_probe,
            )

        self.assertTrue(result["production_ready"])
        self.assertTrue(result["llm"]["ready"])
        self.assertEqual(result["llm"]["tokens_per_second"], 54.2)
        self.assertTrue(result["tts"]["ready"])
        self.assertEqual(result["tts"]["audio_bytes"], len(b"audio-bytes"))
        self.assertTrue(result["stt"]["ready"])
        self.assertEqual(result["stt"]["transcript"], "ready")
        self.assertEqual(result["blocking_issues"], [])
        self.assertEqual([call[0] for call in calls], ["llm", "tts", "stt"])

    def test_smoke_test_reports_blockers_when_probe_fails_or_is_not_ready(self) -> None:
        def llm_probe(config, env, prompt):
            raise TimeoutError("model did not answer")

        def tts_probe(config, env, text, output_dir):
            return {"ready": False, "error": "no voice assets", "engine": "kokoro"}

        def stt_probe(config, env, sample_audio):
            return {"ready": False, "error": "sample audio missing", "engine": "faster-whisper"}

        with tempfile.TemporaryDirectory() as temp_dir:
            result = run_runtime_smoke_test(
                {},
                env={},
                output_dir=Path(temp_dir),
                llm_probe=llm_probe,
                tts_probe=tts_probe,
                stt_probe=stt_probe,
            )

        self.assertFalse(result["production_ready"])
        self.assertFalse(result["llm"]["ready"])
        self.assertIn("model did not answer", result["llm"]["error"])
        self.assertFalse(result["tts"]["ready"])
        self.assertFalse(result["stt"]["ready"])
        self.assertEqual(
            [issue["component"] for issue in result["blocking_issues"]],
            ["llm", "tts", "stt"],
        )


if __name__ == "__main__":
    unittest.main()
