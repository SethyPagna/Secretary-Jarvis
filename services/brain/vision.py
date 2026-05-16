from __future__ import annotations

import importlib.util
import mimetypes
import shutil
import subprocess
from pathlib import Path
from typing import Any


class VisionService:
    def __init__(self, project_root: Path, secretary_root: Path) -> None:
        self.project_root = project_root
        self.secretary_root = secretary_root
        self.hf_snapshot_root = secretary_root / "models" / "huggingface" / "snapshots"
        self.yolo_root = secretary_root / "models" / "yolo"
        self.ocr_root = secretary_root / "models" / "ocr"

    def capabilities(self) -> list[dict[str, Any]]:
        readiness = self.readiness()
        return [
            {
                "id": "vision-file-inspector",
                "label": "Local image/file inspector",
                "kind": "vision",
                "status": "ready",
                "installed": True,
                "details": "Dependency-light local file metadata and optional PIL image dimensions.",
            },
            {
                "id": "vision-gemma-qwen",
                "label": "Gemma/Qwen visual reasoning assets",
                "kind": "vision",
                "status": readiness["modelAssets"]["status"],
                "installed": readiness["modelAssets"]["readyCount"] > 0,
                "details": "Ready downloaded multimodal assets are detected; runtime probe decides whether they can run now.",
            },
            {
                "id": "vision-ocr",
                "label": "Local OCR",
                "kind": "ocr",
                "status": readiness["ocr"]["status"],
                "installed": readiness["ocr"]["installed"],
                "details": "Uses local Tesseract when available; otherwise remains a feature dependency.",
            },
            {
                "id": "vision-yolo",
                "label": "YOLO object detection",
                "kind": "object-detection",
                "status": readiness["objectDetection"]["status"],
                "installed": readiness["objectDetection"]["installed"],
                "details": "Fast local object detection activates when Ultralytics and weights are installed.",
            },
        ]

    def status(self) -> dict[str, Any]:
        return {
            "status": "ready",
            "localOnly": True,
            "engines": {
                "pil": self.package_available("PIL"),
                "opencv": self.package_available("cv2"),
                "tesseract": bool(shutil.which("tesseract")),
                "ultralytics": self.package_available("ultralytics"),
            },
            "privacy": {
                "screenCapture": "approval-required",
                "camera": "approval-required",
                "continuousTimeline": "locked",
            },
            "capabilities": self.capabilities(),
        }

    def readiness(self) -> dict[str, Any]:
        multimodal_assets = [
            self.asset_entry("Qwen/Qwen3.5-9B", self.hf_snapshot_root / "Qwen__Qwen3.5-9B"),
            self.asset_entry("Qwen/Qwen3.6-27B", self.hf_snapshot_root / "Qwen__Qwen3.6-27B"),
            self.asset_entry("google/gemma-4-E4B-it", self.hf_snapshot_root / "gemma-4-E4B-it"),
            self.asset_entry("google/gemma-4-26B-A4B-it", self.hf_snapshot_root / "gemma-4-26B-A4B-it"),
            self.asset_entry("llava/local", self.hf_snapshot_root / "llava"),
        ]
        ready_assets = [asset for asset in multimodal_assets if asset["detected"]]
        ocr_installed = bool(shutil.which("tesseract")) or self.package_available("pytesseract")
        yolo_installed = self.package_available("ultralytics") and self.yolo_root.exists()
        return {
            "status": "ready" if ready_assets else "staged",
            "localOnly": True,
            "modelAssets": {
                "status": "ready-asset" if ready_assets else "missing-dependency",
                "readyCount": len(ready_assets),
                "assets": multimodal_assets,
            },
            "ocr": {
                "status": "ready" if ocr_installed else "missing-dependency",
                "installed": ocr_installed,
                "command": shutil.which("tesseract"),
                "expectedPath": str(self.ocr_root),
            },
            "objectDetection": {
                "status": "ready" if yolo_installed else "missing-dependency",
                "installed": yolo_installed,
                "expectedPath": str(self.yolo_root),
            },
            "screen": {"status": "requires-approval", "continuousCapture": "locked"},
            "camera": {"status": "requires-approval", "identity": "staged"},
        }

    def analyze_image(self, file_path: str, include_ocr: bool = False) -> dict[str, Any]:
        info = self.file_info(file_path) if file_path else {}
        observations: list[str] = []
        if not file_path:
            return {"status": "needs-input", "message": "filePath is required for local image analysis."}

        if not info.get("exists"):
            return {
                "status": "missing-file",
                "file": info,
                "summary": "The requested local image/file was not found.",
                "observations": ["No external lookup was attempted."],
            }

        dimensions = self.image_dimensions(file_path, observations)
        ocr = self.ocr_image(file_path) if include_ocr else {"status": "not-requested"}
        observations.append(f"File size: {info.get('sizeBytes', 0)} bytes.")
        observations.append(f"MIME guess: {info.get('mime') or 'unknown'}.")
        observations.append("No hosted vision inference was used.")
        return {
            "status": "ready",
            "file": info,
            "dimensions": dimensions,
            "ocr": ocr,
            "objectDetection": {
                "status": "staged",
                "message": "YOLO object detection activates after Ultralytics and local weights are installed.",
            },
            "summary": "Local vision sidecar inspected the file without hosted inference.",
            "observations": observations,
        }

    def capture_screen_dry_run(self) -> dict[str, Any]:
        return {
            "status": "requires-approval",
            "mode": "screen",
            "captured": False,
            "message": "No screen pixels were captured. Screen analysis requires explicit owner approval.",
            "dataTouchedIfApproved": ["screen pixels", "OCR text", "active app context"],
        }

    def image_dimensions(self, file_path: str, observations: list[str]) -> dict[str, Any] | None:
        if not self.package_available("PIL"):
            observations.append("PIL is not installed; image dimensions unavailable.")
            return None
        try:
            from PIL import Image  # type: ignore

            with Image.open(file_path) as image:
                dimensions = {"width": image.width, "height": image.height, "mode": image.mode}
                observations.append(f"Image dimensions: {image.width} x {image.height}.")
                return dimensions
        except Exception as error:  # noqa: BLE001 - file may not be an image.
            observations.append(f"PIL could not parse image metadata: {error}.")
            return None

    def ocr_image(self, file_path: str) -> dict[str, Any]:
        tesseract = shutil.which("tesseract")
        if not tesseract:
            return {
                "status": "missing-dependency",
                "text": "",
                "message": "Tesseract is not installed or not on PATH.",
            }
        try:
            output = subprocess.check_output([tesseract, file_path, "stdout"], text=True, stderr=subprocess.STDOUT, timeout=20)
            return {
                "status": "ready",
                "text": output.strip(),
                "message": "OCR completed locally with Tesseract.",
            }
        except Exception as error:  # noqa: BLE001 - local diagnostic surface.
            return {
                "status": "failed",
                "text": "",
                "message": f"Tesseract OCR failed: {error}",
            }

    @staticmethod
    def package_available(name: str) -> bool:
        return importlib.util.find_spec(name) is not None

    @staticmethod
    def file_info(file_path: str) -> dict[str, Any]:
        path = Path(file_path)
        exists = path.exists()
        info: dict[str, Any] = {
            "path": file_path,
            "exists": exists,
            "name": path.name,
            "suffix": path.suffix.lower(),
            "mime": mimetypes.guess_type(str(path))[0],
        }
        if exists:
            info["sizeBytes"] = path.stat().st_size
            info["modifiedAt"] = path.stat().st_mtime
        return info

    @staticmethod
    def asset_entry(model_ref: str, path: Path) -> dict[str, Any]:
        return {
            "modelRef": model_ref,
            "path": str(path),
            "detected": path.exists(),
            "configPresent": (path / "config.json").exists(),
            "runtime": "local-snapshot",
        }
