"""Desktop voice helpers for browser STT/TTS integration.

The Electron renderer records microphone audio with MediaRecorder, sends the
raw browser audio bytes here for transcription, and receives synthesized audio
as a browser-playable base64 payload. Imports of heavyweight voice providers
stay lazy so packaging checks can import this module without loading Whisper,
Kokoro, or cloud SDKs.
"""

from __future__ import annotations

import base64
import json
import mimetypes
import time
import uuid
from pathlib import Path
from typing import Any, Callable, Mapping

Transcriber = Callable[[str], Mapping[str, Any]]
Synthesizer = Callable[..., str | Mapping[str, Any]]

_DESKTOP_BLOCKED_TTS_PROVIDERS = {"elevenlabs"}
_AUDIO_EXTENSIONS = {
    "audio/webm": ".webm",
    "audio/ogg": ".ogg",
    "audio/opus": ".opus",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/mp4": ".m4a",
    "audio/x-m4a": ".m4a",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "application/octet-stream": ".webm",
}


def audio_extension_for(content_type: str | None) -> str:
    """Return a safe audio file extension for a browser MediaRecorder MIME."""
    mime = (content_type or "application/octet-stream").split(";", 1)[0].strip().lower()
    return _AUDIO_EXTENSIONS.get(mime, ".webm")


def _coerce_mapping(payload: str | Mapping[str, Any]) -> dict[str, Any]:
    if isinstance(payload, str):
        try:
            loaded = json.loads(payload)
        except json.JSONDecodeError:
            return {"success": False, "error": payload}
        return dict(loaded) if isinstance(loaded, dict) else {"success": False, "error": payload}
    return dict(payload)


def _default_transcriber(path: str) -> Mapping[str, Any]:
    from tools.transcription_tools import transcribe_audio

    return transcribe_audio(path)


def transcribe_desktop_audio(
    audio_bytes: bytes,
    content_type: str | None,
    output_dir: Path,
    *,
    transcriber: Transcriber | None = None,
) -> dict[str, Any]:
    """Persist browser microphone audio and run the configured STT provider."""
    if not audio_bytes:
        return {
            "success": False,
            "transcript": "",
            "error": "No microphone audio was captured.",
            "bytes": 0,
        }

    output_dir.mkdir(parents=True, exist_ok=True)
    audio_path = output_dir / f"desktop-input-{uuid.uuid4().hex}{audio_extension_for(content_type)}"
    audio_path.write_bytes(audio_bytes)

    started = time.perf_counter()
    payload = (transcriber or _default_transcriber)(str(audio_path))
    result = _coerce_mapping(payload)
    latency_ms = int((time.perf_counter() - started) * 1000)

    transcript = str(result.get("transcript") or "").strip()
    success = bool(result.get("success")) and bool(transcript)
    return {
        **result,
        "success": success,
        "transcript": transcript,
        "bytes": len(audio_bytes),
        "input_path": str(audio_path),
        "latency_ms": latency_ms,
    }


def _default_synthesizer(*, text: str, output_path: str) -> str | Mapping[str, Any]:
    from tools.tts_tool import text_to_speech_tool

    return text_to_speech_tool(text=text, output_path=output_path)


def _configured_tts_provider() -> str:
    try:
        from jarvis_cli.config import cfg_get, load_config

        return str(cfg_get(load_config(), "tts", "provider", default="") or "").lower()
    except Exception:
        return ""


def synthesize_desktop_speech(
    text: str,
    output_dir: Path,
    *,
    provider: str | None = None,
    synthesizer: Synthesizer | None = None,
) -> dict[str, Any]:
    """Synthesize assistant text and return a browser-playable audio payload."""
    spoken_text = text.strip()
    if not spoken_text:
        return {
            "success": False,
            "error": "No text was provided for speech synthesis.",
            "audio_base64": "",
            "audio_bytes": 0,
        }

    effective_provider = (provider or _configured_tts_provider()).lower()
    if effective_provider in _DESKTOP_BLOCKED_TTS_PROVIDERS:
        return {
            "success": False,
            "error": (
                "ElevenLabs desktop TTS is disabled. Use Kokoro, OmniVoice, "
                "system TTS, or another configured local voice provider."
            ),
            "provider": effective_provider,
            "audio_base64": "",
            "audio_bytes": 0,
        }

    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"desktop-output-{uuid.uuid4().hex}.mp3"

    started = time.perf_counter()
    payload = (synthesizer or _default_synthesizer)(
        text=spoken_text,
        output_path=str(output_path),
    )
    result = _coerce_mapping(payload)
    latency_ms = int((time.perf_counter() - started) * 1000)

    file_path = Path(str(result.get("file_path") or output_path))
    if not result.get("success"):
        return {
            **result,
            "success": False,
            "audio_base64": "",
            "audio_bytes": 0,
            "latency_ms": latency_ms,
        }

    if not file_path.exists() or file_path.stat().st_size == 0:
        return {
            **result,
            "success": False,
            "error": "TTS generation produced no browser-playable audio.",
            "audio_base64": "",
            "audio_bytes": 0,
            "latency_ms": latency_ms,
        }

    audio_bytes = file_path.read_bytes()
    mime_type = mimetypes.guess_type(str(file_path))[0] or "audio/mpeg"
    return {
        **result,
        "success": True,
        "file_path": str(file_path),
        "audio_base64": base64.b64encode(audio_bytes).decode("ascii"),
        "audio_bytes": len(audio_bytes),
        "mime_type": mime_type,
        "latency_ms": latency_ms,
    }
