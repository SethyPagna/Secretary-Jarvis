import tempfile
import unittest
from pathlib import Path

from jarvis_cli.team_runtime import (
    enrich_team_souls_manifest,
    load_team_activity,
    record_team_activity,
    record_voice_activity,
    team_state_path,
)


class TeamRuntimeTests(unittest.TestCase):
    def test_record_team_activity_persists_latest_route_and_soul_status(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            home = Path(temp_dir)

            payload = record_team_activity(
                home,
                active_soul="FORGE",
                surface="desktop",
                prompt="Package the Windows exe and verify shutdown.",
                delegate_souls=["jarvis", "friday", "forge"],
                model="qwen3.5-9b-q4_k_m",
                provider="llama.cpp",
                session_id="desktop-test",
            )
            loaded = load_team_activity(home)
            enriched = enrich_team_souls_manifest(home)

        self.assertTrue(team_state_path(home).name.endswith("state.json"))
        self.assertEqual(payload["active_soul"], "forge")
        self.assertEqual(loaded["active_soul"], "forge")
        self.assertEqual(loaded["delegate_souls"], ["jarvis", "friday"])
        self.assertEqual(enriched["active_soul"], "forge")
        self.assertEqual(enriched["last_route"]["session_id"], "desktop-test")
        forge = next(soul for soul in enriched["souls"] if soul["id"] == "forge")
        self.assertTrue(forge["active"])
        self.assertTrue(forge["online"])
        self.assertEqual(forge["last_surface"], "desktop")

    def test_enrich_team_souls_manifest_defaults_ready_souls_online(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            enriched = enrich_team_souls_manifest(Path(temp_dir))

        self.assertEqual(enriched["primary"], "jarvis")
        self.assertEqual(enriched["active_soul"], "jarvis")
        self.assertGreaterEqual(len(enriched["souls"]), 8)
        self.assertTrue(all("online" in soul for soul in enriched["souls"]))

    def test_voice_activity_updates_same_team_state(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            home = Path(temp_dir)
            record_team_activity(
                home,
                active_soul="jarvis",
                surface="desktop",
                prompt="hello",
                delegate_souls=["friday"],
            )
            payload = record_voice_activity(
                home,
                phase="transcribed",
                active_soul="friday",
                transcript="debug the voice pipeline",
                provider="faster-whisper",
                engine="whisper-v3-turbo",
                success=True,
                latency_ms=123,
                audio_bytes=456,
                content_type="audio/webm",
            )
            loaded = load_team_activity(home)
            enriched = enrich_team_souls_manifest(home)

        self.assertEqual(payload["active_soul"], "friday")
        self.assertEqual(loaded["voice_activity"]["phase"], "transcribed")
        self.assertEqual(loaded["voice_activity"]["provider"], "faster-whisper")
        self.assertEqual(enriched["voice_activity"]["active_soul"], "friday")
        self.assertEqual(enriched["last_route"]["surface"], "voice")


if __name__ == "__main__":
    unittest.main()
