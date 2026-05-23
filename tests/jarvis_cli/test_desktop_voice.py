import json
import tempfile
import unittest
from pathlib import Path

from jarvis_cli.desktop_voice import (
    audio_extension_for,
    synthesize_desktop_speech,
    transcribe_desktop_audio,
)


class DesktopVoiceTests(unittest.TestCase):
    def test_audio_extension_uses_browser_recording_mime_types(self) -> None:
        self.assertEqual(audio_extension_for("audio/webm;codecs=opus"), ".webm")
        self.assertEqual(audio_extension_for("audio/ogg"), ".ogg")
        self.assertEqual(audio_extension_for("audio/wav"), ".wav")
        self.assertEqual(audio_extension_for("application/octet-stream"), ".webm")

    def test_transcribe_desktop_audio_persists_browser_audio_and_returns_transcript(self) -> None:
        calls: list[str] = []

        def fake_transcriber(path: str):
            calls.append(path)
            return {"success": True, "transcript": "turn on the lights", "provider": "local"}

        with tempfile.TemporaryDirectory() as temp_dir:
            result = transcribe_desktop_audio(
                b"webm-audio",
                "audio/webm;codecs=opus",
                Path(temp_dir),
                transcriber=fake_transcriber,
            )

        self.assertTrue(result["success"])
        self.assertEqual(result["transcript"], "turn on the lights")
        self.assertEqual(result["bytes"], len(b"webm-audio"))
        self.assertEqual(len(calls), 1)
        self.assertTrue(calls[0].endswith(".webm"))

    def test_synthesize_desktop_speech_returns_audio_payload_for_browser_playback(self) -> None:
        def fake_synthesizer(*, text: str, output_path: str):
            self.assertEqual(text, "JARVIS is online")
            Path(output_path).write_bytes(b"mp3-audio")
            return json.dumps({
                "success": True,
                "file_path": output_path,
                "provider": "kokoro",
            })

        with tempfile.TemporaryDirectory() as temp_dir:
            result = synthesize_desktop_speech(
                "JARVIS is online",
                Path(temp_dir),
                synthesizer=fake_synthesizer,
            )

        self.assertTrue(result["success"])
        self.assertEqual(result["provider"], "kokoro")
        self.assertEqual(result["audio_bytes"], len(b"mp3-audio"))
        self.assertEqual(result["mime_type"], "audio/mpeg")
        self.assertTrue(result["audio_base64"])

    def test_synthesize_desktop_speech_refuses_elevenlabs_cloud_provider(self) -> None:
        called = False

        def fake_synthesizer(*, text: str, output_path: str):
            nonlocal called
            called = True
            Path(output_path).write_bytes(b"cloud-audio")
            return {"success": True, "file_path": output_path, "provider": "elevenlabs"}

        with tempfile.TemporaryDirectory() as temp_dir:
            result = synthesize_desktop_speech(
                "No cloud voice",
                Path(temp_dir),
                provider="elevenlabs",
                synthesizer=fake_synthesizer,
            )

        self.assertFalse(result["success"])
        self.assertIn("disabled", result["error"].lower())
        self.assertFalse(called)


if __name__ == "__main__":
    unittest.main()
