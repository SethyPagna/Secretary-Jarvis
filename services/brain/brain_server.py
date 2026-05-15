from __future__ import annotations

import json
import importlib.util
import mimetypes
import os
import re
import shutil
import subprocess
import time
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from voice import VoiceService

HOST = "127.0.0.1"
PORT = int(os.environ.get("JARVIS_BRAIN_PORT", "5000"))
BUILD_ID = "brain-capabilities-v2"
PROJECT_ROOT = Path(__file__).resolve().parents[2]
SECRETARY_ROOT = PROJECT_ROOT.parent
HF_SNAPSHOT_ROOT = SECRETARY_ROOT / "models" / "huggingface" / "snapshots"
DATA_AUDIO_DIR = PROJECT_ROOT / "data" / "audio" / "tts"
TASKS: dict[str, dict[str, Any]] = {}
MEMORIES: list[dict[str, Any]] = []
SOCIAL_DRAFTS: list[dict[str, Any]] = []
VOICE = VoiceService(PROJECT_ROOT, SECRETARY_ROOT)

MODEL_SIZE_ESTIMATES_GB = {
    "Qwen/Qwen3.5-9B": 22,
    "Qwen/Qwen3.6-27B": 62,
    "google/gemma-4-E4B-it": 12,
    "google/gemma-4-26B-A4B-it": 32,
    "openai/whisper-large-v3-turbo": 3.2,
    "deepseek-ai/DeepSeek-V4-Flash": 380,
}

READY_MODEL_SNAPSHOTS = {
    "Qwen/Qwen3.5-9B": "Qwen__Qwen3.5-9B",
    "Qwen/Qwen3.6-27B": "Qwen__Qwen3.6-27B",
    "google/gemma-4-E4B-it": "gemma-4-E4B-it",
    "google/gemma-4-26B-A4B-it": "gemma-4-26B-A4B-it",
    "openai/whisper-large-v3-turbo": "openai__whisper-large-v3-turbo",
}


def package_available(name: str) -> bool:
    return importlib.util.find_spec(name) is not None


def snapshot_available(name: str) -> bool:
    return (HF_SNAPSHOT_ROOT / name).exists()


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


def audio_duration_seconds(file_path: str) -> float | None:
    try:
        with wave.open(file_path, "rb") as audio:
            frames = audio.getnframes()
            rate = audio.getframerate()
            return round(frames / float(rate), 3) if rate else None
    except Exception:
        return None


def ps_quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def synthesize_with_windows_sapi(text: str) -> dict[str, Any]:
    DATA_AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = re.sub(r"[^a-zA-Z0-9_-]+", "-", text.strip()[:32]).strip("-") or "jarvis"
    output = DATA_AUDIO_DIR / f"{int(time.time())}-{safe_name}.wav"
    script = (
        "Add-Type -AssemblyName System.Speech; "
        "$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
        f"$speaker.SetOutputToWaveFile({ps_quote(str(output))}); "
        f"$speaker.Speak({ps_quote(text[:2000])}); "
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


def capabilities_payload() -> dict[str, Any]:
    whisper_snapshot = snapshot_available("openai__whisper-large-v3-turbo")
    return {
        "service": "jarvis-python-brain",
        "buildId": BUILD_ID,
        "localOnly": True,
        "paths": {
            "projectRoot": str(PROJECT_ROOT),
            "hfSnapshots": str(HF_SNAPSHOT_ROOT),
            "audioArtifacts": str(DATA_AUDIO_DIR),
        },
        "capabilities": [
            *VOICE.capabilities(),
            {
                "id": "vision-file-inspector",
                "label": "Local image/file inspector",
                "kind": "vision",
                "status": "ready",
                "installed": True,
                "details": "Dependency-light local file metadata and optional PIL image dimensions.",
            },
        ],
    }


def model_readiness_payload() -> dict[str, Any]:
    models: list[dict[str, Any]] = []
    for model_ref, folder_name in READY_MODEL_SNAPSHOTS.items():
        folder = HF_SNAPSHOT_ROOT / folder_name
        present = folder.exists()
        config_present = (folder / "config.json").exists()
        tokenizer_present = any((folder / name).exists() for name in ["tokenizer.json", "tokenizer.model", "vocab.json"])
        shard_count = len(list(folder.glob("*.safetensors"))) if present else 0
        models.append(
            {
                "modelRef": model_ref,
                "folder": str(folder),
                "downloadState": "complete" if present and config_present and shard_count > 0 else "partial" if present else "missing",
                "runtimeState": "ready-asset" if present else "missing",
                "configPresent": config_present,
                "tokenizerPresent": tokenizer_present,
                "safetensorShards": shard_count,
                "estimatedSizeGb": MODEL_SIZE_ESTIMATES_GB.get(model_ref),
                "message": "Asset detected locally; runtime probe decides whether it can be loaded now."
                if present
                else "Expected local snapshot folder is missing.",
            }
        )
    return {
        "snapshotRoot": str(HF_SNAPSHOT_ROOT),
        "localOnly": True,
        "models": models,
        "runtimePackages": {
            "transformers": package_available("transformers"),
            "torch": package_available("torch"),
            "accelerate": package_available("accelerate"),
            "sentencepiece": package_available("sentencepiece"),
        },
    }


def json_response(handler: BaseHTTPRequestHandler, status: int, payload: dict[str, Any]) -> None:
    body = json.dumps(payload, indent=2).encode("utf-8")
    handler.send_response(status)
    handler.send_header("content-type", "application/json; charset=utf-8")
    handler.send_header("access-control-allow-origin", "http://127.0.0.1:5174")
    handler.send_header("content-length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


class BrainHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("access-control-allow-origin", "http://127.0.0.1:5174")
        self.send_header("access-control-allow-methods", "GET,POST,OPTIONS")
        self.send_header("access-control-allow-headers", "content-type")
        self.end_headers()

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/health":
            capabilities = capabilities_payload()["capabilities"]
            json_response(
                self,
                200,
                {
                    "ok": True,
                    "service": "jarvis-python-brain",
                    "role": "orchestration-memory-rag-skills",
                    "localOnly": True,
                    "buildId": BUILD_ID,
                    "readyCapabilities": [item["id"] for item in capabilities if item["status"] == "ready"],
                },
            )
            return

        if path == "/capabilities":
            json_response(self, 200, capabilities_payload())
            return

        if path == "/tasks":
            json_response(self, 200, {"tasks": list(TASKS.values())})
            return

        if path == "/memory/search":
            json_response(self, 200, {"memories": MEMORIES[-20:]})
            return

        if path == "/audio/status":
            json_response(self, 200, VOICE.audio_status())
            return

        if path == "/models/readiness":
            json_response(self, 200, model_readiness_payload())
            return

        if path == "/voice/profiles":
            json_response(self, 200, VOICE.voice_profiles())
            return

        if path == "/voice/wake/status":
            json_response(self, 200, VOICE.wake_word_status())
            return

        if path == "/vision/status":
            json_response(
                self,
                200,
                {
                    "status": "ready",
                    "localOnly": True,
                    "engines": {
                        "pil": package_available("PIL"),
                        "opencv": package_available("cv2"),
                        "tesseract": bool(shutil.which("tesseract")),
                    },
                },
            )
            return

        if path == "/vision/readiness":
            json_response(
                self,
                200,
                {
                    "status": "approval-gated",
                    "localOnly": True,
                    "screenCapture": "requires-approval",
                    "webcamIdentity": "requires-approval",
                    "staticImage": "ready",
                    "ocr": "ready" if shutil.which("tesseract") else "missing-dependency",
                    "packages": {
                        "PIL": package_available("PIL"),
                        "opencv": package_available("cv2"),
                        "ultralytics": package_available("ultralytics"),
                    },
                },
            )
            return

        json_response(self, 404, {"error": "not found", "path": path, "buildId": BUILD_ID})

    def do_POST(self) -> None:
        length = int(self.headers.get("content-length", "0"))
        raw = self.rfile.read(length).decode("utf-8")
        try:
            payload = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            json_response(self, 400, {"error": "invalid json"})
            return

        path = urlparse(self.path).path
        if path == "/command":
            self.handle_command(payload)
            return

        if path.startswith("/tasks/") and path.endswith("/run"):
            task_id = path.split("/")[2]
            TASKS[task_id] = {
                "id": task_id,
                "status": "running",
                "input": payload,
                "checkpoint": "Python Brain accepted task for orchestration.",
            }
            json_response(self, 202, TASKS[task_id])
            return

        if path.startswith("/tasks/") and path.endswith("/checkpoint"):
            task_id = path.split("/")[2]
            task = TASKS.setdefault(task_id, {"id": task_id, "status": "running"})
            task["checkpoint"] = payload.get("checkpoint", "Checkpoint saved.")
            task["status"] = payload.get("status", task["status"])
            json_response(self, 200, task)
            return

        if path == "/memory/write":
            memory = {
                "id": payload.get("id", f"memory-{len(MEMORIES) + 1}"),
                "content": payload.get("content", ""),
                "kind": payload.get("kind", "semantic"),
                "tags": payload.get("tags", []),
            }
            MEMORIES.append(memory)
            json_response(self, 201, {"memory": memory})
            return

        if path == "/memory/search":
            query = str(payload.get("query", "")).lower()
            matches = [memory for memory in MEMORIES if query in str(memory.get("content", "")).lower()]
            json_response(self, 200, {"memories": matches})
            return

        if path == "/models/hf/dry-run":
            self.handle_hf_dry_run(payload)
            return

        if path == "/models/hf/probe":
            model_ref = str(payload.get("modelRef", "")).strip()
            readiness = model_readiness_payload()
            match = next((item for item in readiness["models"] if item["modelRef"] == model_ref), None)
            json_response(self, 200, {"probe": match, "runtimePackages": readiness["runtimePackages"]})
            return

        if path == "/models/hf/download":
            self.handle_hf_download(payload)
            return

        if path == "/voice/stt/probe":
            json_response(self, 200, VOICE.stt_probe())
            return

        if path == "/voice/wake/simulate":
            phrase = str(payload.get("phrase", "")).strip()
            json_response(self, 200, VOICE.simulate_wake_word(phrase))
            return

        if path == "/audio/stt/file":
            self.handle_stt_file(payload)
            return

        if path == "/audio/tts":
            self.handle_tts(payload)
            return

        if path == "/audio/tts/stop":
            reason = str(payload.get("reason", "owner interrupt")).strip()
            json_response(self, 200, VOICE.stop_speaking(reason))
            return

        if path == "/vision/analyze-image":
            self.handle_vision_analyze(payload)
            return

        if path == "/connectors/social/draft":
            self.handle_social_draft(payload)
            return

        json_response(self, 404, {"error": "not found", "path": path, "pathRepr": repr(path), "buildId": BUILD_ID})

    def handle_command(self, payload: dict[str, Any]) -> None:
        command = str(payload.get("command", "")).strip()
        json_response(
            self,
            200,
            {
                "accepted": bool(command),
                "response": "Python Brain received the command and would route it through MemoryOS, AgentOS, and C++ Muscle.",
                "command": command,
            },
        )

    def handle_hf_dry_run(self, payload: dict[str, Any]) -> None:
        model_ref = str(payload.get("modelRef", "")).strip()
        if not model_ref:
            json_response(self, 400, {"error": "modelRef is required"})
            return

        estimate = MODEL_SIZE_ESTIMATES_GB.get(model_ref)
        hf_path = shutil.which("hf")
        command = ["hf", "download", model_ref, "--dry-run"]
        output = ""
        if hf_path:
            try:
                output = subprocess.check_output(command, text=True, stderr=subprocess.STDOUT, timeout=30)
            except Exception as error:  # noqa: BLE001 - this is a diagnostic endpoint.
                output = str(error)

        json_response(
            self,
            200,
            {
                "modelRef": model_ref,
                "commandPreview": " ".join(command),
                "estimatedSizeGb": estimate,
                "hfInstalled": bool(hf_path),
                "dryRunOutput": output,
                "willDownload": False,
                "requiresApproval": True,
            },
        )

    def handle_hf_download(self, payload: dict[str, Any]) -> None:
        model_ref = str(payload.get("modelRef", "")).strip()
        approved = bool(payload.get("approved", False))
        if not model_ref:
            json_response(self, 400, {"error": "modelRef is required"})
            return
        if not approved:
            json_response(
                self,
                202,
                {
                    "modelRef": model_ref,
                    "status": "waiting-approval",
                    "message": "Download not started. Jarvis requires explicit approval after dry-run sizing.",
                },
            )
            return

        json_response(
            self,
            501,
            {
                "modelRef": model_ref,
                "status": "not-implemented",
                "message": "Approved HF download execution is reserved for the next installer slice.",
            },
        )

    def handle_stt_file(self, payload: dict[str, Any]) -> None:
        file_path = str(payload.get("filePath", "")).strip()
        json_response(self, 200, VOICE.transcribe_file(file_path))

    def handle_tts(self, payload: dict[str, Any]) -> None:
        text = str(payload.get("text", "")).strip()
        if not text:
            json_response(self, 400, {"error": "text is required"})
            return
        json_response(self, 200, VOICE.synthesize(text))

    def handle_vision_analyze(self, payload: dict[str, Any]) -> None:
        file_path = str(payload.get("filePath", "")).strip()
        info = file_info(file_path) if file_path else {}
        observations: list[str] = []
        if not file_path:
            json_response(
                self,
                400,
                {"status": "needs-input", "message": "filePath is required for local image analysis."},
            )
            return

        if not info.get("exists"):
            json_response(
                self,
                200,
                {
                    "status": "missing-file",
                    "file": info,
                    "summary": "The requested local image/file was not found.",
                    "observations": ["No external lookup was attempted."],
                },
            )
            return

        dimensions = None
        if package_available("PIL"):
            try:
                from PIL import Image  # type: ignore

                with Image.open(file_path) as image:
                    dimensions = {"width": image.width, "height": image.height, "mode": image.mode}
                    observations.append(f"Image dimensions: {image.width} x {image.height}.")
            except Exception as error:  # noqa: BLE001 - file may not be an image.
                observations.append(f"PIL could not parse image metadata: {error}.")

        observations.append(f"File size: {info.get('sizeBytes', 0)} bytes.")
        observations.append(f"MIME guess: {info.get('mime') or 'unknown'}.")
        json_response(
            self,
            200,
            {
                "status": "ready",
                "file": info,
                "dimensions": dimensions,
                "summary": "Local vision sidecar inspected the file without hosted inference.",
                "observations": observations,
            },
        )

    def handle_social_draft(self, payload: dict[str, Any]) -> None:
        draft = {
            "id": f"social-draft-{len(SOCIAL_DRAFTS) + 1}",
            "connectorId": payload.get("connectorId", "social-outbox"),
            "recipient": payload.get("recipient", "preview-recipient"),
            "channel": payload.get("channel", "preview-channel"),
            "content": payload.get("content", ""),
            "status": "waiting-approval",
            "auditSummary": "Draft only; no live social message was sent.",
        }
        SOCIAL_DRAFTS.append(draft)
        json_response(self, 201, {"draft": draft})

    def log_message(self, format: str, *args: Any) -> None:
        return


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), BrainHandler)
    print(f"Jarvis Python Brain listening on http://{HOST}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
