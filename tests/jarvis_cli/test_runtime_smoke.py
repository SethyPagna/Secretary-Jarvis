import tempfile
import unittest
import os
from pathlib import Path
from unittest.mock import patch

from jarvis_cli import runtime_smoke
from jarvis_cli.runtime_smoke import SMOKE_PROMPT, run_runtime_smoke_test


class RuntimeSmokeTests(unittest.TestCase):
    def test_temporary_environ_restores_values(self) -> None:
        os.environ["JARVIS_TEST_ENV_RESTORE"] = "before"
        with runtime_smoke._temporary_environ({
            "JARVIS_TEST_ENV_RESTORE": "during",
            "JARVIS_TEST_ENV_NEW": "yes",
        }):
            self.assertEqual(os.environ["JARVIS_TEST_ENV_RESTORE"], "during")
            self.assertEqual(os.environ["JARVIS_TEST_ENV_NEW"], "yes")

        self.assertEqual(os.environ["JARVIS_TEST_ENV_RESTORE"], "before")
        self.assertNotIn("JARVIS_TEST_ENV_NEW", os.environ)
        os.environ.pop("JARVIS_TEST_ENV_RESTORE", None)

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

    def test_llama_cpp_probe_disables_qwen_thinking(self) -> None:
        captured = {}

        def fake_request(url, payload, **kwargs):
            captured["url"] = url
            captured["payload"] = payload
            return {
                "choices": [{"message": {"content": "ready"}}],
                "usage": {"completion_tokens": 1},
            }

        with patch.object(runtime_smoke, "_json_request", side_effect=fake_request):
            result = runtime_smoke._openai_compatible_probe(
                {
                    "base_url": "http://127.0.0.1:8081/v1",
                    "model": "qwen3.5-9b-q4_k_m",
                    "backend": "llama.cpp",
                    "provider_name": "llama_cpp_local",
                },
                "Reply with exactly: ready",
            )

        self.assertEqual(captured["url"], "http://127.0.0.1:8081/v1/chat/completions")
        self.assertEqual(captured["payload"]["chat_template_kwargs"]["enable_thinking"], False)
        self.assertTrue(result["ready"])

    def test_default_llm_probe_falls_back_to_mistral_when_local_endpoint_is_dead(self) -> None:
        calls = []

        def fake_openai_probe(settings, prompt):
            calls.append((settings["provider_name"], settings["base_url"], settings["model"], prompt))
            if settings["provider_name"] == "llama_cpp_local":
                return {"ready": False, "error": "HTTPError: HTTP Error 404: Not Found"}
            return {
                "ready": True,
                "response": "ready",
                "latency_ms": 90,
                "tokens_per_second": 22.2,
                "model": settings["model"],
                "backend": settings["backend"],
                "provider": settings["provider_name"],
            }

        config = {
            "providers": {
                "llama_cpp_local": {
                    "base_url": "http://127.0.0.1:8080/v1",
                    "model": "qwen3.5-9b-q4_k_m",
                }
            }
        }
        with patch.object(runtime_smoke, "_openai_compatible_probe", side_effect=fake_openai_probe), \
             patch.object(runtime_smoke, "_start_local_runtime_for_smoke", return_value={"ok": False, "error": "missing helper"}):
            result = runtime_smoke.default_llm_probe(
                config,
                {"MISTRAL_API_KEY": "sk-test", "MISTRAL_MODEL": "mistral-small-latest"},
                "Reply ready",
            )

        self.assertTrue(result["ready"])
        self.assertEqual(result["provider"], "mistral_api")
        self.assertEqual(result["fallback_from"], "llama.cpp")
        self.assertIn("404", str(result["primary_error"]))
        self.assertEqual([call[0] for call in calls], ["llama_cpp_local", "mistral_api"])

    def test_default_llm_probe_starts_local_runtime_before_cloud_fallback(self) -> None:
        calls = []

        def fake_openai_probe(settings, prompt):
            calls.append((settings["provider_name"], settings["base_url"], settings["model"], prompt))
            if len(calls) == 1:
                return {"ready": False, "error": "URLError: refused"}
            return {
                "ready": True,
                "response": "ready",
                "latency_ms": 250,
                "tokens_per_second": 28.0,
                "model": settings["model"],
                "backend": settings["backend"],
                "provider": settings["provider_name"],
            }

        config = {
            "providers": {
                "llama_cpp_local": {
                    "base_url": "http://127.0.0.1:8081/v1",
                    "model": "qwen3.5-9b-q4_k_m",
                }
            }
        }
        start_result = {
            "ok": True,
            "running": True,
            "pid": 1234,
            "endpoint": "http://127.0.0.1:8081/v1",
            "plan": {
                "llm": {
                    "backend": "llama.cpp",
                    "model": "qwen3.5-9b-q4_k_m",
                    "endpoint": "http://127.0.0.1:8081/v1",
                }
            },
        }
        with patch.object(runtime_smoke, "_openai_compatible_probe", side_effect=fake_openai_probe), \
             patch.object(runtime_smoke, "_start_local_runtime_for_smoke", return_value=start_result) as start_mock:
            result = runtime_smoke.default_llm_probe(
                config,
                {"MISTRAL_API_KEY": "sk-test", "MISTRAL_MODEL": "mistral-small-latest"},
                "Reply ready",
            )

        self.assertTrue(result["ready"])
        self.assertEqual(result["provider"], "llama_cpp_local")
        self.assertNotIn("fallback_from", result)
        self.assertEqual(result["local_runtime_start"]["endpoint"], "http://127.0.0.1:8081/v1")
        start_mock.assert_called_once()
        self.assertEqual([call[0] for call in calls], ["llama_cpp_local", "llama_cpp_local"])

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

    def test_default_smoke_refuses_removed_docker_voice_runtime(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            audio = Path(temp_dir) / "sample.wav"
            audio.write_bytes(b"wav")

            tts = runtime_smoke.default_tts_probe(
                {"tts": {"provider": "docker"}},
                env={},
                text="ready",
                output_dir=Path(temp_dir),
            )
            stt = runtime_smoke.default_stt_probe(
                {"stt": {"provider": "docker"}},
                env={},
                sample_audio=audio,
            )

        self.assertFalse(tts["ready"])
        self.assertIn("Docker TTS runtime has been removed", tts["error"])
        self.assertFalse(stt["ready"])
        self.assertEqual(stt["engine"], "removed-docker-stt")
        self.assertIn("Docker STT runtime has been removed", stt["error"])


if __name__ == "__main__":
    unittest.main()
