from __future__ import annotations

import importlib.util
from pathlib import Path
from typing import Any


class IdentityService:
    def __init__(self, project_root: Path, secretary_root: Path) -> None:
        self.project_root = project_root
        self.secretary_root = secretary_root
        self.voice_root = project_root / "assets" / "voice"
        self.identity_root = project_root / "data" / "identity"

    def readiness(self) -> dict[str, Any]:
        voice_samples = [path for path in self.voice_root.glob("*.mp3")]
        speaker_packages = self.available_packages(["speechbrain", "resemblyzer", "pyannote.audio"])
        face_packages = self.available_packages(["face_recognition", "cv2", "mediapipe"])
        speaker_ready = len(voice_samples) > 0 and len(speaker_packages) > 0
        face_ready = any(package["installed"] for package in face_packages)
        return {
            "status": "staged" if voice_samples else "missing-dependency",
            "localOnly": True,
            "ownerProfileId": "owner-primary",
            "voiceVerification": {
                "status": "ready" if speaker_ready else "staged" if voice_samples else "missing-dependency",
                "sampleCount": len(voice_samples),
                "sampleFolder": str(self.voice_root),
                "packages": speaker_packages,
                "message": "Speaker verification is staged until a local voiceprint package is installed."
                if not speaker_ready
                else "Local speaker verification package and samples are available.",
            },
            "faceRecognition": {
                "status": "requires-approval" if face_ready else "missing-dependency",
                "cameraStatus": "locked",
                "packages": face_packages,
                "message": "Camera identity remains opt-in and approval-gated.",
            },
            "trustedDevices": [
                {
                    "id": "asus-g14-rx6700s",
                    "label": "ASUS ROG Zephyrus G14",
                    "status": "trusted-local-device",
                }
            ],
            "privacyLocks": ["camera", "continuous-microphone", "biometric-retention"],
            "notes": [
                "No biometric capture is performed by readiness checks.",
                "Voice samples are owner-supplied identity assets.",
                "Face and speaker matching will store local templates only after approval.",
            ],
        }

    def recognize_dry_run(self, factors: list[str] | None = None) -> dict[str, Any]:
        requested = factors or ["voice", "face"]
        readiness = self.readiness()
        return {
            "status": "requires-approval",
            "hudState": "recognizing",
            "ownerProfileId": "owner-primary",
            "requestedFactors": requested,
            "captured": False,
            "confidence": None,
            "message": "Recognition dry-run staged. No mic audio, camera frames, or biometric templates were captured.",
            "dataTouchedIfApproved": ["voiceprint", "face embedding", "trusted device signal"],
            "readiness": readiness,
        }

    @staticmethod
    def available_packages(names: list[str]) -> list[dict[str, Any]]:
        packages: list[dict[str, Any]] = []
        for name in names:
            try:
                installed = importlib.util.find_spec(name) is not None
            except ModuleNotFoundError:
                installed = False
            packages.append({"name": name, "installed": installed})
        return packages
