import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class LocalVoicePackagingContractTests(unittest.TestCase):
    def test_blueprint_uses_local_voice_stack_without_elevenlabs(self) -> None:
        blueprint = (ROOT / "docs" / "JARVIS_MASTER_BLUEPRINT.md").read_text(
            encoding="utf-8",
        )

        self.assertNotIn("ElevenLabs", blueprint)
        self.assertIn("Kokoro", blueprint)
        self.assertIn("OmniVoice", blueprint)
        self.assertIn("OpenAI Whisper API", blueprint)
        self.assertIn("assets/voices", blueprint)
        self.assertIn("vendor/voices", blueprint)
        self.assertIn("TTS: Kokoro -> OmniVoice -> system", blueprint)
        self.assertIn("STT: faster-whisper -> whisper.cpp -> OpenAI Whisper API", blueprint)
        self.assertIn("llama.cpp first, vLLM second, Ollama last", blueprint)

    def test_autoconfig_discovers_kokoro_and_omnivoice_assets(self) -> None:
        source = (ROOT / "jarvis_cli" / "runtime_autoconfig.py").read_text(
            encoding="utf-8",
        )

        self.assertIn("assets/voices", source)
        self.assertIn("vendor/voices", source)
        self.assertIn("OmniVoice", source)
        self.assertIn("kokoro", source)
        self.assertIn("faster-whisper", source)
        self.assertIn("whisper.cpp", source)
        self.assertNotIn("elevenlabs", source.lower())

    def test_runtime_smoke_uses_local_voice_or_system_only(self) -> None:
        source = (ROOT / "jarvis_cli" / "runtime_smoke.py").read_text(
            encoding="utf-8",
        )

        self.assertIn("kokoro", source)
        self.assertIn("omnivoice", source)
        self.assertIn("system", source)
        self.assertNotIn("elevenlabs", source.lower())

    def test_package_has_single_app_build_pipeline(self) -> None:
        package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
        scripts = package["scripts"]

        self.assertIn("desktop:build", scripts)
        self.assertIn("desktop:pack", scripts)
        self.assertIn("pyinstaller", scripts["desktop:build"].lower())
        self.assertIn("electron-builder", scripts["desktop:pack"])
        self.assertTrue((ROOT / "packaging" / "jarvis-backend.spec").exists())
        self.assertTrue((ROOT / "scripts" / "build-desktop.ps1").exists())

        electron_main = (ROOT / "electron" / "main.js").read_text(encoding="utf-8")
        self.assertIn("app.isPackaged", electron_main)
        self.assertIn("backend", electron_main)
        self.assertIn("jarvis-backend", electron_main)
        self.assertIn("windowsHide: true", electron_main)

    def test_docker_compose_documents_dynamic_wsl_resources_without_caps(self) -> None:
        compose = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")

        self.assertIn("WSL", compose)
        self.assertIn("dynamic resource", compose.lower())
        self.assertNotIn("mem_limit:", compose)
        self.assertNotIn("cpus:", compose)
        self.assertNotIn("deploy:\n      resources:\n        limits:", compose)


if __name__ == "__main__":
    unittest.main()
