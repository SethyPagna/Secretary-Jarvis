import tempfile
import unittest
from pathlib import Path

from jarvis_cli.runtime_autoconfig import build_runtime_autoconfig_plan


class RuntimeAutoconfigTests(unittest.TestCase):
    def test_autoconfig_prefers_quantized_gguf_with_llama_cpp(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            model_dir = root / "Qwen__Qwen3.5-9B"
            model_dir.mkdir()
            f16 = model_dir / "qwen3.5-9b-f16.gguf"
            q4 = model_dir / "qwen3.5-9b-q4_k_m.gguf"
            f16.write_bytes(b"f16")
            q4.write_bytes(b"q4")

            kokoro = root / "hexgrad__Kokoro-82M"
            (kokoro / "voices").mkdir(parents=True)
            (kokoro / "kokoro-v1_0.pth").write_bytes(b"model")
            (kokoro / "voices" / "am_adam.pt").write_bytes(b"voice")

            whisper = root / "openai__whisper-large-v3-turbo"
            whisper.mkdir()
            (whisper / "model.safetensors").write_bytes(b"whisper")

            plan = build_runtime_autoconfig_plan(
                {},
                model_roots=[root],
                executable_available=lambda name: name == "llama-server",
                package_available=lambda name: name == "edge_tts",
            )

        self.assertEqual(plan["llm"]["backend"], "llama.cpp")
        self.assertEqual(plan["llm"]["model_path"], str(q4))
        self.assertIn("--model", plan["llm"]["start_command"])
        self.assertEqual(plan["config_patch"]["providers"]["llama_cpp_local"]["base_url"], "http://127.0.0.1:8080/v1")
        self.assertEqual(plan["config_patch"]["model"], "qwen3.5-9b-q4_k_m")
        self.assertEqual(plan["tts"]["provider"], "edge")
        self.assertEqual(plan["tts"]["target_provider"], "kokoro")
        self.assertIn("Install Kokoro runtime", plan["tts"]["actions"][0])
        self.assertEqual(plan["stt"]["provider"], "local")
        self.assertIn("Install faster-whisper", plan["stt"]["actions"][0])
        self.assertFalse(plan["production_ready"])

    def test_autoconfig_uses_ollama_when_models_are_available(self) -> None:
        plan = build_runtime_autoconfig_plan(
            {},
            model_roots=[],
            executable_available=lambda name: name == "ollama",
            package_available=lambda name: name in {"edge_tts", "faster_whisper"},
            ollama_models=lambda: ["qwen2.5:7b"],
        )

        self.assertEqual(plan["llm"]["backend"], "ollama")
        self.assertEqual(plan["llm"]["model"], "qwen2.5:7b")
        self.assertEqual(plan["config_patch"]["providers"]["ollama_local"]["base_url"], "http://127.0.0.1:11434/v1")
        self.assertEqual(plan["config_patch"]["model"], "qwen2.5:7b")
        self.assertTrue(plan["stt"]["dependency_ready"])


if __name__ == "__main__":
    unittest.main()
