"""Runtime stats collection for the JARVIS desktop and dashboard shells."""

from __future__ import annotations

import json
import os
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Mapping


_UNSET = object()


def _utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _mb(value: Any) -> int | None:
    try:
        return int(round(float(value) / (1024 * 1024)))
    except (TypeError, ValueError):
        return None


def _round(value: Any, digits: int = 2) -> float | None:
    try:
        return round(float(value), digits)
    except (TypeError, ValueError):
        return None


def _load_psutil():
    try:
        import psutil  # type: ignore

        return psutil
    except Exception:
        return None


def _read_lifetime_tokens(jarvis_home: Path) -> int:
    stats_path = jarvis_home / "stats.json"
    try:
        payload = json.loads(stats_path.read_text(encoding="utf-8"))
    except Exception:
        return 0

    candidates = [
        payload.get("tokens_total_lifetime"),
        payload.get("tokens_lifetime_total"),
        payload.get("tokens_total"),
    ]
    token_payload = payload.get("tokens")
    if isinstance(token_payload, Mapping):
        candidates.extend(
            [
                token_payload.get("total_lifetime"),
                token_payload.get("lifetime_total"),
                token_payload.get("total"),
            ]
        )

    for value in candidates:
        try:
            return int(value)
        except (TypeError, ValueError):
            continue
    return 0


def _counter_value(counter: Mapping[str, Any] | None, *keys: str) -> int:
    if not counter:
        return 0
    for key in keys:
        try:
            return int(counter.get(key, 0) or 0)
        except (TypeError, ValueError):
            continue
    return 0


def _cpu_temperature(psutil_module: Any) -> float | None:
    sensors = getattr(psutil_module, "sensors_temperatures", None)
    if not callable(sensors):
        return None
    try:
        readings = sensors() or {}
    except Exception:
        return None

    for entries in readings.values():
        for entry in entries or []:
            current = _round(getattr(entry, "current", None), digits=1)
            if current is not None:
                return current
    return None


def _nvidia_smi_gpu_stats() -> dict[str, Any]:
    command = [
        "nvidia-smi",
        "--query-gpu=utilization.gpu,temperature.gpu,memory.used,memory.total,power.draw",
        "--format=csv,noheader,nounits",
    ]
    try:
        completed = subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
            timeout=1.5,
        )
    except (FileNotFoundError, OSError, subprocess.TimeoutExpired):
        return {}

    if completed.returncode != 0 or not completed.stdout.strip():
        return {}

    first_row = completed.stdout.strip().splitlines()[0]
    parts = [part.strip() for part in first_row.split(",")]
    if len(parts) < 4:
        return {}

    return {
        "gpu_percent": _round(parts[0], digits=1),
        "gpu_temp_c": _round(parts[1], digits=1),
        "gpu_memory_used_mb": int(float(parts[2])),
        "gpu_memory_total_mb": int(float(parts[3])),
        "gpu_power_w": _round(parts[4], digits=1) if len(parts) > 4 else None,
    }


def _active_gateway_connections(gateway_status: Mapping[str, Any] | None) -> int:
    if not gateway_status:
        return 0
    if "connections" in gateway_status:
        try:
            return int(gateway_status.get("connections") or 0)
        except (TypeError, ValueError):
            return 0

    platforms = gateway_status.get("platforms")
    if not isinstance(platforms, Mapping):
        return 0
    active_states = {"connected", "running", "ready", "online"}
    total = 0
    for value in platforms.values():
        if isinstance(value, Mapping):
            state = str(value.get("state") or value.get("status") or "").lower()
            if state in active_states or value.get("connected") is True:
                total += 1
        elif str(value).lower() in active_states:
            total += 1
    return total


def collect_runtime_stats(
    jarvis_home: Path | str,
    *,
    token_counter: Mapping[str, Any] | None = None,
    gateway_status: Mapping[str, Any] | None = None,
    active_skills: int = 0,
    psutil_module: Any = _UNSET,
    process_id: int | None = None,
    started_at: float | None = None,
    now: Callable[[], float] | None = None,
) -> dict[str, Any]:
    """Collect a single stats snapshot for desktop gauges and websocket streams."""
    home = Path(jarvis_home)
    current_time = (now or time.time)()
    process_id = process_id or os.getpid()
    psutil_obj = _load_psutil() if psutil_module is _UNSET else psutil_module
    warnings: list[str] = []

    cpu_percent = None
    ram_used_mb = None
    ram_total_mb = None
    process_cpu_percent = None
    process_ram_mb = None
    cpu_temp_c = None

    if psutil_obj is None:
        warnings.append("psutil is not available")
    else:
        try:
            cpu_percent = _round(psutil_obj.cpu_percent(interval=None), digits=2)
        except Exception:
            warnings.append("CPU usage could not be sampled.")
        try:
            memory = psutil_obj.virtual_memory()
            ram_used_mb = _mb(getattr(memory, "used", None))
            ram_total_mb = _mb(getattr(memory, "total", None))
        except Exception:
            warnings.append("RAM usage could not be sampled.")
        try:
            process = psutil_obj.Process(process_id)
            process_cpu_percent = _round(process.cpu_percent(interval=None), digits=2)
            process_ram_mb = _mb(process.memory_info().rss)
            if started_at is None and hasattr(process, "create_time"):
                started_at = float(process.create_time())
        except Exception:
            warnings.append("Process stats could not be sampled.")
        cpu_temp_c = _cpu_temperature(psutil_obj)

    gpu_stats = _nvidia_smi_gpu_stats()
    uptime_seconds = int(max(0, current_time - started_at)) if started_at else 0

    return {
        "type": "stats",
        "timestamp": _utc_timestamp(),
        "cpu_percent": cpu_percent,
        "process_cpu_percent": process_cpu_percent,
        "ram_used_mb": ram_used_mb,
        "ram_total_mb": ram_total_mb,
        "process_ram_mb": process_ram_mb,
        "gpu_percent": gpu_stats.get("gpu_percent"),
        "gpu_temp_c": gpu_stats.get("gpu_temp_c"),
        "gpu_memory_used_mb": gpu_stats.get("gpu_memory_used_mb"),
        "gpu_memory_total_mb": gpu_stats.get("gpu_memory_total_mb"),
        "gpu_power_w": gpu_stats.get("gpu_power_w"),
        "cpu_temp_c": cpu_temp_c,
        "tokens_input": _counter_value(token_counter, "input", "tokens_input"),
        "tokens_output": _counter_value(token_counter, "output", "tokens_output"),
        "tokens_total_lifetime": _read_lifetime_tokens(home),
        "active_skills": int(active_skills or 0),
        "gateway_connections": _active_gateway_connections(gateway_status),
        "uptime_seconds": uptime_seconds,
        "warnings": warnings,
    }
