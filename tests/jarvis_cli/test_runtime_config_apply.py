import unittest

from jarvis_cli.runtime_config_apply import merge_runtime_config


class RuntimeConfigApplyTests(unittest.TestCase):
    def test_merge_runtime_config_recursively_preserves_unrelated_settings(self) -> None:
        current = {
            "model": "",
            "providers": {
                "cloud": {
                    "base_url": "https://example.test/v1",
                    "model": "cloud-model",
                }
            },
            "tts": {
                "provider": "edge",
                "openai": {"voice": "alloy"},
            },
            "unrelated": {"keep": True},
        }
        patch = {
            "model": "qwen3:8b",
            "providers": {
                "ollama_local": {
                    "base_url": "http://127.0.0.1:11434/v1",
                    "model": "qwen3:8b",
                }
            },
            "tts": {"provider": "edge"},
            "stt": {"enabled": True, "provider": "local"},
        }

        merged = merge_runtime_config(current, patch)

        self.assertEqual(merged["model"], "qwen3:8b")
        self.assertEqual(merged["providers"]["cloud"]["model"], "cloud-model")
        self.assertEqual(merged["providers"]["ollama_local"]["model"], "qwen3:8b")
        self.assertEqual(next(iter(merged["providers"])), "ollama_local")
        self.assertEqual(merged["tts"]["provider"], "edge")
        self.assertEqual(merged["tts"]["openai"]["voice"], "alloy")
        self.assertEqual(merged["stt"]["provider"], "local")
        self.assertEqual(merged["unrelated"]["keep"], True)
        self.assertNotIn("ollama_local", current["providers"])

    def test_merge_runtime_config_ignores_empty_patch_dict(self) -> None:
        current = {"model": "existing", "providers": {}}

        merged = merge_runtime_config(current, {})

        self.assertEqual(merged, current)
        self.assertIsNot(merged, current)


if __name__ == "__main__":
    unittest.main()
