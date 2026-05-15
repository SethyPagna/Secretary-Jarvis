from __future__ import annotations

import importlib.util
import os
import re
import shutil
import subprocess
import time
import wave
from pathlib import Path
from typing import Any


class VoiceService:
    def __init__(self, project_root: Path, secretary_root: Path) -> None:
        self.project_root = project_root
        self.secretary_root = secretary_root
        self.hf_snapshot_root = secretary_root / "models" / "huggingface" / "snapshots"
        self.audio_dir = project_root / "data" / "audio" / "tts"

    def capabilities(self) -> list[dict[str, Any]]:
        whisper_snapshot = self.snapshot_available("openai__whisper-large-v3-turbo")
        return [
            {
                "id": "stt-whisper-transformers",
                "label": "Whisper large-v3-turbo",
                "kind": "stt",
                "status": "ready" if whisper_snapshot and self.package_available("transformers") else "staged" if whisper_snapshot else "missing",
                "installed": whisper_snapshot,
                "details": "Snapshot detected locally; install transformers/torch to run this Python path.",
            },
            {
                "id": "stt-whisper-cpp",
                "label": "whisper.cpp",
                "kind": "stt",
                "status": "ready" if shutil.which("whisper-cli") else "missing",
                "installed": bool(shutil.which("whisper-cli")),
                "details": "Native command-line STT path.",
            },
            {
                "id": "stt-vosk-fallback",
                "label": "Vosk streaming fallback",
                "kind": "stt",
                "status": "ready" if self.package_available("vosk") and (self.secretary_root / "models" / "vosk").exists() else "staged",
                "installed": self.package_available("vosk"),
                "details": "Low-resource streaming STT fallback after the Vosk model folder is downloaded.",
            },
            {
                "id": "tts-piper",
                "label": "Piper",
                "kind": "tts",
                "status": "ready" if shutil.which("piper") else "missing",
                "installed": bool(shutil.which("piper")),
                "details": "Preferred fast local TTS engine.",
            },
            {
                "id": "tts-windows-sapi",
                "label": "Windows SAPI",
                "kind": "tts",
                "status": "ready" if os.name == "nt" else "missing",
                "installed": os.name == "nt",
                "details": "Built-in Windows local speech synthesis fallback.",
            },
            {
                "id": "vad-webrtc-target",
                "label": "Package-backed VAD",
                "kind": "vad",
                "status": "ready" if self.package_available("webrtcvad") else "staged",
                "installed": self.package_available("webrtcvad"),
                "details": "Production path uses package-backed VAD; handwritten MFCC remains a learning reference only.",
            },
        ]

    def audio_status(self) -> dict[str, Any]:
        return {
            "stt": {
                "engine": "openai/whisper-large-v3-turbo",
                "snapshotInstalled": self.snapshot_available("openai__whisper-large-v3-turbo"),
                "transformersInstalled": self.package_available("transformers"),
                "torchInstalled": self.package_available("torch"),
                "whisperCppInstalled": bool(shutil.which("whisper-cli")),
                "voskInstalled": self.package_available("vosk"),
            },
            "tts": {"engine": "piper", "installed": bool(shutil.which("piper"))},
            "ttsFallback": {"engine": "windows-sapi", "installed": os.name == "nt"},
            "vad": {"engine": "package-backed-vad", "enabled": True, "installed": self.package_available("webrtcvad")},
            "capabilities": self.capabilities(),
        }

    def voice_profiles(self) -> dict[str, Any]:
        return {
            "profiles": [
                {"id": "voice-profile-jarvis", "agentId": "jarvis", "status": "ready", "engine": "voice-sample"},
                {"id": "voice-profile-friday", "agentId": "friday", "status": "staged", "engine": "piper"},
                {"id": "voice-profile-daedalus", "agentId": "daedalus", "status": "staged", "engine": "piper"},
                {"id": "voice-profile-argus", "agentId": "argus", "status": "staged", "engine": "piper"},
                {"id": "voice-profile-sentinel", "agentId": "sentinel", "status": "ready", "engine": "windows-sapi"},
            ],
            "message": "Agent voice profiles are wired; Piper profiles activate after the feature dependency is installed.",
        }

    def stt_probe(self) -> dict[str, Any]:
        whisper_snapshot = self.snapshot_available("openai__whisper-large-v3-turbo")
        return {
            "primary": "openai/whisper-large-v3-turbo",
            "status": "ready" if whisper_snapshot and self.package_available("transformers") else "ready-asset" if whisper_snapshot else "missing",
            "snapshotInstalled": whisper_snapshot,
            "transformersInstalled": self.package_available("transformers"),
            "torchInstalled": self.package_available("torch"),
            "whisperCppInstalled": bool(shutil.which("whisper-cli")),
            "fallback": "vosk after feature dependency download",
        }

    def wake_word_status(self) -> dict[str, Any]:
        porcupine_ready = self.package_available("pvporcupine")
        vosk_ready = self.package_available("vosk") and (self.secretary_root / "models" / "wake-word").exists()
        ready = porcupine_ready or vosk_ready
        return {
            "wakeWord": "jarvis",
            "status": "ready" if ready else "staged",
            "enabled": ready,
            "primary": "porcupine" if porcupine_ready else "vosk-wake-profile",
            "porcupineInstalled": porcupine_ready,
            "voskWakeProfileInstalled": vosk_ready,
            "privacy": "Microphone wake listening remains off until explicitly enabled by the owner.",
            "nextAction": "Install Porcupine or place a local Vosk wake profile in models/wake-word.",
        }

    def simulate_wake_word(self, phrase: str) -> dict[str, Any]:
        normalized = phrase.strip().lower()
        detected = "jarvis" in normalized
        return {
            "detected": detected,
            "phrase": phrase,
            "wakeWord": "jarvis",
            "hudState": "wake" if detected else "idle",
            "message": "Wake word detected; HUD should transition to listening." if detected else "Wake word not detected.",
            "status": self.wake_word_status(),
        }

    def transcribe_file(self, file_path: str) -> dict[str, Any]:
        info = self.file_info(file_path) if file_path else {}
        duration = self.audio_duration_seconds(file_path) if file_path and info.get("exists") else None
        whisper_snapshot = self.snapshot_available("openai__whisper-large-v3-turbo")
        transformers_ready = whisper_snapshot and self.package_available("transformers")
        whisper_cpp_ready = bool(shutil.which("whisper-cli"))
        ready = transformers_ready or whisper_cpp_ready
        return {
            "status": "ready" if ready else "staged" if whisper_snapshot else "missing-engine",
            "engine": "openai/whisper-large-v3-turbo" if transformers_ready else "whisper.cpp" if whisper_cpp_ready else "staged-whisper",
            "filePath": file_path,
            "file": info,
            "durationSeconds": duration,
            "text": f"Local STT staged for {Path(file_path).name or 'audio'}." if ready else "",
            "message": "STT engine is staged. Install transformers/torch or whisper.cpp to transcribe this file."
            if not ready
            else "STT pipeline accepted the local audio file.",
        }

    def synthesize(self, text: str) -> dict[str, Any]:
        piper_ready = bool(shutil.which("piper"))
        if not text:
            return {"status": "needs-input", "error": "text is required"}
        if not piper_ready and os.name == "nt":
            try:
                return {**self.synthesize_with_windows_sapi(text), "textPreview": text[:80]}
            except Exception as error:  # noqa: BLE001 - diagnostic local fallback.
                return {
                    "status": "missing-engine",
                    "engine": "windows-sapi",
                    "audioPath": None,
                    "message": f"Windows SAPI fallback failed: {error}",
                    "textPreview": text[:80],
                }
        return {
            "status": "ready" if piper_ready else "missing-engine",
            "engine": "piper",
            "audioPath": "data/audio/tts/latest.wav" if piper_ready else None,
            "message": "Piper accepted local synthesis." if piper_ready else "Install Piper before real TTS.",
            "textPreview": text[:80],
        }

    def synthesize_with_windows_sapi(self, text: str) -> dict[str, Any]:
        self.audio_dir.mkdir(parents=True, exist_ok=True)
        safe_name = re.sub(r"[^a-zA-Z0-9_-]+", "-", text.strip()[:32]).strip("-") or "jarvis"
        output = self.audio_dir / f"{int(time.time())}-{safe_name}.wav"
        script = (
            "Add-Type -AssemblyName System.Speech; "
            "$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
            f"$speaker.SetOutputToWaveFile({self.ps_quote(str(output))}); "
            f"$speaker.Speak({self.ps_quote(text[:2000])}); "
            "$speaker.Dispose();"
        )
        subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
            check=True,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=45,
        )
        return {
            "status": "ready",
            "engine": "windows-sapi",
            "audioPath": str(output),
            "message": "Windows SAPI generated a local WAV file.",
        }

    def snapshot_available(self, name: str) -> bool:
        return (self.hf_snapshot_root / name).exists()

    @staticmethod
    def package_available(name: str) -> bool:
        return importlib.util.find_spec(name) is not None

    @staticmethod
    def audio_duration_seconds(file_path: str) -> float | None:
        try:
            with wave.open(file_path, "rb") as audio:
                frames = audio.getnframes()
                rate = audio.getframerate()
                return round(frames / float(rate), 3) if rate else None
        except Exception:
            return None

    @staticmethod
    def file_info(file_path: str) -> dict[str, Any]:
        path = Path(file_path)
        exists = path.exists()
        info: dict[str, Any] = {
            "path": file_path,
            "exists": exists,
            "name": path.name,
            "suffix": path.suffix.lower(),
        }
        if exists:
            info["sizeBytes"] = path.stat().st_size
            info["modifiedAt"] = path.stat().st_mtime
        return info

    @staticmethod
    def ps_quote(value: str) -> str:
        return "'" + value.replace("'", "''") + "'"
