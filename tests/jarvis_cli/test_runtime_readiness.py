import tempfile
import unittest
from pathlib import Path


class RuntimeReadinessTests(unittest.TestCase):
    def test_reports_fast_local_llm_tts_and_stt_as_ready(self) -> None:
        from jarvis_cli.runtime_readiness import build_runtime_readiness

        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            model_root = root / "models"
            model_root.mkdir()
            (model_root / "qwen3.5-9b-q4_k_m.gguf").write_bytes(b"gguf")

            kokoro_root = root / "kokoro"
            (kokoro_root / "voices").mkdir(parents=True)
            (kokoro_root / "kokoro-v1_0.pth").write_bytes(b"model")
            (kokoro_root / "voices" / "am_adam.pt").write_bytes(b"voice")

            config = {
                "model": "qwen3.5-9b-q4_k_m",
                "providers": {
                    "ollama-local": {
                        "base_url": "http://127.0.0.1:11434/v1",
                        "model": "qwen3.5-9b-q4_k_m",
                    }
                },
                "tts": {
                    "provider": "kokoro",
                    "kokoro": {"model_dir": str(kokoro_root), "voice": "am_adam"},
                },
                "stt": {
                    "enabled": True,
                    "provider": "local",
                    "local": {"model": "small", "device": "cuda"},
                },
            }

            readiness = build_runtime_readiness(
                config,
                env={},
                model_roots=[model_root],
                package_available=lambda name: name in {"faster_whisper", "kokoro", "onnxruntime"},
                executable_available=lambda _name: False,
                endpoint_probe=lambda _url: {"ok": True, "latency_ms": 18.4},
            )

        self.assertTrue(readiness["production_ready"])
        self.assertEqual(readiness["llm"]["backend"], "ollama")
        self.assertTrue(readiness["llm"]["ready"])
        self.assertGreater(readiness["llm"]["tokens_per_second_target"], 0)
        self.assertEqual(readiness["tts"]["engine"], "kokoro")
        self.assertTrue(readiness["tts"]["ready"])
        self.assertEqual(readiness["stt"]["engine"], "faster-whisper")
        self.assertTrue(readiness["stt"]["ready"])
        self.assertIn("cuda", readiness["optimizations"])

    def test_reports_missing_runtime_blockers(self) -> None:
        from jarvis_cli.runtime_readiness import build_runtime_readiness

        config = {
            "model": "",
            "providers": {},
            "tts": {"provider": "kokoro", "kokoro": {"model_dir": ""}},
            "stt": {"enabled": True, "provider": "local", "local": {"model": "large-v3"}},
        }

        readiness = build_runtime_readiness(
            config,
            env={},
            model_roots=[],
            package_available=lambda _name: False,
            executable_available=lambda _name: False,
            endpoint_probe=lambda _url: {"ok": False, "error": "offline"},
        )

        self.assertFalse(readiness["production_ready"])
        self.assertFalse(readiness["llm"]["ready"])
        self.assertFalse(readiness["tts"]["ready"])
        self.assertFalse(readiness["stt"]["ready"])
        self.assertGreaterEqual(len(readiness["blocking_issues"]), 3)

    def test_reports_removed_docker_voice_runtime_as_blocker(self) -> None:
        from jarvis_cli.runtime_readiness import build_runtime_readiness

        config = {
            "model": "gemma-4-E4B-it",
            "providers": {
                "jarvis_vllm_local": {
                    "base_url": "http://127.0.0.1:8000/v1",
                    "model": "gemma-4-E4B-it",
                }
            },
            "tts": {"provider": "docker", "docker": {"url": "http://127.0.0.1:9010"}},
            "stt": {
                "enabled": True,
                "provider": "docker",
                "docker": {"url": "http://127.0.0.1:9010", "model": "base"},
            },
        }

        readiness = build_runtime_readiness(
            config,
            env={},
            model_roots=[],
            package_available=lambda _name: False,
            executable_available=lambda _name: False,
            endpoint_probe=lambda _url: {"ok": True, "latency_ms": 10.0},
        )

        self.assertEqual(readiness["llm"]["backend"], "vllm")
        self.assertFalse(readiness["production_ready"])
        self.assertIn("Docker voice runtime has been removed", readiness["tts"]["issues"][0])
        self.assertIn("Docker STT runtime has been removed", readiness["stt"]["issues"][0])


if __name__ == "__main__":
    unittest.main()
