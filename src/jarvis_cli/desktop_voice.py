"""Desktop voice helpers for browser STT/TTS integration.

The Electron renderer records microphone audio with MediaRecorder, sends the
raw browser audio bytes here for transcription, and receives synthesized audio
as a browser-playable base64 payload. Imports of heavyweight voice providers
stay lazy so packaging checks can import this module without loading Whisper,
Kokoro, or cloud SDKs.
"""

from __future__ import annotations

import base64
import importlib.util
import json
import mimetypes
import os
import struct
import subprocess
import tempfile
import threading
import time
import uuid
import wave
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
_KOKORO_CACHE: dict[tuple[str, str, str], Any] = {}
_KOKORO_SPACY_PREPARED = False
_VOICE_WARMUP_STARTED = False
_VOICE_WARMUP_LOCK = threading.Lock()
_MIN_DESKTOP_VOICE_DURATION_SECONDS = 0.32
_MIN_DESKTOP_VOICE_RMS = 0.0025
_MIN_DESKTOP_VOICE_PEAK = 0.012


def _writable_audio_dir(preferred: Path, purpose: str) -> Path:
    """Return a writable audio directory, falling back when app data is locked."""
    candidates = [
        preferred,
        Path(tempfile.gettempdir()) / "jarvis-agent" / purpose,
    ]
    for candidate in candidates:
        try:
            candidate.mkdir(parents=True, exist_ok=True)
            probe = candidate / f".write-probe-{uuid.uuid4().hex}"
            probe.write_text("ok", encoding="utf-8")
            probe.unlink(missing_ok=True)
            return candidate
        except Exception:
            continue
    # Let the original path raise a precise error at the actual write site.
    return preferred


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

    # Desktop voice should favor recognition quality. Browser SpeechRecognition
    # is intentionally not used by the renderer, so this route is the
    # authoritative mic transcript and should prefer the downloaded Whisper pack.
    model = os.getenv("JARVIS_DESKTOP_STT_MODEL", "large-v3-turbo").strip() or "large-v3-turbo"
    return transcribe_audio(path, model=model)


def _wav_quality(path: Path) -> dict[str, Any]:
    """Return lightweight signal quality for browser WAV captures."""
    try:
        with wave.open(str(path), "rb") as wav_file:
            frames = wav_file.getnframes()
            sample_rate = wav_file.getframerate() or 0
            sample_width = wav_file.getsampwidth()
            channels = max(1, wav_file.getnchannels())
            data = wav_file.readframes(frames)
    except Exception:
        return {}

    duration_seconds = frames / sample_rate if sample_rate else 0.0
    if sample_width != 2 or not data:
        return {
            "duration_seconds": duration_seconds,
            "rms": None,
            "peak": None,
            "sample_rate": sample_rate,
            "channels": channels,
        }

    sample_count = len(data) // 2
    if sample_count <= 0:
        return {
            "duration_seconds": duration_seconds,
            "rms": 0.0,
            "peak": 0.0,
            "sample_rate": sample_rate,
            "channels": channels,
        }

    samples = struct.unpack("<" + "h" * sample_count, data)
    if channels > 1:
        samples = samples[::channels]
    if not samples:
        return {
            "duration_seconds": duration_seconds,
            "rms": 0.0,
            "peak": 0.0,
            "sample_rate": sample_rate,
            "channels": channels,
        }

    total = sum(sample * sample for sample in samples)
    rms = (total / len(samples)) ** 0.5 / 32768.0
    peak = max(abs(sample) for sample in samples) / 32768.0
    return {
        "duration_seconds": duration_seconds,
        "rms": rms,
        "peak": peak,
        "sample_rate": sample_rate,
        "channels": channels,
    }


def _is_low_signal_wav(quality: Mapping[str, Any]) -> bool:
    """True when a WAV capture is too short or silent for reliable Whisper STT."""
    if not quality:
        return False
    duration = float(quality.get("duration_seconds") or 0.0)
    rms = quality.get("rms")
    peak = quality.get("peak")
    if duration and duration < _MIN_DESKTOP_VOICE_DURATION_SECONDS:
        return True
    if rms is None or peak is None:
        return False
    return float(rms) < _MIN_DESKTOP_VOICE_RMS and float(peak) < _MIN_DESKTOP_VOICE_PEAK


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

    output_dir = _writable_audio_dir(output_dir, "voice-input")
    audio_path = output_dir / f"desktop-input-{uuid.uuid4().hex}{audio_extension_for(content_type)}"
    audio_path.write_bytes(audio_bytes)
    quality = _wav_quality(audio_path) if audio_path.suffix.lower() == ".wav" else {}
    if _is_low_signal_wav(quality):
        return {
            "success": False,
            "transcript": "",
            "error": "Microphone input was silent or too short for reliable transcription.",
            "bytes": len(audio_bytes),
            "input_path": str(audio_path),
            "latency_ms": 0,
            "quality": quality,
        }

    started = time.perf_counter()
    payload = (transcriber or _default_transcriber)(str(audio_path))
    result = _coerce_mapping(payload)
    latency_ms = int((time.perf_counter() - started) * 1000)

    transcript = str(result.get("transcript") or "").strip()
    try:
        from tools.voice_mode import is_whisper_hallucination

        if is_whisper_hallucination(transcript):
            return {
                **result,
                "success": False,
                "transcript": "",
                "error": "Whisper returned a silence/noise hallucination instead of speech.",
                "bytes": len(audio_bytes),
                "input_path": str(audio_path),
                "latency_ms": latency_ms,
                "quality": quality,
                "filtered": True,
            }
    except Exception:
        pass
    success = bool(result.get("success")) and bool(transcript)
    return {
        **result,
        "success": success,
        "transcript": transcript,
        "bytes": len(audio_bytes),
        "input_path": str(audio_path),
        "latency_ms": latency_ms,
        "quality": quality,
    }


def _default_synthesizer(*, text: str, output_path: str) -> str | Mapping[str, Any]:
    from tools.tts_tool import text_to_speech_tool

    return text_to_speech_tool(text=text, output_path=output_path)


def _cfg_get(config: Mapping[str, Any], *keys: str, default: Any = None) -> Any:
    current: Any = config
    for key in keys:
        if not isinstance(current, Mapping):
            return default
        current = current.get(key)
    return default if current is None else current


def _load_tts_config() -> Mapping[str, Any]:
    try:
        from jarvis_cli.config import load_config

        config = load_config()
        return config if isinstance(config, Mapping) else {}
    except Exception:
        return {}


def _candidate_model_roots() -> list[Path]:
    roots: list[Path] = []
    for env_name in ("JARVIS_MODELS_DIR", "JARVIS_RESOURCE_ROOT"):
        value = os.getenv(env_name, "").strip()
        if value:
            base = Path(value)
            roots.append(base)
            roots.append(base / "models")
    roots.extend(
        [
            Path.home() / ".jarvis" / "models",
            Path.cwd() / "models",
            Path.cwd().parent / "models",
            Path(__file__).resolve().parents[1] / "models",
            Path(__file__).resolve().parents[2] / "models",
        ]
    )
    seen: set[str] = set()
    unique: list[Path] = []
    for root in roots:
        key = str(root.expanduser().resolve()) if root.exists() else str(root.expanduser())
        if key not in seen:
            seen.add(key)
            unique.append(root.expanduser())
    return unique


def _resolve_kokoro_assets(config: Mapping[str, Any]) -> dict[str, str]:
    configured_dir = str(_cfg_get(config, "tts", "kokoro", "model_dir", default="") or "").strip()
    candidates: list[Path] = []
    if configured_dir:
        candidates.append(Path(configured_dir).expanduser())
    for root in _candidate_model_roots():
        candidates.extend([root / "hexgrad__Kokoro-82M", root / "kokoro", root])

    model_dir = next(
        (
            base
            for base in candidates
            if (base / "kokoro-v1_0.pth").exists()
            and (base / "config.json").exists()
            and (base / "voices").exists()
        ),
        None,
    )
    if model_dir is None:
        return {}

    voice_name = str(_cfg_get(config, "tts", "kokoro", "voice", default="af_heart") or "af_heart").strip()
    voice_path = Path(voice_name).expanduser()
    if not voice_path.exists():
        voice_path = model_dir / "voices" / f"{voice_name.removesuffix('.pt')}.pt"
    if not voice_path.exists():
        voices = sorted((model_dir / "voices").glob("*.pt"))
        if not voices:
            return {}
        voice_path = voices[0]

    voice_stem = voice_path.stem
    lang_code = str(_cfg_get(config, "tts", "kokoro", "lang_code", default="") or "").strip()
    if not lang_code:
        lang_code = voice_stem[:1] if voice_stem[:1] else "a"

    return {
        "model_dir": str(model_dir),
        "model_path": str(model_dir / "kokoro-v1_0.pth"),
        "config_path": str(model_dir / "config.json"),
        "voice_path": str(voice_path),
        "voice": voice_stem,
        "lang_code": lang_code,
    }


def _prepare_kokoro_spacy_runtime() -> None:
    """Prevent Kokoro's English G2P from trying to download spaCy data in builds."""
    global _KOKORO_SPACY_PREPARED
    if _KOKORO_SPACY_PREPARED:
        return
    try:
        import en_core_web_sm  # noqa: F401
        import spacy.util

        original_is_package = spacy.util.is_package

        def is_package(name: str) -> bool:
            if name == "en_core_web_sm":
                return True
            return original_is_package(name)

        spacy.util.is_package = is_package
    except Exception:
        # If spaCy is not available, Kokoro will surface the provider error below.
        pass
    _KOKORO_SPACY_PREPARED = True


def _synthesize_kokoro_voice(text: str, output_path: Path) -> dict[str, Any]:
    """Generate a local Kokoro WAV from the configured downloaded model pack."""
    config = _load_tts_config()
    assets = _resolve_kokoro_assets(config)
    if not assets:
        return {
            "success": False,
            "provider": "kokoro",
            "engine": "kokoro-local",
            "error": "Kokoro model, config, or voice assets were not found in the configured model folders.",
        }

    try:
        import numpy as np
        import soundfile as sf
        import torch
        from kokoro import KModel, KPipeline
    except Exception as exc:
        return {
            "success": False,
            "provider": "kokoro",
            "engine": "kokoro-local",
            "error": f"Kokoro runtime is not installed for this Python runtime: {exc}",
            **assets,
        }

    speed = float(_cfg_get(config, "tts", "kokoro", "speed", default=1.0) or 1.0)
    device = str(_cfg_get(config, "tts", "kokoro", "device", default="cpu") or "cpu")
    cache_key = (assets["model_path"], assets["config_path"], assets["lang_code"])
    pipeline = _KOKORO_CACHE.get(cache_key)
    if pipeline is None:
        _prepare_kokoro_spacy_runtime()
        model = KModel(
            repo_id="hexgrad/Kokoro-82M",
            config=assets["config_path"],
            model=assets["model_path"],
        ).eval()
        pipeline = KPipeline(
            lang_code=assets["lang_code"],
            repo_id="hexgrad/Kokoro-82M",
            model=model,
            device=device,
        )
        _KOKORO_CACHE[cache_key] = pipeline

    chunks = []
    with torch.inference_mode():
        for result in pipeline(
            text,
            voice=assets["voice_path"],
            speed=speed,
            split_pattern=r"\n+",
        ):
            output = getattr(result, "output", None)
            audio = getattr(output, "audio", None) if output is not None else None
            if audio is not None:
                chunks.append(audio.detach().cpu().numpy())

    if not chunks:
        return {
            "success": False,
            "provider": "kokoro",
            "engine": "kokoro-local",
            "error": "Kokoro produced no audio.",
            **assets,
        }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    audio = chunks[0] if len(chunks) == 1 else np.concatenate(chunks)
    try:
        sf.write(str(output_path), audio, 24000)
    except Exception as exc:
        try:
            pcm = (np.clip(audio, -1.0, 1.0) * 32767).astype("<i2")
            with wave.open(str(output_path), "wb") as wav_file:
                wav_file.setnchannels(1)
                wav_file.setsampwidth(2)
                wav_file.setframerate(24000)
                wav_file.writeframes(pcm.tobytes())
        except Exception as wave_exc:
            return {
                "success": False,
                "provider": "kokoro",
                "engine": "kokoro-local",
                "error": (
                    "Kokoro generated audio but WAV write failed: "
                    f"{type(exc).__name__}: {exc}; stdlib wave fallback failed: "
                    f"{type(wave_exc).__name__}: {wave_exc}"
                ),
                **assets,
            }
    return {
        "success": output_path.exists() and output_path.stat().st_size > 0,
        "provider": "kokoro",
        "engine": "kokoro-local",
        "file_path": str(output_path),
        **assets,
    }


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

        config = load_config()
        provider = str(cfg_get(config, "tts", "provider", default="") or "").lower()
        if provider in {"", "edge", "system", "system-tts", "windows", "sapi"}:
            kokoro_ready = (
                importlib.util.find_spec("kokoro") is not None
                or importlib.util.find_spec("kokoro_onnx") is not None
            )
            if kokoro_ready and _resolve_kokoro_assets(config):
                return "kokoro"
        return provider
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

    if effective_provider == "docker":
        return {
            "success": False,
            "error": "Docker voice runtime has been removed from JARVIS Desktop. Use Kokoro, OmniVoice, system TTS, or OpenAI TTS.",
            "provider": "docker",
            "audio_base64": "",
            "audio_bytes": 0,
        }

    if synthesizer is None and effective_provider == "kokoro":
        output_dir = _writable_audio_dir(output_dir, "voice-output")
        output_path = output_dir / f"desktop-output-{uuid.uuid4().hex}.wav"
        started = time.perf_counter()
        try:
            result = _synthesize_kokoro_voice(spoken_text, output_path)
        except Exception as exc:
            result = {
                "success": False,
                "provider": "kokoro",
                "engine": "kokoro-local",
                "error": f"Kokoro synthesis crashed: {type(exc).__name__}: {exc}",
            }
        if not result.get("success") and os.name == "nt":
            try:
                fallback = _synthesize_windows_system_voice(spoken_text, output_path)
            except Exception as exc:
                fallback = {
                    "success": False,
                    "provider": "system",
                    "engine": "windows-sapi",
                    "error": f"Windows SAPI fallback crashed: {type(exc).__name__}: {exc}",
                }
            result = {
                **fallback,
                "provider": "system",
                "fallback_from": "kokoro",
                "fallback_reason": result.get("error", "Kokoro synthesis failed."),
            }
        latency_ms = int((time.perf_counter() - started) * 1000)
        if result.get("success"):
            audio_bytes = Path(str(result.get("file_path") or output_path)).read_bytes()
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
            "omnivoice",
        }
    ):
        output_dir = _writable_audio_dir(output_dir, "voice-output")
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

    output_dir = _writable_audio_dir(output_dir, "voice-output")
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


def warm_desktop_voice_models(output_dir: Path | None = None) -> dict[str, Any]:
    """Warm local TTS/STT models without playing audio in the renderer."""
    base_dir = output_dir or (Path(tempfile.gettempdir()) / "jarvis-agent" / "voice-warmup")
    base_dir = _writable_audio_dir(base_dir, "voice-warmup")
    started = time.perf_counter()
    payload: dict[str, Any] = {"success": False, "tts": {}, "stt": {}, "latency_ms": 0}
    try:
        tts = synthesize_desktop_speech("Jarvis voice ready.", base_dir, provider="kokoro")
        payload["tts"] = {
            "success": bool(tts.get("success")),
            "engine": tts.get("engine"),
            "provider": tts.get("provider"),
            "latency_ms": tts.get("latency_ms"),
            "error": tts.get("error") or tts.get("fallback_reason") or "",
        }
        if tts.get("success") and tts.get("audio_base64"):
            audio_bytes = base64.b64decode(str(tts["audio_base64"]))
            stt = transcribe_desktop_audio(audio_bytes, str(tts.get("mime_type") or "audio/wav"), base_dir)
            payload["stt"] = {
                "success": bool(stt.get("success")),
                "provider": stt.get("provider"),
                "latency_ms": stt.get("latency_ms"),
                "transcript": stt.get("transcript") or "",
                "error": stt.get("error") or "",
            }
        payload["success"] = bool((payload["tts"] or {}).get("success")) and bool((payload["stt"] or {}).get("success"))
    except Exception as exc:
        payload["error"] = f"{type(exc).__name__}: {exc}"
    payload["latency_ms"] = int((time.perf_counter() - started) * 1000)
    return payload


def start_desktop_voice_warmup(output_dir: Path | None = None) -> None:
    """Start one daemon warmup thread for packaged desktop voice models."""
    global _VOICE_WARMUP_STARTED
    if os.getenv("JARVIS_VOICE_WARMUP", "1").lower() in {"0", "false", "no"}:
        return
    with _VOICE_WARMUP_LOCK:
        if _VOICE_WARMUP_STARTED:
            return
        _VOICE_WARMUP_STARTED = True

    def run() -> None:
        try:
            # Let FastAPI bind first so the UI appears immediately.
            time.sleep(float(os.getenv("JARVIS_VOICE_WARMUP_DELAY_SECONDS", "0.25") or "0.25"))
            warm_desktop_voice_models(output_dir)
        except Exception:
            pass

    threading.Thread(target=run, name="jarvis-voice-warmup", daemon=True).start()
