import tempfile
import unittest
from pathlib import Path

from jarvis_cli.runtime_smoke import run_runtime_smoke_test


class RuntimeSmokeTests(unittest.TestCase):
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
