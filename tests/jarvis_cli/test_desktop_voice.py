import json
import os
import struct
import tempfile
import unittest
import wave
from pathlib import Path
from unittest.mock import patch

from jarvis_cli.desktop_voice import (
    audio_extension_for,
    synthesize_desktop_speech,
    transcribe_desktop_audio,
)


def _wav_bytes(samples: list[int], *, sample_rate: int = 16_000) -> bytes:
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as handle:
        path = Path(handle.name)
    try:
        with wave.open(str(path), "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(sample_rate)
            wav_file.writeframes(struct.pack("<" + "h" * len(samples), *samples))
        return path.read_bytes()
    finally:
        path.unlink(missing_ok=True)


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

    def test_default_desktop_transcriber_uses_whisper_turbo_not_browser_or_base(self) -> None:
        from jarvis_cli.desktop_voice import _default_transcriber

        with patch.dict(os.environ, {}, clear=False), patch(
            "tools.transcription_tools.transcribe_audio",
            return_value={"success": True, "transcript": "accurate whisper transcript"},
        ) as transcribe_audio:
            result = _default_transcriber("sample.webm")

        transcribe_audio.assert_called_once_with("sample.webm", model="large-v3-turbo")
        self.assertTrue(result["success"])

    def test_default_desktop_transcriber_allows_explicit_model_override(self) -> None:
        from jarvis_cli.desktop_voice import _default_transcriber

        with patch.dict(os.environ, {"JARVIS_DESKTOP_STT_MODEL": "medium"}, clear=False), patch(
            "tools.transcription_tools.transcribe_audio",
            return_value={"success": True, "transcript": "medium whisper transcript"},
        ) as transcribe_audio:
            _default_transcriber("sample.webm")

        transcribe_audio.assert_called_once_with("sample.webm", model="medium")

    def test_transcribe_desktop_audio_rejects_silent_wav_before_whisper(self) -> None:
        called = False

        def fake_transcriber(path: str):
            nonlocal called
            called = True
            return {"success": True, "transcript": "thank you"}

        silent_audio = _wav_bytes([0] * 16_000)
        with tempfile.TemporaryDirectory() as temp_dir:
            result = transcribe_desktop_audio(
                silent_audio,
                "audio/wav",
                Path(temp_dir),
                transcriber=fake_transcriber,
            )

        self.assertFalse(result["success"])
        self.assertFalse(called)
        self.assertIn("silent", result["error"].lower())
        self.assertEqual(result["quality"]["peak"], 0.0)

    def test_transcribe_desktop_audio_filters_whisper_hallucinations(self) -> None:
        voiced_audio = _wav_bytes([1200, -1200] * 12_000)

        def fake_transcriber(path: str):
            return {"success": True, "transcript": "Thank you. Thank you.", "provider": "local"}

        with tempfile.TemporaryDirectory() as temp_dir:
            result = transcribe_desktop_audio(
                voiced_audio,
                "audio/wav",
                Path(temp_dir),
                transcriber=fake_transcriber,
            )

        self.assertFalse(result["success"])
        self.assertEqual(result["transcript"], "")
        self.assertTrue(result["filtered"])
        self.assertIn("hallucination", result["error"].lower())

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

    def test_synthesize_desktop_speech_uses_kokoro_before_system_fallback(self) -> None:
        def fake_kokoro(text: str, output_path: Path):
            self.assertEqual(text, "Local voice")
            output_path.write_bytes(b"wav-audio")
            return {
                "success": True,
                "file_path": str(output_path),
                "provider": "kokoro",
                "engine": "kokoro-local",
            }

        with tempfile.TemporaryDirectory() as temp_dir, patch(
            "jarvis_cli.desktop_voice._synthesize_kokoro_voice",
            fake_kokoro,
        ), patch(
            "jarvis_cli.desktop_voice._synthesize_windows_system_voice",
            side_effect=AssertionError("system fallback should not run when Kokoro succeeds"),
        ):
            result = synthesize_desktop_speech(
                "Local voice",
                Path(temp_dir),
                provider="kokoro",
            )

        self.assertTrue(result["success"])
        self.assertEqual(result["provider"], "kokoro")
        self.assertEqual(result["engine"], "kokoro-local")
        self.assertEqual(result["audio_bytes"], len(b"wav-audio"))

    def test_synthesize_desktop_speech_rejects_removed_docker_voice_runtime(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            result = synthesize_desktop_speech(
                "Speak locally",
                Path(temp_dir),
                provider="docker",
            )

        self.assertFalse(result["success"])
        self.assertEqual(result["provider"], "docker")
        self.assertIn("removed", result["error"].lower())

    def test_start_desktop_voice_warmup_uses_short_default_delay(self) -> None:
        source = (Path(__file__).resolve().parents[2] / "src" / "jarvis_cli" / "desktop_voice.py").read_text(
            encoding="utf-8",
        )

        self.assertIn('JARVIS_VOICE_WARMUP_DELAY_SECONDS", "0.25"', source)
        self.assertIn("warm_desktop_voice_models(output_dir)", source)


if __name__ == "__main__":
    unittest.main()
