"""Native local model runtime lifecycle for the desktop app.

This intentionally does not use Docker. The desktop backend starts local
executables such as llama-server as owned hidden children, probes their
OpenAI-compatible endpoint, and terminates them during app shutdown.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import time
import urllib.request
from pathlib import Path
from typing import Any

from jarvis_cli.config import load_config
from jarvis_cli.runtime_autoconfig import build_runtime_autoconfig_plan

_LLM_PROCESS: subprocess.Popen | None = None
_LLM_ENDPOINT = ""


def _creationflags() -> int:
    if os.name != "nt":
        return 0
    return int(getattr(subprocess, "CREATE_NO_WINDOW", 0))


def _endpoint_ok(endpoint: str, timeout: float = 1.5) -> bool:
    if not endpoint:
        return False
    base = endpoint.rstrip("/")
    url = f"{base}/models" if base.endswith("/v1") else f"{base}/v1/models"
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            return 200 <= response.status < 300
    except Exception:
        return False


def _port_from_endpoint(endpoint: str) -> str:
    match = re.search(r":(\d+)(?:/|$)", endpoint)
    return match.group(1) if match else "8080"


def _llama_server_command(plan: dict[str, Any]) -> list[str]:
    llm = plan.get("llm") or {}
    executable = shutil.which("llama-server")
    model_path = str(llm.get("model_path") or "")
    endpoint = str(llm.get("endpoint") or "http://127.0.0.1:8080/v1")
    if not executable:
        raise RuntimeError("llama-server was not found on PATH.")
    if not model_path or not Path(model_path).is_file():
        raise RuntimeError("No GGUF model file was found for llama.cpp.")
    has_nvidia = shutil.which("nvidia-smi") is not None
    ctx_size = "32768" if has_nvidia else "8192"
    gpu_layers = "999" if has_nvidia else "0"
    threads = str(max(2, min(os.cpu_count() or 4, 12)))
    return [
        executable,
        "--model",
        model_path,
        "--host",
        "127.0.0.1",
        "--port",
        _port_from_endpoint(endpoint),
        "--ctx-size",
        ctx_size,
        "--n-gpu-layers",
        gpu_layers,
        "--threads",
        threads,
    ]


def status_local_runtime() -> dict[str, Any]:
    running = _LLM_PROCESS is not None and _LLM_PROCESS.poll() is None
    return {
        "ok": running or _endpoint_ok(_LLM_ENDPOINT, timeout=0.5),
        "running": running,
        "pid": _LLM_PROCESS.pid if running and _LLM_PROCESS else None,
        "endpoint": _LLM_ENDPOINT,
        "endpoint_ready": _endpoint_ok(_LLM_ENDPOINT, timeout=0.5),
    }


def start_local_runtime(timeout_seconds: float = 45.0) -> dict[str, Any]:
    global _LLM_PROCESS, _LLM_ENDPOINT

    plan = build_runtime_autoconfig_plan(load_config())
    llm = plan.get("llm") or {}
    backend = str(llm.get("backend") or "")
    endpoint = str(llm.get("endpoint") or "")
    _LLM_ENDPOINT = endpoint

    if endpoint and _endpoint_ok(endpoint):
        return {"ok": True, "already_running": True, "endpoint": endpoint, "plan": plan}

    if _LLM_PROCESS is not None and _LLM_PROCESS.poll() is None:
        return {"ok": True, "running": True, "pid": _LLM_PROCESS.pid, "endpoint": endpoint, "plan": plan}

    if backend.lower() != "llama.cpp":
        return {
            "ok": False,
            "error": f"Native autostart currently supports llama.cpp; detected {backend or 'unconfigured'}.",
            "plan": plan,
        }

    command = _llama_server_command(plan)
    _LLM_PROCESS = subprocess.Popen(
        command,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        cwd=str(Path(command[0]).parent),
        creationflags=_creationflags(),
    )

    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        if _LLM_PROCESS.poll() is not None:
            return {
                "ok": False,
                "error": f"llama-server exited early with code {_LLM_PROCESS.returncode}.",
                "endpoint": endpoint,
                "plan": plan,
            }
        if _endpoint_ok(endpoint):
            return {"ok": True, "running": True, "pid": _LLM_PROCESS.pid, "endpoint": endpoint, "plan": plan}
        time.sleep(0.5)

    return {
        "ok": False,
        "running": _LLM_PROCESS.poll() is None,
        "pid": _LLM_PROCESS.pid if _LLM_PROCESS.poll() is None else None,
        "endpoint": endpoint,
        "error": "llama-server is still loading; endpoint was not ready before timeout.",
        "plan": plan,
    }


def stop_local_runtime(timeout_seconds: float = 8.0) -> dict[str, Any]:
    global _LLM_PROCESS
    proc = _LLM_PROCESS
    if proc is None or proc.poll() is not None:
        _LLM_PROCESS = None
        return {"ok": True, "stopped": False}

    proc.terminate()
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        if proc.poll() is not None:
            _LLM_PROCESS = None
            return {"ok": True, "stopped": True, "exit_code": proc.returncode}
        time.sleep(0.2)

    proc.kill()
    _LLM_PROCESS = None
    return {"ok": True, "stopped": True, "killed": True}
