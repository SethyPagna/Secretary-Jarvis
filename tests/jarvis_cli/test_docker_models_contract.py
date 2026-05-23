import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import yaml

from jarvis_cli import docker_models


ROOT = Path(__file__).resolve().parents[2]


class DockerModelsContractTests(unittest.TestCase):
    def test_compose_defines_local_desktop_model_services(self) -> None:
        compose = yaml.safe_load((ROOT / "docker-compose.local-models.yml").read_text(encoding="utf-8"))
        services = compose["services"]

        self.assertIn("jarvis-llamacpp", services)
        self.assertIn("jarvis-vllm", services)
        self.assertIn("jarvis-ollama", services)
        self.assertIn("jarvis-voice", services)
        self.assertIn("127.0.0.1:${JARVIS_LLAMA_CPP_PORT:-8080}:8080", services["jarvis-llamacpp"]["ports"])
        self.assertNotIn("mem_limit", services["jarvis-llamacpp"])
        self.assertNotIn("cpus", services["jarvis-llamacpp"])

    def test_auto_profile_prefers_llamacpp_then_vllm_then_ollama(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            gguf = root / "qwen-test-q4_k_m.gguf"
            gguf.write_bytes(b"model")
            vllm_dir = root / "qwen-vllm"
            vllm_dir.mkdir()
            (vllm_dir / "config.json").write_text("{}", encoding="utf-8")
            (vllm_dir / "model.safetensors").write_bytes(b"model")

            plan = docker_models.build_compose_environment(model_roots=[root])

        self.assertEqual(plan["profile"], "llamacpp")
        self.assertEqual(plan["llama_cpp_model"], "qwen-test-q4_k_m.gguf")
        self.assertTrue(str(plan["vllm_model"]).endswith("/qwen-vllm"))

    def test_config_patch_promotes_docker_llamacpp_provider_and_voice(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            gguf = root / "qwen-test-q4_k_m.gguf"
            gguf.write_bytes(b"model")

            with patch.dict("os.environ", {"JARVIS_LLAMA_CPP_PORT": "18080", "JARVIS_VOICE_PORT": "19010"}):
                plan = docker_models.build_compose_environment(profile="llamacpp", model_roots=[root])
                config_patch = docker_models._config_patch_for_profile("llamacpp", plan)

        self.assertEqual(config_patch["model"], "qwen-test-q4_k_m")
        self.assertIn("jarvis_llamacpp_docker", config_patch["providers"])
        self.assertEqual(
            config_patch["providers"]["jarvis_llamacpp_docker"]["base_url"],
            "http://127.0.0.1:18080/v1",
        )
        self.assertEqual(config_patch["stt"]["provider"], "docker")
        self.assertEqual(config_patch["tts"]["provider"], "docker")
        self.assertEqual(config_patch["runtime"]["docker"]["voice_url"], "http://127.0.0.1:19010")


if __name__ == "__main__":
    unittest.main()
