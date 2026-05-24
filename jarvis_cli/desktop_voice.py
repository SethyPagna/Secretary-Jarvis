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
import os
import subprocess
import time
import urllib.request
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


def _cfg_nested(mapping: Mapping[str, Any], *keys: str, default: Any = "") -> Any:
    current: Any = mapping
    for key in keys:
        if not isinstance(current, Mapping):
            return default
        current = current.get(key)
    return default if current is None else current


def _docker_voice_url(kind: str) -> str:
    env_url = str(
        os.environ.get("JARVIS_DOCKER_VOICE_URL")
        or os.environ.get("JARVIS_VOICE_RUNTIME_URL")
        or ""
    ).strip()
    if env_url:
        return env_url.rstrip("/")

    try:
        from jarvis_cli.config import cfg_get, load_config

        config = load_config()
        provider = str(cfg_get(config, kind, "provider", default="") or "").lower()
        runtime_enabled = bool(_cfg_nested(config, "runtime", "docker", "enabled", default=False))
        configured_url = str(
            cfg_get(config, kind, "docker", "url", default="")
            or _cfg_nested(config, "runtime", "docker", "voice_url", default="")
            or ""
        ).strip()
        if configured_url and (provider == "docker" or runtime_enabled):
            return configured_url.rstrip("/")
    except Exception:
        return ""
    return ""


def _post_docker_voice_raw(url: str, audio_bytes: bytes, content_type: str | None) -> dict[str, Any]:
    extension = audio_extension_for(content_type)
    request = urllib.request.Request(
        f"{url.rstrip('/')}/stt/raw",
        data=audio_bytes,
        headers={
            "Content-Type": content_type or "application/octet-stream",
            "X-Audio-Extension": extension,
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        payload = response.read()
    result = json.loads(payload.decode("utf-8"))
    return dict(result) if isinstance(result, dict) else {"success": False, "error": "Invalid Docker STT response."}


def _post_docker_voice_json(url: str, payload: Mapping[str, Any]) -> dict[str, Any]:
    request = urllib.request.Request(
        f"{url.rstrip('/')}/tts",
        data=json.dumps(dict(payload)).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        raw = response.read()
    result = json.loads(raw.decode("utf-8"))
    return dict(result) if isinstance(result, dict) else {"success": False, "error": "Invalid Docker TTS response."}


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

    docker_url = _docker_voice_url("stt")
    if docker_url:
        started = time.perf_counter()
        try:
            result = _post_docker_voice_raw(docker_url, audio_bytes, content_type)
            transcript = str(result.get("transcript") or "").strip()
            return {
                **result,
                "success": bool(result.get("success")) and bool(transcript),
                "transcript": transcript,
                "provider": "docker",
                "bytes": len(audio_bytes),
                "latency_ms": result.get("latency_ms")
                or int((time.perf_counter() - started) * 1000),
            }
        except Exception as exc:
            return {
                "success": False,
                "transcript": "",
                "provider": "docker",
                "error": f"Docker STT runtime is unavailable at {docker_url}: {type(exc).__name__}: {exc}",
                "bytes": len(audio_bytes),
                "latency_ms": int((time.perf_counter() - started) * 1000),
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


def _ps_quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def _synthesize_windows_system_voice(text: str, output_path: Path) -> dict[str, Any]:
    """Generate a local WAV via Windows SAPI without network or lazy installs."""
    text_path = output_path.with_suffix(".txt")
    text_path.write_text(text, encoding="utf-8")
    script = "\n".join(
        [
            "Add-Type -AssemblyName System.Speech",
            f"$text = Get-Content -Raw -LiteralPath {_ps_quote(str(text_path))}",
            "$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer",
            "$synth.Volume = 100",
            "$synth.Rate = 0",
            f"$synth.SetOutputToWaveFile({_ps_quote(str(output_path))})",
            "$synth.Speak($text)",
            "$synth.Dispose()",
        ]
    )
    try:
        completed = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
            check=False,
            capture_output=True,
            text=True,
            timeout=45,
        )
    finally:
        text_path.unlink(missing_ok=True)

    if completed.returncode != 0:
        return {
            "success": False,
            "provider": "system",
            "engine": "windows-sapi",
            "error": completed.stderr.strip() or completed.stdout.strip() or "Windows SAPI failed.",
        }
    return {
        "success": output_path.exists() and output_path.stat().st_size > 0,
        "provider": "system",
        "engine": "windows-sapi",
        "file_path": str(output_path),
    }


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

    docker_url = _docker_voice_url("tts")
    if effective_provider == "docker" or docker_url:
        if not docker_url:
            return {
                "success": False,
                "error": "Docker TTS provider is selected but no Docker voice URL is configured.",
                "provider": "docker",
                "audio_base64": "",
                "audio_bytes": 0,
            }
        started = time.perf_counter()
        try:
            result = _post_docker_voice_json(docker_url, {"text": spoken_text})
            return {
                **result,
                "success": bool(result.get("success")) and bool(result.get("audio_base64")),
                "provider": "docker",
                "audio_base64": str(result.get("audio_base64") or ""),
                "audio_bytes": int(result.get("audio_bytes") or 0),
                "mime_type": str(result.get("mime_type") or "audio/wav"),
                "latency_ms": result.get("latency_ms")
                or int((time.perf_counter() - started) * 1000),
            }
        except Exception as exc:
            return {
                "success": False,
                "error": f"Docker TTS runtime is unavailable at {docker_url}: {type(exc).__name__}: {exc}",
                "provider": "docker",
                "audio_base64": "",
                "audio_bytes": 0,
                "latency_ms": int((time.perf_counter() - started) * 1000),
            }

    if (
        synthesizer is None
        and os.name == "nt"
        and effective_provider in {
            "",
            "edge",
            "system",
            "system-tts",
            "windows",
            "sapi",
            "kokoro",
            "omnivoice",
        }
    ):
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = output_dir / f"desktop-output-{uuid.uuid4().hex}.wav"
        started = time.perf_counter()
        result = _synthesize_windows_system_voice(spoken_text, output_path)
        latency_ms = int((time.perf_counter() - started) * 1000)
        if result.get("success"):
            audio_bytes = output_path.read_bytes()
            return {
                **result,
                "success": True,
                "audio_base64": base64.b64encode(audio_bytes).decode("ascii"),
                "audio_bytes": len(audio_bytes),
                "mime_type": "audio/wav",
                "latency_ms": latency_ms,
            }
        return {
            **result,
            "success": False,
            "audio_base64": "",
            "audio_bytes": 0,
            "latency_ms": latency_ms,
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
