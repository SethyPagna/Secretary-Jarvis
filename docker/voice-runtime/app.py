from __future__ import annotations

import base64
import importlib.util
import os
import subprocess
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request
from pydantic import BaseModel

app = FastAPI(title="JARVIS Local Voice Runtime")

_whisper_model: Any | None = None
_whisper_key: tuple[str, str, str] | None = None
_kokoro_pipeline: Any | None = None
_kokoro_lang: str | None = None


class TTSRequest(BaseModel):
    text: str
    voice: str | None = None


def _elapsed_ms(started: float) -> int:
    return int((time.perf_counter() - started) * 1000)


def _load_whisper_model():
    global _whisper_key, _whisper_model
    from faster_whisper import WhisperModel

    model = os.getenv("JARVIS_STT_MODEL", "base")
    device = os.getenv("JARVIS_STT_DEVICE", "auto")
    compute_type = os.getenv("JARVIS_STT_COMPUTE_TYPE", "int8")
    key = (model, device, compute_type)
    if _whisper_model is None or _whisper_key != key:
        _whisper_model = WhisperModel(
            model,
            device=device,
            compute_type=compute_type,
            download_root="/models/whisper",
        )
        _whisper_key = key
    return _whisper_model


def _find_kokoro_dir() -> str:
    roots = [Path("/models"), Path("/voices")]
    for root in roots:
        try:
            if not root.exists():
                continue
            for candidate in (root / "hexgrad__Kokoro-82M", root / "kokoro", root):
                if (candidate / "kokoro-v1_0.pth").exists() and (candidate / "voices").exists():
                    return str(candidate)
        except OSError:
            continue
    return ""


def _kokoro_voice(default: str = "am_adam") -> str:
    configured = os.getenv("JARVIS_TTS_VOICE", default).strip() or default
    return configured.removesuffix(".pt")


def _load_kokoro_pipeline():
    global _kokoro_pipeline, _kokoro_lang
    from kokoro import KPipeline

    lang = os.getenv("JARVIS_KOKORO_LANG", "a")
    if _kokoro_pipeline is None or _kokoro_lang != lang:
        _kokoro_pipeline = KPipeline(lang_code=lang)
        _kokoro_lang = lang
    return _kokoro_pipeline


def _try_kokoro_tts(text: str, voice: str, output_path: Path) -> dict[str, Any] | None:
    if importlib.util.find_spec("kokoro") is None or importlib.util.find_spec("soundfile") is None:
        return None
    try:
        import soundfile as sf

        pipeline = _load_kokoro_pipeline()
        generator = pipeline(text, voice=voice)
        chunks = []
        for _graphemes, _phonemes, audio in generator:
            chunks.append(audio)
        if not chunks:
            return {
                "success": False,
                "engine": "kokoro",
                "error": "Kokoro returned no audio chunks.",
            }

        import numpy as np

        merged = np.concatenate(chunks)
        sf.write(str(output_path), merged, 24000)
        return {
            "success": output_path.exists() and output_path.stat().st_size > 0,
            "engine": "kokoro",
            "voice": voice,
            "model_dir": _find_kokoro_dir(),
        }
    except Exception as exc:
        return {
            "success": False,
            "engine": "kokoro",
            "error": f"{type(exc).__name__}: {exc}",
            "model_dir": _find_kokoro_dir(),
        }


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "stt_model": os.getenv("JARVIS_STT_MODEL", "base"),
        "stt_device": os.getenv("JARVIS_STT_DEVICE", "auto"),
        "stt_compute_type": os.getenv("JARVIS_STT_COMPUTE_TYPE", "int8"),
        "tts_engine": "kokoro" if importlib.util.find_spec("kokoro") else "espeak-ng",
        "kokoro_model_dir": _find_kokoro_dir(),
        "voice_assets_dir": "/voices",
    }


@app.post("/stt/raw")
async def stt_raw(request: Request) -> dict[str, Any]:
    started = time.perf_counter()
    audio = await request.body()
    if not audio:
        return {
            "success": False,
            "transcript": "",
            "error": "No audio bytes received.",
            "latency_ms": _elapsed_ms(started),
        }

    suffix = request.headers.get("x-audio-extension", ".webm")
    if not suffix.startswith(".") or len(suffix) > 12:
        suffix = ".webm"

    input_path = Path(tempfile.gettempdir()) / f"jarvis-stt-{uuid.uuid4().hex}{suffix}"
    input_path.write_bytes(audio)
    try:
        model = _load_whisper_model()
        language = os.getenv("JARVIS_STT_LANGUAGE", "en") or None
        segments, info = model.transcribe(str(input_path), language=language)
        transcript = " ".join(segment.text.strip() for segment in segments).strip()
        return {
            "success": bool(transcript),
            "transcript": transcript,
            "engine": "faster-whisper",
            "language": getattr(info, "language", language or ""),
            "latency_ms": _elapsed_ms(started),
        }
    except Exception as exc:
        return {
            "success": False,
            "transcript": "",
            "engine": "faster-whisper",
            "error": f"{type(exc).__name__}: {exc}",
            "latency_ms": _elapsed_ms(started),
        }
    finally:
        input_path.unlink(missing_ok=True)


@app.post("/tts")
def tts(request: TTSRequest) -> dict[str, Any]:
    started = time.perf_counter()
    text = request.text.strip()
    if not text:
        return {
            "success": False,
            "audio_base64": "",
            "audio_bytes": 0,
            "error": "No text received.",
            "latency_ms": _elapsed_ms(started),
        }

    output_path = Path(tempfile.gettempdir()) / f"jarvis-tts-{uuid.uuid4().hex}.wav"
    voice = request.voice or _kokoro_voice()
    preferred_engine = os.getenv("JARVIS_TTS_ENGINE", "kokoro").strip().lower()
    kokoro_result = None
    if preferred_engine in {"kokoro", "auto"}:
        kokoro_result = _try_kokoro_tts(text, voice, output_path)
        if kokoro_result and kokoro_result.get("success"):
            audio = output_path.read_bytes()
            output_path.unlink(missing_ok=True)
            return {
                "success": True,
                "audio_base64": base64.b64encode(audio).decode("ascii"),
                "audio_bytes": len(audio),
                "mime_type": "audio/wav",
                "engine": "kokoro",
                "voice": voice,
                "latency_ms": _elapsed_ms(started),
            }

    system_voice = os.getenv("JARVIS_SYSTEM_TTS_VOICE", "en")
    completed = subprocess.run(
        ["espeak-ng", "-v", system_voice, "-w", str(output_path), text],
        check=False,
        capture_output=True,
        text=True,
        timeout=30,
    )
    if completed.returncode != 0 or not output_path.exists() or output_path.stat().st_size == 0:
        output_path.unlink(missing_ok=True)
        return {
            "success": False,
            "audio_base64": "",
            "audio_bytes": 0,
            "engine": "kokoro/espeak-ng",
            "error": (
                (kokoro_result or {}).get("error")
                or completed.stderr.strip()
                or "No local TTS engine produced audio."
            ),
            "latency_ms": _elapsed_ms(started),
        }

    audio = output_path.read_bytes()
    output_path.unlink(missing_ok=True)
    return {
        "success": True,
        "audio_base64": base64.b64encode(audio).decode("ascii"),
        "audio_bytes": len(audio),
        "mime_type": "audio/wav",
        "engine": "espeak-ng",
        "fallback_from": (kokoro_result or {}).get("engine") if kokoro_result else "",
        "latency_ms": _elapsed_ms(started),
    }
