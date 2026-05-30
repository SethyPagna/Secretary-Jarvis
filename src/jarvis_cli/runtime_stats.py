"""Runtime stats collection for the JARVIS desktop and dashboard shells."""

from __future__ import annotations

import json
import os
import platform
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Mapping


_UNSET = object()
_HARDWARE_CACHE: dict[str, Any] = {
    "expires_at": 0.0,
    "gpu_stats": {},
    "cpu_temp_c": None,
    "warnings": [],
}
_HARDWARE_CACHE_TTL_SECONDS = 8.0
_TOKEN_RATE_CACHE: dict[str, dict[str, float]] = {}


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


def _read_current_tokens(jarvis_home: Path) -> dict[str, int]:
    payload = _read_json_mapping(jarvis_home / "stats.json")
    current = payload.get("desktop_current_tokens")
    if not isinstance(current, Mapping):
        current = payload.get("current_tokens")
    if not isinstance(current, Mapping):
        return {"input": 0, "output": 0}
    return {
        "input": _counter_value(current, "input", "tokens_input", "input_tokens"),
        "output": _counter_value(current, "output", "tokens_output", "output_tokens"),
    }


def _tokens_per_second(jarvis_home: Path, current_time: float, total_tokens: int) -> float:
    cache_key = str(jarvis_home.resolve())
    previous = _TOKEN_RATE_CACHE.get(cache_key)
    _TOKEN_RATE_CACHE[cache_key] = {
        "timestamp": float(current_time),
        "total": float(total_tokens),
    }
    if not previous:
        return 0.0

    elapsed = max(0.0, current_time - float(previous.get("timestamp") or 0.0))
    if elapsed <= 0:
        return 0.0

    previous_total = int(previous.get("total") or 0)
    delta = max(0, int(total_tokens) - previous_total)
    return round(delta / elapsed, 2)


def _read_json_mapping(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


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
            timeout=0.5,
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


def _windows_gpu_stats() -> dict[str, Any]:
    if platform.system().lower() != "windows":
        return {}

    cim_command = [
        "powershell",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        (
            "$engines = Get-CimInstance -Namespace root/cimv2 "
            "-ClassName Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine "
            "-ErrorAction SilentlyContinue; "
            "$sum = ($engines | Where-Object { $_.Name -match 'engtype_(3D|Compute|Cuda|Copy|Video)' } "
            "| Measure-Object -Property UtilizationPercentage -Sum).Sum; "
            "if ($null -eq $sum) { $sum = 0 }; "
            "$adapters = Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue "
            "| Where-Object { $_.Name -notmatch 'Basic' }; "
            "$ram = ($adapters | Measure-Object -Property AdapterRAM -Sum).Sum; "
            "if ($null -eq $ram) { $ram = 0 }; "
            "$name = ($adapters | Select-Object -First 1 -ExpandProperty Name); "
            "[pscustomobject]@{ "
            "gpu_percent = [Math]::Round([Math]::Min([double]$sum, 100), 1); "
            "gpu_memory_total_mb = [int][Math]::Round([double]$ram / 1MB); "
            "gpu_adapter = $name "
            "} | ConvertTo-Json -Compress"
        ),
    ]
    try:
        completed = subprocess.run(
            cim_command,
            check=False,
            capture_output=True,
            text=True,
            timeout=3.0,
        )
        if completed.returncode == 0 and completed.stdout.strip():
            payload = json.loads(completed.stdout.strip().splitlines()[-1])
            if isinstance(payload, Mapping):
                percent = _round(payload.get("gpu_percent"), digits=1)
                result: dict[str, Any] = {
                    "gpu_percent": percent,
                    "gpu_source": "windows-cim-gpu-engine",
                    "gpu_adapter": payload.get("gpu_adapter") or "",
                }
                try:
                    total_mb = int(payload.get("gpu_memory_total_mb") or 0)
                except (TypeError, ValueError):
                    total_mb = 0
                if total_mb > 0:
                    result["gpu_memory_total_mb"] = total_mb
                if percent is not None:
                    return result
    except (json.JSONDecodeError, FileNotFoundError, OSError, subprocess.TimeoutExpired):
        pass

    command = [
        "powershell",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        (
            "$samples = (Get-Counter '\\GPU Engine(*)\\Utilization Percentage' "
            "-ErrorAction SilentlyContinue).CounterSamples; "
            "$sum = ($samples | Where-Object { $_.InstanceName -match 'engtype_(3d|compute|cuda|copy|video)' } "
            "| Measure-Object -Property CookedValue -Sum).Sum; "
            "if ($null -eq $sum) { '0' } else { [Math]::Round([Math]::Min($sum,100), 1) }"
        ),
    ]
    try:
        completed = subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
            timeout=2.5,
        )
    except (FileNotFoundError, OSError, subprocess.TimeoutExpired):
        return {}
    if completed.returncode != 0:
        return {}
    percent = _round((completed.stdout or "").strip().splitlines()[-1] if completed.stdout.strip() else None, digits=1)
    return {"gpu_percent": percent, "gpu_source": "windows-performance-counter"} if percent is not None else {}


def _windows_cpu_temperature() -> float | None:
    if platform.system().lower() != "windows":
        return None
    command = [
        "powershell",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        (
            "$temps = Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature "
            "-ErrorAction SilentlyContinue | ForEach-Object { ($_.CurrentTemperature / 10) - 273.15 } "
            "| Where-Object { $_ -gt 0 -and $_ -lt 120 }; "
            "if ($temps) { [Math]::Round(($temps | Measure-Object -Average).Average, 1) }"
        ),
    ]
    try:
        completed = subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
            timeout=0.7,
        )
    except (FileNotFoundError, OSError, subprocess.TimeoutExpired):
        return None
    if completed.returncode != 0 or not completed.stdout.strip():
        return None
    return _round(completed.stdout.strip().splitlines()[-1], digits=1)


def _windows_hardware_monitor_temperatures() -> dict[str, Any]:
    if platform.system().lower() != "windows":
        return {}
    command = [
        "powershell",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        (
            "$namespaces = @('root/LibreHardwareMonitor','root/OpenHardwareMonitor'); "
            "$all = @(); "
            "foreach ($ns in $namespaces) { "
            "  $items = Get-CimInstance -Namespace $ns -ClassName Sensor -ErrorAction SilentlyContinue "
            "    | Where-Object { $_.SensorType -eq 'Temperature' -and $_.Value -gt 0 -and $_.Value -lt 120 }; "
            "  if ($items) { $all += $items | Select-Object @{n='Namespace';e={$ns}},Name,Identifier,Value } "
            "} "
            "$cpu = $all | Where-Object { $_.Name -match 'CPU|Package|Core|CCD|Tctl|Tdie' -or $_.Identifier -match '/cpu/' } "
            "  | Sort-Object @{Expression={ if ($_.Name -match 'Package|Tctl|Tdie') { 0 } else { 1 } }},Name "
            "  | Select-Object -First 1; "
            "$gpu = $all | Where-Object { $_.Name -match 'GPU|Hot Spot|Memory Junction' -or $_.Identifier -match '/gpu/' } "
            "  | Sort-Object @{Expression={ if ($_.Name -match '^GPU Core$|GPU Package') { 0 } else { 1 } }},Name "
            "  | Select-Object -First 1; "
            "[pscustomobject]@{ "
            "  cpu_temp_c = if ($cpu) { [Math]::Round([double]$cpu.Value, 1) } else { $null }; "
            "  gpu_temp_c = if ($gpu) { [Math]::Round([double]$gpu.Value, 1) } else { $null }; "
            "  source = if ($cpu -or $gpu) { 'hardware-monitor-wmi' } else { $null } "
            "} | ConvertTo-Json -Compress"
        ),
    ]
    try:
        completed = subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
            timeout=2.0,
        )
    except (FileNotFoundError, OSError, subprocess.TimeoutExpired):
        return {}
    if completed.returncode != 0 or not completed.stdout.strip():
        return {}
    try:
        payload = json.loads(completed.stdout.strip().splitlines()[-1])
    except json.JSONDecodeError:
        return {}
    if not isinstance(payload, Mapping):
        return {}
    result: dict[str, Any] = {}
    cpu_temp = _round(payload.get("cpu_temp_c"), digits=1)
    gpu_temp = _round(payload.get("gpu_temp_c"), digits=1)
    if cpu_temp is not None:
        result["cpu_temp_c"] = cpu_temp
    if gpu_temp is not None:
        result["gpu_temp_c"] = gpu_temp
    if result:
        result["source"] = payload.get("source") or "hardware-monitor-wmi"
    return result


def _read_soul_status() -> dict[str, Any]:
    manifest_path = Path(__file__).with_name("data") / "souls" / "soul_manifest.json"
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except Exception:
        return {"active": "jarvis", "online": 1, "total": 1, "delegates": []}
    souls = manifest.get("souls")
    if not isinstance(souls, list):
        souls = []
    active = str(manifest.get("primary") or "jarvis")
    delegates = [
        str(item.get("id"))
        for item in souls
        if isinstance(item, Mapping) and item.get("id") and item.get("id") != active
    ]
    ready_count = sum(
        1
        for item in souls
        if isinstance(item, Mapping) and item.get("id") and item.get("ready", True) is not False
    )
    total = max(1, len(souls))
    return {
        "active": active,
        "online": max(1, min(total, ready_count or total)),
        "total": total,
        "delegates": delegates[:12],
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
    cpu_temp_source = "unavailable"

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
        if cpu_temp_c is not None:
            cpu_temp_source = "psutil"

    cached_hardware = current_time < float(_HARDWARE_CACHE.get("expires_at") or 0)
    if cached_hardware:
        gpu_stats = dict(_HARDWARE_CACHE.get("gpu_stats") or {})
        cpu_temp_c = _HARDWARE_CACHE.get("cpu_temp_c")
        cpu_temp_source = str(_HARDWARE_CACHE.get("cpu_temp_source") or "unavailable")
        warnings.extend(str(item) for item in (_HARDWARE_CACHE.get("warnings") or []))
    else:
        hardware_warnings: list[str] = []
        gpu_stats = _nvidia_smi_gpu_stats()
        if gpu_stats:
            gpu_stats.setdefault("gpu_source", "nvidia-smi")
        else:
            gpu_stats = _windows_gpu_stats()
            if not gpu_stats:
                hardware_warnings.append("GPU usage/temperature provider is not available.")
        hardware_monitor_temps = _windows_hardware_monitor_temperatures()
        if hardware_monitor_temps:
            if gpu_stats.get("gpu_temp_c") is None and hardware_monitor_temps.get("gpu_temp_c") is not None:
                gpu_stats["gpu_temp_c"] = hardware_monitor_temps["gpu_temp_c"]
                gpu_stats["gpu_temp_source"] = hardware_monitor_temps.get("source")
            if cpu_temp_c is None and hardware_monitor_temps.get("cpu_temp_c") is not None:
                cpu_temp_c = hardware_monitor_temps["cpu_temp_c"]
                cpu_temp_source = str(hardware_monitor_temps.get("source") or "hardware-monitor-wmi")
        if cpu_temp_c is None:
            cpu_temp_c = _windows_cpu_temperature()
            if cpu_temp_c is not None:
                cpu_temp_source = "windows-wmi"
            if cpu_temp_c is None:
                hardware_warnings.append("CPU temperature provider is not available.")
        warnings.extend(hardware_warnings)
        _HARDWARE_CACHE["gpu_stats"] = dict(gpu_stats)
        _HARDWARE_CACHE["cpu_temp_c"] = cpu_temp_c
        _HARDWARE_CACHE["cpu_temp_source"] = cpu_temp_source
        _HARDWARE_CACHE["warnings"] = list(hardware_warnings)
        _HARDWARE_CACHE["expires_at"] = current_time + _HARDWARE_CACHE_TTL_SECONDS
    uptime_seconds = int(max(0, current_time - started_at)) if started_at else 0
    soul_status = _read_soul_status()
    current_tokens = _read_current_tokens(home) if token_counter is None else {}
    tokens_input = (
        _counter_value(token_counter, "input", "tokens_input")
        if token_counter is not None
        else current_tokens["input"]
    )
    tokens_output = (
        _counter_value(token_counter, "output", "tokens_output")
        if token_counter is not None
        else current_tokens["output"]
    )
    tokens_per_second = _tokens_per_second(home, current_time, tokens_input + tokens_output)

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
        "hardware_status": {
            "gpu_source": gpu_stats.get("gpu_source") or "unavailable",
            "gpu_temp_source": gpu_stats.get("gpu_temp_source")
            or ("nvidia-smi" if gpu_stats.get("gpu_temp_c") is not None else "unavailable"),
            "cpu_temp_source": cpu_temp_source if cpu_temp_c is not None else "unavailable",
        },
        "tokens_input": tokens_input,
        "tokens_output": tokens_output,
        "tokens_per_second": tokens_per_second,
        "tokens_total_lifetime": _read_lifetime_tokens(home),
        "active_skills": int(active_skills or 0),
        "gateway_connections": _active_gateway_connections(gateway_status),
        "souls_online": int(soul_status["online"]),
        "souls_total": int(soul_status["total"]),
        "active_soul": soul_status["active"],
        "delegate_souls": soul_status["delegates"],
        "uptime_seconds": uptime_seconds,
        "warnings": warnings,
    }
