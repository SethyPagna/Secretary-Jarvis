import tempfile
import unittest
from pathlib import Path


class DesktopStartupManifestTests(unittest.TestCase):
    def test_manifest_round_trips_and_matches_roots(self) -> None:
        from jarvis_cli.desktop_startup_manifest import (
            load_startup_manifest,
            root_fingerprint,
            roots_match_manifest,
            write_startup_manifest,
        )

        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp) / "home"
            root = Path(tmp) / "models"
            other_root = Path(tmp) / "other-models"
            root.mkdir(parents=True)
            other_root.mkdir()
            (root / "qwen.gguf").write_text("model", encoding="utf-8")

            manifest = write_startup_manifest(home, {
                "model_roots_fingerprint": root_fingerprint([root]),
                "model_payload": {
                    "roots": [str(root)],
                    "models": [{"id": "qwen", "primary_file": str(root / "qwen.gguf")}],
                },
            })

            loaded = load_startup_manifest(home)
            self.assertEqual(loaded["schema_version"], manifest["schema_version"])
            self.assertTrue(roots_match_manifest(loaded, [root]))
            self.assertFalse(roots_match_manifest(loaded, [other_root]))
            self.assertEqual(loaded["model_payload"]["models"][0]["id"], "qwen")

    def test_memory_context_snapshot_tracks_growth_without_copying_full_memory(self) -> None:
        from jarvis_cli.desktop_startup_manifest import collect_memory_context_snapshot

        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp) / "home"
            home.mkdir()
            long_memory = "# JARVIS Memory\n" + ("private details " * 200)
            (home / "MEMORY.md").write_text(long_memory, encoding="utf-8")
            (home / "SOUL.md").write_text("# JARVIS\nAssistant identity.", encoding="utf-8")

            snapshot = collect_memory_context_snapshot(home)

            self.assertEqual(snapshot["available"], 2)
            self.assertGreater(snapshot["total_bytes"], 100)
            titles = {item["name"]: item["title"] for item in snapshot["files"] if item["exists"]}
            self.assertEqual(titles["MEMORY.md"], "JARVIS Memory")
            self.assertNotIn("private details private details", str(snapshot))

    def test_web_server_uses_manifest_for_warm_start(self) -> None:
        source = (Path(__file__).resolve().parents[2] / "src" / "jarvis_cli" / "web_server.py").read_text(
            encoding="utf-8",
        )

        self.assertIn("load_startup_manifest", source)
        self.assertIn("write_startup_manifest", source)
        self.assertIn("roots_match_manifest(manifest, roots)", source)
        self.assertIn("collect_memory_context_snapshot", source)
        self.assertIn('("readiness", lambda: _runtime_readiness_snapshot(force_refresh=True))', source)
        self.assertIn('"readiness": warmup_payload.get("readiness") or {}', source)
        self.assertIn('"manifest"', source)


if __name__ == "__main__":
    unittest.main()
