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
import tempfile
import threading
import time
import urllib.request
from pathlib import Path
from typing import Any

from jarvis_cli.config import load_config
from jarvis_cli.runtime_autoconfig import build_runtime_autoconfig_plan

_LLM_PROCESS: subprocess.Popen | None = None
_LLM_ENDPOINT = ""
_ADOPTED_LLM_PID: int | None = None
_LLM_JOB_HANDLE: int | None = None
_LAST_ACTIVITY_AT = time.time()
_IDLE_THREAD: threading.Thread | None = None
_IDLE_LOCK = threading.Lock()
_LAST_LOG_PATH = ""
_LLM_MODEL = ""
_LLM_BACKEND = ""
_LLM_MODEL_PATH = ""


def _minimal_idle_timeout_seconds() -> float:
    if os.getenv("JARVIS_MINIMAL", "").lower() in {"1", "true", "yes"}:
        return 60.0
    try:
        return float(os.getenv("JARVIS_LOCAL_RUNTIME_IDLE_SECONDS", "300") or "300")
    except ValueError:
        return 300.0


def touch_local_runtime_activity() -> None:
    global _LAST_ACTIVITY_AT
    _LAST_ACTIVITY_AT = time.time()


def _ensure_idle_unloader() -> None:
    global _IDLE_THREAD
    with _IDLE_LOCK:
        if _IDLE_THREAD is not None and _IDLE_THREAD.is_alive():
            return

        def idle_loop() -> None:
            while True:
                time.sleep(5.0)
                status = status_local_runtime()
                if not status.get("running"):
                    continue
                if time.time() - _LAST_ACTIVITY_AT >= _minimal_idle_timeout_seconds():
                    stop_local_runtime(timeout_seconds=8.0)

        _IDLE_THREAD = threading.Thread(
            target=idle_loop,
            name="jarvis-local-runtime-idle-unloader",
            daemon=True,
        )
        _IDLE_THREAD.start()


def _creationflags() -> int:
    if os.name != "nt":
        return 0
    return int(getattr(subprocess, "CREATE_NO_WINDOW", 0))


def _attach_kill_on_close_job(proc: subprocess.Popen) -> int | None:
    """Attach a Windows job so owned llama-server dies with this backend."""
    if os.name != "nt":
        return None
    try:
        import ctypes
        from ctypes import wintypes
    except Exception:
        return None

    class IO_COUNTERS(ctypes.Structure):
        _fields_ = [
            ("ReadOperationCount", ctypes.c_ulonglong),
            ("WriteOperationCount", ctypes.c_ulonglong),
            ("OtherOperationCount", ctypes.c_ulonglong),
            ("ReadTransferCount", ctypes.c_ulonglong),
            ("WriteTransferCount", ctypes.c_ulonglong),
            ("OtherTransferCount", ctypes.c_ulonglong),
        ]

    class JOBOBJECT_BASIC_LIMIT_INFORMATION(ctypes.Structure):
        _fields_ = [
            ("PerProcessUserTimeLimit", ctypes.c_longlong),
            ("PerJobUserTimeLimit", ctypes.c_longlong),
            ("LimitFlags", wintypes.DWORD),
            ("MinimumWorkingSetSize", ctypes.c_size_t),
            ("MaximumWorkingSetSize", ctypes.c_size_t),
            ("ActiveProcessLimit", wintypes.DWORD),
            ("Affinity", ctypes.c_size_t),
            ("PriorityClass", wintypes.DWORD),
            ("SchedulingClass", wintypes.DWORD),
        ]

    class JOBOBJECT_EXTENDED_LIMIT_INFORMATION(ctypes.Structure):
        _fields_ = [
            ("BasicLimitInformation", JOBOBJECT_BASIC_LIMIT_INFORMATION),
            ("IoInfo", IO_COUNTERS),
            ("ProcessMemoryLimit", ctypes.c_size_t),
            ("JobMemoryLimit", ctypes.c_size_t),
            ("PeakProcessMemoryUsed", ctypes.c_size_t),
            ("PeakJobMemoryUsed", ctypes.c_size_t),
        ]

    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel32.CreateJobObjectW.argtypes = (wintypes.LPVOID, wintypes.LPCWSTR)
    kernel32.CreateJobObjectW.restype = wintypes.HANDLE
    kernel32.SetInformationJobObject.argtypes = (
        wintypes.HANDLE,
        ctypes.c_int,
        wintypes.LPVOID,
        wintypes.DWORD,
    )
    kernel32.SetInformationJobObject.restype = wintypes.BOOL
    kernel32.AssignProcessToJobObject.argtypes = (wintypes.HANDLE, wintypes.HANDLE)
    kernel32.AssignProcessToJobObject.restype = wintypes.BOOL

    job = kernel32.CreateJobObjectW(None, None)
    if not job:
        return None
    info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION()
    info.BasicLimitInformation.LimitFlags = 0x00002000
    if not kernel32.SetInformationJobObject(job, 9, ctypes.byref(info), ctypes.sizeof(info)):
        kernel32.CloseHandle(job)
        return None
    if not kernel32.AssignProcessToJobObject(job, int(proc._handle)):  # noqa: SLF001
        kernel32.CloseHandle(job)
        return None
    return int(job)


def _close_job_handle() -> None:
    global _LLM_JOB_HANDLE
    if os.name == "nt" and _LLM_JOB_HANDLE:
        try:
            import ctypes

            ctypes.windll.kernel32.CloseHandle(_LLM_JOB_HANDLE)
        except Exception:
            pass
    _LLM_JOB_HANDLE = None


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


def _find_existing_llama_server_pid(endpoint: str, model_path: str) -> int | None:
    """Find a local llama-server that matches JARVIS' selected model/port."""
    port = _port_from_endpoint(endpoint)
    model_norm = str(Path(model_path)).lower()
    try:
        import psutil
    except Exception:
        return None

    for proc in psutil.process_iter(["pid", "name", "cmdline"]):
        try:
            name = str(proc.info.get("name") or "").lower()
            cmdline = " ".join(str(part) for part in (proc.info.get("cmdline") or []))
            cmdline_lower = cmdline.lower()
        except (psutil.Error, OSError):
            continue
        if "llama-server" not in name and "llama-server" not in cmdline_lower:
            continue
        if f"--port {port}" not in cmdline_lower and f"--port={port}" not in cmdline_lower:
            continue
        if model_norm and model_norm not in cmdline_lower:
            continue
        return int(proc.info["pid"])
    return None


def _llama_server_executable() -> str | None:
    configured = os.getenv("JARVIS_LLAMA_SERVER_PATH", "").strip()
    candidates = []
    if configured:
        candidates.append(Path(configured).expanduser())

    resource_root = os.getenv("JARVIS_RESOURCE_ROOT", "").strip()
    if resource_root:
        root = Path(resource_root)
        candidates.extend(
            [
                root / "runtime" / "llama.cpp" / "llama-server.exe",
                root / "llama.cpp" / "llama-server.exe",
            ]
        )

    repo_root = Path(__file__).resolve().parent.parent
    candidates.extend(
        [
            repo_root / "runtime" / "llama.cpp" / "llama-server.exe",
            repo_root / "vendor" / "llama.cpp" / "llama-server.exe",
        ]
    )
    for candidate in candidates:
        if candidate.is_file():
            return str(candidate)
    return shutil.which("llama-server")


def _terminate_pid(pid: int, timeout_seconds: float) -> dict[str, Any]:
    try:
        import psutil

        proc = psutil.Process(pid)
        proc.terminate()
        try:
            proc.wait(timeout=timeout_seconds)
            return {"ok": True, "stopped": True, "pid": pid}
        except psutil.TimeoutExpired:
            proc.kill()
            return {"ok": True, "stopped": True, "killed": True, "pid": pid}
    except Exception as exc:
        return {"ok": False, "stopped": False, "pid": pid, "error": f"{type(exc).__name__}: {exc}"}


def _llama_server_command(plan: dict[str, Any]) -> list[str]:
    llm = plan.get("llm") or {}
    executable = _llama_server_executable()
    model_path = str(llm.get("model_path") or "")
    endpoint = str(llm.get("endpoint") or "http://127.0.0.1:8080/v1")
    if not executable:
        raise RuntimeError("llama-server was not found on PATH.")
    if not model_path or not Path(model_path).is_file():
        raise RuntimeError("No GGUF model file was found for llama.cpp.")
    has_nvidia = shutil.which("nvidia-smi") is not None
    ctx_size = str(os.getenv("JARVIS_LLAMA_CPP_CTX_SIZE") or "8192")
    gpu_layers = "999" if has_nvidia else "0"
    try:
        import psutil

        physical_cores = psutil.cpu_count(logical=False) or psutil.cpu_count(logical=True)
    except Exception:
        physical_cores = os.cpu_count()
    threads = str(max(2, int(physical_cores or 4)))
    batch = str(os.getenv("JARVIS_LLAMA_CPP_BATCH_SIZE") or "256")
    command = [
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
        "--batch-size",
        batch,
    ]
    if _llama_server_supports_flag(executable, "--flash-attn"):
        command.extend(["--flash-attn", os.getenv("JARVIS_LLAMA_CPP_FLASH_ATTN") or "auto"])
    return command


def _plan_summary(plan: dict[str, Any]) -> dict[str, Any]:
    """Keep runtime start/status responses small enough for the desktop UI."""
    llm = plan.get("llm") if isinstance(plan.get("llm"), dict) else {}
    tts = plan.get("tts") if isinstance(plan.get("tts"), dict) else {}
    stt = plan.get("stt") if isinstance(plan.get("stt"), dict) else {}
    return {
        "production_ready": bool(plan.get("production_ready")),
        "model_roots": list(plan.get("model_roots") or [])[:8],
        "llm": {
            "backend": llm.get("backend"),
            "model": llm.get("model"),
            "model_path": llm.get("model_path"),
            "endpoint": llm.get("endpoint"),
            "dependency_ready": bool(llm.get("dependency_ready")),
            "optimization": llm.get("optimization"),
        },
        "tts": {
            "provider": tts.get("provider"),
            "target_provider": tts.get("target_provider"),
            "dependency_ready": bool(tts.get("dependency_ready")),
            "fallback_chain": list(tts.get("fallback_chain") or [])[:5],
        },
        "stt": {
            "provider": stt.get("provider"),
            "engine": stt.get("engine"),
            "dependency_ready": bool(stt.get("dependency_ready")),
            "selected_model": stt.get("selected_model"),
        },
        "actions": list(plan.get("actions") or [])[:8],
    }


def _runtime_log_path() -> Path:
    try:
        from jarvis_constants import get_jarvis_home

        log_dir = get_jarvis_home() / "logs"
    except Exception:
        log_dir = Path.home() / ".jarvis" / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    return log_dir / f"local-runtime-{os.getpid()}.log"


def _open_runtime_log_file() -> tuple[Path, Any]:
    """Open a runtime log, falling back if the user data log dir is locked."""
    log_path = _runtime_log_path()
    try:
        return log_path, open(log_path, "ab", buffering=0)
    except OSError:
        fallback_dir = Path(tempfile.gettempdir()) / "jarvis-agent"
        fallback_dir.mkdir(parents=True, exist_ok=True)
        fallback_path = fallback_dir / f"local-runtime-{os.getpid()}.log"
        return fallback_path, open(fallback_path, "ab", buffering=0)


def _tail_log(path: str | Path, lines: int = 40) -> list[str]:
    try:
        content = Path(path).read_text(encoding="utf-8", errors="replace")
    except Exception:
        return []
    return content.splitlines()[-lines:]


def _llama_server_supports_flag(executable: str, flag: str) -> bool:
    try:
        completed = subprocess.run(
            [executable, "--help"],
            check=False,
            capture_output=True,
            text=True,
            timeout=2.0,
        )
    except Exception:
        return False
    return flag in ((completed.stdout or "") + (completed.stderr or ""))


def _ps_quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def _start_detached_with_powershell(command: list[str], cwd: str) -> tuple[int | None, str]:
    """Start a helper through PowerShell and return the real child PID.

    Some Winget-installed executables can be launched from the user's shell but
    reject direct CreateProcess calls from the packaged PyInstaller backend.
    PowerShell Start-Process follows the same user shell path and gives us a PID
    that JARVIS can adopt and stop during shutdown.
    """
    executable = command[0]
    args_literal = _ps_quote(subprocess.list2cmdline(command[1:]))
    script = (
        "$ErrorActionPreference='Stop';"
        f"$p=Start-Process -FilePath {_ps_quote(executable)} "
        f"-ArgumentList {args_literal} "
        f"-WorkingDirectory {_ps_quote(cwd)} "
        "-WindowStyle Hidden -PassThru;"
        "$p.Id"
    )
    completed = subprocess.run(
        [
            "powershell.exe",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ],
        check=False,
        capture_output=True,
        text=True,
        timeout=20.0,
        creationflags=_creationflags(),
    )
    output = ((completed.stdout or "") + (completed.stderr or "")).strip()
    if completed.returncode != 0:
        raise RuntimeError(output or f"PowerShell Start-Process exited with {completed.returncode}.")
    match = re.search(r"(\d+)\s*$", output)
    return (int(match.group(1)) if match else None), output


def status_local_runtime() -> dict[str, Any]:
    running = _LLM_PROCESS is not None and _LLM_PROCESS.poll() is None
    adopted_running = False
    if _ADOPTED_LLM_PID:
        try:
            import psutil

            adopted_running = psutil.pid_exists(_ADOPTED_LLM_PID)
        except Exception:
            adopted_running = False
    return {
        "ok": running or adopted_running or _endpoint_ok(_LLM_ENDPOINT, timeout=0.5),
        "running": running or adopted_running,
        "pid": _LLM_PROCESS.pid if running and _LLM_PROCESS else _ADOPTED_LLM_PID if adopted_running else None,
        "adopted": adopted_running,
        "endpoint": _LLM_ENDPOINT,
        "endpoint_ready": _endpoint_ok(_LLM_ENDPOINT, timeout=0.5),
        "log_path": _LAST_LOG_PATH,
        "model": _LLM_MODEL,
        "backend": _LLM_BACKEND,
        "model_path": _LLM_MODEL_PATH,
    }


def start_local_runtime(timeout_seconds: float = 45.0) -> dict[str, Any]:
    global _LLM_PROCESS, _LLM_ENDPOINT, _ADOPTED_LLM_PID, _LLM_JOB_HANDLE, _LAST_LOG_PATH
    global _LLM_MODEL, _LLM_BACKEND, _LLM_MODEL_PATH

    plan = build_runtime_autoconfig_plan(load_config())
    llm = plan.get("llm") or {}
    backend = str(llm.get("backend") or "")
    endpoint = str(llm.get("endpoint") or "")
    model_path = str(llm.get("model_path") or "")
    _LLM_MODEL = str(llm.get("model") or (Path(model_path).stem if model_path else ""))
    _LLM_BACKEND = backend
    _LLM_MODEL_PATH = model_path
    _LLM_ENDPOINT = endpoint
    touch_local_runtime_activity()
    _ensure_idle_unloader()

    if _LLM_PROCESS is not None and _LLM_PROCESS.poll() is None:
        return {
            "ok": True,
            "running": True,
            "pid": _LLM_PROCESS.pid,
            "adopted": False,
            "endpoint": endpoint,
            "plan": _plan_summary(plan),
        }

    if endpoint and _endpoint_ok(endpoint):
        adopted_pid = _find_existing_llama_server_pid(endpoint, model_path)
        _ADOPTED_LLM_PID = adopted_pid
        return {
            "ok": True,
            "already_running": True,
            "adopted": adopted_pid is not None,
            "pid": adopted_pid,
            "endpoint": endpoint,
            "plan": _plan_summary(plan),
        }

    if backend.lower() != "llama.cpp":
        return {
            "ok": False,
            "error": f"Native autostart currently supports llama.cpp; detected {backend or 'unconfigured'}.",
            "plan": _plan_summary(plan),
        }

    command = _llama_server_command(plan)
    log_path, log_file = _open_runtime_log_file()
    _LAST_LOG_PATH = str(log_path)
    log_file.write(
        (
            f"\n=== llama-server start {time.strftime('%Y-%m-%d %H:%M:%S')} ===\n"
            f"command: {' '.join(command)}\n"
            f"cwd: {Path(command[0]).parent}\n"
        ).encode("utf-8", errors="replace")
    )
    popen_kwargs = {
        "stdin": subprocess.DEVNULL,
        "stdout": log_file,
        "stderr": subprocess.STDOUT,
        "cwd": str(Path(command[0]).parent),
        "creationflags": _creationflags(),
    }
    spawned_via_shell = False
    try:
        _LLM_PROCESS = subprocess.Popen(command, **popen_kwargs)
    except PermissionError:
        log_file.write(
            (
                "CreateProcess denied direct helper; retrying through PowerShell Start-Process:\n"
                f"cwd: {Path(command[0]).parent}\n"
            ).encode("utf-8", errors="replace")
        )
        try:
            started_pid, start_output = _start_detached_with_powershell(command, str(Path(command[0]).parent))
        except Exception as exc:
            log_file.write(
                f"PowerShell fallback failed: {type(exc).__name__}: {exc}\n".encode(
                    "utf-8",
                    errors="replace",
                )
            )
            raise
        if started_pid:
            _ADOPTED_LLM_PID = started_pid
        _LLM_PROCESS = None
        spawned_via_shell = True
        log_file.write(f"PowerShell fallback output: {start_output}\n".encode("utf-8", errors="replace"))
    try:
        _LLM_JOB_HANDLE = _attach_kill_on_close_job(_LLM_PROCESS)
    except Exception:
        _LLM_JOB_HANDLE = None

    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        if _LLM_PROCESS is not None and _LLM_PROCESS.poll() is not None and not spawned_via_shell:
            return {
                "ok": False,
                "error": f"llama-server exited early with code {_LLM_PROCESS.returncode}.",
                "endpoint": endpoint,
                "command": command,
                "log_path": str(log_path),
                "log_tail": _tail_log(log_path),
                "plan": _plan_summary(plan),
            }
        if _endpoint_ok(endpoint):
            adopted_pid = _find_existing_llama_server_pid(endpoint, model_path)
            if spawned_via_shell and adopted_pid:
                _ADOPTED_LLM_PID = adopted_pid
                _LLM_PROCESS = None
            return {
                "ok": True,
                "running": True,
                "pid": adopted_pid or (_LLM_PROCESS.pid if _LLM_PROCESS else None),
                "adopted": bool(adopted_pid),
                "endpoint": endpoint,
                "log_path": str(log_path),
                "plan": _plan_summary(plan),
            }
        time.sleep(0.5)

    return {
        "ok": False,
        "running": spawned_via_shell or (_LLM_PROCESS is not None and _LLM_PROCESS.poll() is None),
        "pid": (
            _ADOPTED_LLM_PID
            if spawned_via_shell and _ADOPTED_LLM_PID
            else _LLM_PROCESS.pid
            if _LLM_PROCESS and _LLM_PROCESS.poll() is None
            else None
        ),
        "endpoint": endpoint,
        "error": "llama-server is still loading; endpoint was not ready before timeout.",
        "command": command,
        "log_path": str(log_path),
        "log_tail": _tail_log(log_path),
        "plan": _plan_summary(plan),
    }


def stop_local_runtime(timeout_seconds: float = 8.0) -> dict[str, Any]:
    global _LLM_PROCESS, _ADOPTED_LLM_PID, _LLM_MODEL, _LLM_BACKEND, _LLM_MODEL_PATH
    proc = _LLM_PROCESS
    adopted_pid = _ADOPTED_LLM_PID
    if (proc is None or proc.poll() is not None) and adopted_pid:
        _ADOPTED_LLM_PID = None
        result = _terminate_pid(adopted_pid, timeout_seconds)
        _LLM_MODEL = ""
        _LLM_BACKEND = ""
        _LLM_MODEL_PATH = ""
        return result

    if proc is None or proc.poll() is not None:
        _LLM_PROCESS = None
        _close_job_handle()
        _LLM_MODEL = ""
        _LLM_BACKEND = ""
        _LLM_MODEL_PATH = ""
        return {"ok": True, "stopped": False}

    try:
        proc.terminate()
    except Exception as exc:
        try:
            proc.kill()
            _LLM_PROCESS = None
            _close_job_handle()
            _LLM_MODEL = ""
            _LLM_BACKEND = ""
            _LLM_MODEL_PATH = ""
            return {
                "ok": True,
                "stopped": True,
                "killed": True,
                "terminate_error": f"{type(exc).__name__}: {exc}",
            }
        except Exception as kill_exc:
            return {
                "ok": False,
                "stopped": False,
                "error": f"{type(kill_exc).__name__}: {kill_exc}",
                "terminate_error": f"{type(exc).__name__}: {exc}",
            }
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        if proc.poll() is not None:
            _LLM_PROCESS = None
            _close_job_handle()
            _LLM_MODEL = ""
            _LLM_BACKEND = ""
            _LLM_MODEL_PATH = ""
            return {"ok": True, "stopped": True, "exit_code": proc.returncode}
        time.sleep(0.2)

    proc.kill()
    _LLM_PROCESS = None
    _close_job_handle()
    _LLM_MODEL = ""
    _LLM_BACKEND = ""
    _LLM_MODEL_PATH = ""
    return {"ok": True, "stopped": True, "killed": True}
