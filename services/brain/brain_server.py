from __future__ import annotations

import json
import shutil
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import urlparse

HOST = "127.0.0.1"
PORT = 5000
BUILD_ID = "model-voice-social-v1"
TASKS: dict[str, dict[str, Any]] = {}
MEMORIES: list[dict[str, Any]] = []
SOCIAL_DRAFTS: list[dict[str, Any]] = []

MODEL_SIZE_ESTIMATES_GB = {
    "Qwen/Qwen3.5-9B": 22,
    "Qwen/Qwen3.6-27B": 62,
    "google/gemma-4-E4B-it": 12,
    "openai/whisper-large-v3-turbo": 3.2,
    "deepseek-ai/DeepSeek-V4-Flash": 380,
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
            json_response(
                self,
                200,
                {
                    "ok": True,
                    "service": "jarvis-python-brain",
                    "role": "orchestration-memory-rag-skills",
                    "localOnly": True,
                    "buildId": BUILD_ID,
                },
            )
            return

        if path == "/tasks":
            json_response(self, 200, {"tasks": list(TASKS.values())})
            return

        if path == "/memory/search":
            json_response(self, 200, {"memories": MEMORIES[-20:]})
            return

        if path == "/audio/status":
            json_response(
                self,
                200,
                {
                    "stt": {"engine": "openai/whisper-large-v3-turbo", "installed": bool(shutil.which("hf"))},
                    "tts": {"engine": "piper", "installed": bool(shutil.which("piper"))},
                    "vad": {"engine": "package-backed-vad", "enabled": True},
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

        if path == "/models/hf/download":
            self.handle_hf_download(payload)
            return

        if path == "/audio/stt/file":
            self.handle_stt_file(payload)
            return

        if path == "/audio/tts":
            self.handle_tts(payload)
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
        hf_ready = bool(shutil.which("hf"))
        json_response(
            self,
            200,
            {
                "status": "ready" if hf_ready else "missing-engine",
                "engine": "openai/whisper-large-v3-turbo",
                "filePath": file_path,
                "text": "" if not hf_ready else f"Transcription placeholder for {file_path or 'local audio'}.",
                "message": "Install hf/transformers or whisper.cpp before real local transcription."
                if not hf_ready
                else "STT pipeline accepted the local audio file.",
            },
        )

    def handle_tts(self, payload: dict[str, Any]) -> None:
        text = str(payload.get("text", "")).strip()
        piper_ready = bool(shutil.which("piper"))
        json_response(
            self,
            200,
            {
                "status": "ready" if piper_ready else "missing-engine",
                "engine": "piper",
                "audioPath": "data/audio/tts/latest.wav" if piper_ready else None,
                "message": "Piper accepted local synthesis." if piper_ready else "Install Piper before real TTS.",
                "textPreview": text[:80],
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
