import tempfile
import unittest
import os
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

    def test_auto_profile_uses_faster_whisper_turbo_name_for_safetensors_stt(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            gguf = root / "qwen-test-q4_k_m.gguf"
            gguf.write_bytes(b"model")
            whisper = root / "openai__whisper-large-v3-turbo"
            whisper.mkdir()
            (whisper / "config.json").write_text("{}", encoding="utf-8")
            (whisper / "model.safetensors").write_bytes(b"model")

            plan = docker_models.build_compose_environment(model_roots=[root])

        self.assertEqual(plan["whisper_model_dir"], str(whisper))
        self.assertEqual(plan["stt_model"], "large-v3-turbo")
        self.assertEqual(plan["env"]["JARVIS_STT_MODEL"], "large-v3-turbo")

    def test_auto_profile_can_use_ctranslate2_whisper_dir_for_stt(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            gguf = root / "qwen-test-q4_k_m.gguf"
            gguf.write_bytes(b"model")
            whisper = root / "ctranslate2-whisper-large-v3-turbo"
            whisper.mkdir()
            (whisper / "config.json").write_text("{}", encoding="utf-8")
            (whisper / "model.safetensors").write_bytes(b"model")
            (whisper / "model.bin").write_bytes(b"converted")

            plan = docker_models.build_compose_environment(model_roots=[root])

        self.assertEqual(plan["stt_model"], "/models/ctranslate2-whisper-large-v3-turbo")
        self.assertEqual(
            plan["env"]["JARVIS_STT_MODEL"],
            "/models/ctranslate2-whisper-large-v3-turbo",
        )

    def test_packaged_resource_root_finds_nearby_parent_models(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            install_root = Path(temp_dir) / "JARVIS"
            resources = install_root / "release" / "win-unpacked" / "resources"
            resources.mkdir(parents=True)
            nearby_models = install_root / "models" / "Qwen__Qwen3.5-9B"
            nearby_models.mkdir(parents=True)
            model = nearby_models / "qwen3.5-9b-q4_k_m.gguf"
            model.write_bytes(b"model")

            with patch.dict(os.environ, {"JARVIS_RESOURCE_ROOT": str(resources)}):
                roots = docker_models.default_model_roots()
                plan = docker_models.build_compose_environment(model_roots=roots)

        self.assertIn(install_root / "models", roots)
        self.assertEqual(plan["profile"], "llamacpp")
        self.assertEqual(plan["models_root"], str(install_root / "models"))

    def test_config_patch_promotes_docker_llamacpp_provider_and_voice(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            gguf = root / "qwen-test-q4_k_m.gguf"
            gguf.write_bytes(b"model")

            with patch.dict("os.environ", {"JARVIS_LLAMA_CPP_PORT": "18080", "JARVIS_VOICE_PORT": "19010"}), \
                 patch("jarvis_cli.docker_models._service_status", return_value={"ok": True, "services": []}):
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
        self.assertEqual(config_patch["tts"]["docker"]["engine"], "kokoro")
        self.assertEqual(config_patch["runtime"]["docker"]["voice_url"], "http://127.0.0.1:19010")

    def test_stop_uses_compose_stop_so_containers_and_volumes_are_preserved(self) -> None:
        with patch("jarvis_cli.docker_models.compose_available", return_value=True), \
             patch("jarvis_cli.docker_models.docker_runtime_status", return_value={"ok": True}), \
             patch("jarvis_cli.docker_models._run") as run:
            run.return_value = {"ok": True, "command": []}

            result = docker_models.stop_docker_runtime()

        command = run.call_args.args[0]
        self.assertIn("stop", command)
        self.assertIn("--profile", command)
        self.assertIn("models", command)
        self.assertIn("jarvis-llamacpp", command)
        self.assertIn("jarvis-voice", command)
        self.assertNotIn("down", command)
        self.assertTrue(result["preserved_containers"])


if __name__ == "__main__":
    unittest.main()
