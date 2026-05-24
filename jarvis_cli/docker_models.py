"""Docker-backed local model runtime management for the desktop app.

This module keeps Docker optional but first-class: the Electron backend can
start local LLM and voice services, apply their loopback endpoints to
``config.yaml``, and report status to the Setup page.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

from jarvis_cli.config import get_config_path, get_jarvis_home, load_config, save_config
from jarvis_cli.runtime_config_apply import changed_top_level_keys, merge_runtime_config


COMPOSE_FILE = "docker-compose.local-models.yml"
LLAMA_CPP_PORT = 8080
VLLM_PORT = 8000
OLLAMA_PORT = 11434
VOICE_PORT = 9010
VALID_PROFILES = {"auto", "llamacpp", "vllm", "ollama"}


def project_root() -> Path:
    resource_root = os.getenv("JARVIS_RESOURCE_ROOT", "").strip()
    if resource_root:
        return Path(resource_root).expanduser().resolve()
    return Path(__file__).resolve().parents[1]


def compose_file_path() -> Path:
    return project_root() / COMPOSE_FILE


def _docker_path(path: Path) -> str:
    resolved = str(path.expanduser().resolve())
    return resolved.replace("\\", "/") if os.name == "nt" else resolved


def _run(
    args: Sequence[str],
    *,
    env: Mapping[str, str] | None = None,
    timeout: float = 45.0,
) -> dict[str, Any]:
    started = time.perf_counter()
    try:
        completed = subprocess.run(
            list(args),
            cwd=str(project_root()),
            env={**os.environ, **dict(env or {})},
            check=False,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return {
            "ok": completed.returncode == 0,
            "returncode": completed.returncode,
            "stdout": completed.stdout.strip(),
            "stderr": completed.stderr.strip(),
            "elapsed_ms": int((time.perf_counter() - started) * 1000),
            "command": list(args),
        }
    except FileNotFoundError as exc:
        return {
            "ok": False,
            "returncode": 127,
            "stdout": "",
            "stderr": str(exc),
            "elapsed_ms": int((time.perf_counter() - started) * 1000),
            "command": list(args),
        }
    except subprocess.TimeoutExpired as exc:
        return {
            "ok": False,
            "returncode": 124,
            "stdout": (exc.stdout or "").strip() if isinstance(exc.stdout, str) else "",
            "stderr": f"Timed out after {timeout:.1f}s",
            "elapsed_ms": int((time.perf_counter() - started) * 1000),
            "command": list(args),
        }


def _loopback_port_available(port: int) -> bool:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.bind(("127.0.0.1", port))
        return True
    except OSError:
        return False


def _selected_port(env_name: str, preferred: int, fallbacks: Iterable[int]) -> int:
    raw = os.getenv(env_name, "").strip()
    if raw:
        try:
            return int(raw)
        except ValueError:
            pass
    for port in (preferred, *tuple(fallbacks)):
        if _loopback_port_available(port):
            return port
    return preferred


def docker_available() -> bool:
    return shutil.which("docker") is not None


def compose_available() -> bool:
    if not docker_available():
        return False
    result = _run(["docker", "compose", "version"], timeout=10)
    return bool(result.get("ok"))


def default_model_roots() -> list[Path]:
    roots: list[Path] = []
    env_root = os.getenv("JARVIS_MODELS_DIR", "").strip()
    if env_root:
        roots.append(Path(env_root))
    root = project_root()
    roots.extend(
        [
            get_jarvis_home() / "models",
            root / "models",
            root.parent / "models",
        ]
    )
    for parent in root.parents[:5]:
        roots.append(parent / "models")
    roots.extend([Path.cwd() / "models", Path.cwd().parent / "models"])
    return _unique_existing_or_candidate_roots(roots)


def default_voice_roots() -> list[Path]:
    roots: list[Path] = []
    env_root = os.getenv("JARVIS_VOICE_ASSETS_DIR", "").strip()
    if env_root:
        roots.append(Path(env_root))
    root = project_root()
    cwd = Path.cwd()
    base_roots = [root, root.parent, cwd, cwd.parent, *list(root.parents[:5])]
    for base in base_roots:
        roots.extend(
            [
                base / "assets" / "voices",
                base / "assets" / "voice",
                base / "assets",
                base / "vendor" / "voices",
                base / "vendor" / "voice",
                base / "vendor",
            ]
        )
    return _unique_existing_or_candidate_roots(roots)


def _unique_existing_or_candidate_roots(roots: Iterable[Path]) -> list[Path]:
    seen: set[str] = set()
    unique: list[Path] = []
    for root in roots:
        try:
            resolved = str(root.expanduser().resolve())
        except OSError:
            resolved = str(root.expanduser())
        if resolved in seen:
            continue
        seen.add(resolved)
        unique.append(Path(resolved))
    return unique


def _scan_files(roots: Iterable[Path], suffixes: set[str]) -> list[Path]:
    found: list[Path] = []
    for root in roots:
        try:
            if not root.exists():
                continue
            for path in root.rglob("*"):
                if path.is_file() and path.suffix.lower() in suffixes:
                    found.append(path)
        except OSError:
            continue
    return found


def _voice_root_score(root: Path) -> tuple[int, str]:
    if not root.exists():
        return (0, str(root))
    score = 1
    try:
        for path in root.rglob("*"):
            if not path.is_file():
                continue
            suffix = path.suffix.lower()
            lower = str(path).lower()
            if suffix in {".wav", ".mp3", ".flac", ".ogg", ".m4a"}:
                score += 10
                if "jarvis" in lower:
                    score += 20
            if suffix == ".pt" and "voice" in lower:
                score += 12
                if "jarvis" in lower:
                    score += 20
    except OSError:
        pass
    return (score, str(root))


def best_voice_root(roots: Sequence[Path]) -> Path:
    existing = [root for root in roots if root.exists()]
    if not existing:
        return project_root() / "assets"
    return sorted(existing, key=_voice_root_score, reverse=True)[0]


def _gguf_score(path: Path) -> tuple[int, int, str]:
    name = path.name.lower()
    quant_score = 0
    for score, token in (
        (120, "q4_k_m"),
        (110, "q5_k_m"),
        (105, "iq4"),
        (100, "q4"),
        (90, "q5"),
        (80, "q6"),
        (70, "q8"),
        (10, "f16"),
    ):
        if token in name:
            quant_score = score
            break

    family_score = 0
    for score, token in (
        (60, "qwen"),
        (50, "gemma"),
        (45, "llama"),
        (40, "deepseek"),
        (35, "mistral"),
        (30, "phi"),
    ):
        if token in str(path).lower():
            family_score = score
            break
    return (family_score + quant_score, -len(name), name)


def best_gguf(roots: Iterable[Path]) -> Path | None:
    files = _scan_files(roots, {".gguf"})
    return sorted(files, key=_gguf_score, reverse=True)[0] if files else None


def _vllm_score(path: Path) -> tuple[int, int, str]:
    text = str(path).lower()
    family_score = 0
    for score, token in (
        (60, "qwen"),
        (50, "gemma"),
        (45, "llama"),
        (40, "deepseek"),
        (35, "mistral"),
        (30, "phi"),
    ):
        if token in text:
            family_score = score
            break
    return (family_score, -len(path.name), path.name.lower())


def best_vllm_model_dir(roots: Iterable[Path]) -> Path | None:
    candidates: list[Path] = []
    for root in roots:
        try:
            if not root.exists():
                continue
            for config_path in root.rglob("config.json"):
                model_dir = config_path.parent
                if any(model_dir.glob("*.safetensors")):
                    candidates.append(model_dir)
        except OSError:
            continue
    return sorted(candidates, key=_vllm_score, reverse=True)[0] if candidates else None


def _whisper_score(path: Path) -> tuple[int, int, str]:
    text = str(path).lower()
    score = 0
    for value, token in (
        (100, "large-v3-turbo"),
        (90, "large-v3"),
        (70, "medium"),
        (50, "small"),
        (30, "base"),
        (10, "tiny"),
    ):
        if token in text:
            score = value
            break
    return (score, -len(path.name), path.name.lower())


def best_whisper_model_dir(roots: Iterable[Path]) -> Path | None:
    candidates: list[Path] = []
    for root in roots:
        try:
            if not root.exists():
                continue
            for config_path in root.rglob("config.json"):
                model_dir = config_path.parent
                if "whisper" in str(model_dir).lower() and any(model_dir.glob("*.safetensors")):
                    candidates.append(model_dir)
        except OSError:
            continue
    return sorted(candidates, key=_whisper_score, reverse=True)[0] if candidates else None


def is_ctranslate2_whisper_dir(path: Path | str | None) -> bool:
    """Return True when a Whisper directory can be loaded by faster-whisper."""
    if not path:
        return False
    model_dir = Path(path)
    try:
        return model_dir.is_dir() and (model_dir / "model.bin").is_file()
    except OSError:
        return False


def _faster_whisper_model_name_from_path(path: Path | str | None) -> str:
    text = str(path or "").lower()
    if "large-v3-turbo" in text or "turbo" in text:
        return "large-v3-turbo"
    if "large-v3" in text:
        return "large-v3"
    if "medium" in text:
        return "medium"
    if "small" in text:
        return "small"
    if "base" in text:
        return "base"
    if "tiny" in text:
        return "tiny"
    return "large-v3-turbo"


def faster_whisper_model_for_dir(
    whisper_dir: Path | str | None,
    models_root: Path | str,
    *,
    container_path: bool,
) -> str:
    """Return a faster-whisper-safe model reference.

    The downloaded OpenAI Whisper folders in ``models/`` are often Transformers
    safetensors checkpoints. faster-whisper needs a CTranslate2 directory with
    ``model.bin``. When a discovered folder is not CTranslate2, use the matching
    faster-whisper model name so the runtime can use/download its own converted
    cache instead of failing on an incompatible local path.
    """
    if whisper_dir and is_ctranslate2_whisper_dir(whisper_dir):
        path = Path(whisper_dir)
        if container_path:
            return f"/models/{_relative_posix(path, Path(models_root))}"
        return str(path)
    return _faster_whisper_model_name_from_path(whisper_dir)


def choose_models_root(
    gguf: Path | None,
    vllm_dir: Path | None,
    roots: Sequence[Path] | None = None,
) -> Path:
    candidates = list(roots or default_model_roots())
    if gguf:
        for root in candidates:
            try:
                gguf.relative_to(root)
                return root
            except ValueError:
                continue
        return gguf.parent
    if vllm_dir:
        for root in candidates:
            try:
                vllm_dir.relative_to(root)
                return root
            except ValueError:
                continue
        return vllm_dir.parent
    for root in candidates:
        if root.exists():
            return root
    return project_root() / "models"


def _relative_posix(path: Path, root: Path) -> str:
    try:
        relative = path.relative_to(root)
    except ValueError:
        relative = Path(path.name)
    return relative.as_posix()


def _profile_for_request(
    requested: str,
    *,
    gguf: Path | None,
    vllm_dir: Path | None,
) -> str:
    normalized = (requested or "auto").strip().lower()
    if normalized not in VALID_PROFILES:
        normalized = "auto"
    if normalized != "auto":
        return normalized
    if gguf:
        return "llamacpp"
    if vllm_dir:
        return "vllm"
    return "ollama"


def build_compose_environment(
    *,
    profile: str = "auto",
    model_roots: Sequence[Path] | None = None,
    voice_roots: Sequence[Path] | None = None,
) -> dict[str, Any]:
    roots = list(model_roots or default_model_roots())
    gguf = best_gguf(roots)
    vllm_dir = best_vllm_model_dir(roots)
    whisper_dir = best_whisper_model_dir(roots)
    selected = _profile_for_request(profile, gguf=gguf, vllm_dir=vllm_dir)
    models_root = choose_models_root(gguf, vllm_dir, roots)
    voice_candidates = list(voice_roots or default_voice_roots())
    voice_root = best_voice_root(voice_candidates)
    llama_port = _selected_port("JARVIS_LLAMA_CPP_PORT", LLAMA_CPP_PORT, range(8081, 8090))
    vllm_port = _selected_port("JARVIS_VLLM_PORT", VLLM_PORT, range(8001, 8010))
    ollama_port = _selected_port("JARVIS_OLLAMA_PORT", OLLAMA_PORT, range(11435, 11445))
    voice_port = _selected_port("JARVIS_VOICE_PORT", VOICE_PORT, range(9011, 9020))
    llama_threads = str(
        os.getenv("JARVIS_LLAMA_CPP_THREADS")
        or max(4, min(8, os.cpu_count() or 8))
    )

    stt_model = os.getenv("JARVIS_STT_MODEL", "").strip()
    if not stt_model and whisper_dir:
        stt_model = faster_whisper_model_for_dir(
            whisper_dir,
            models_root,
            container_path=True,
        )
    if not stt_model:
        stt_model = "large-v3-turbo"

    env = {
        "JARVIS_MODELS_DIR": _docker_path(models_root),
        "JARVIS_HF_CACHE_DIR": _docker_path(get_jarvis_home() / "cache" / "huggingface"),
        "JARVIS_VOICE_ASSETS_DIR": _docker_path(voice_root),
        "JARVIS_LLAMA_CPP_PORT": str(llama_port),
        "JARVIS_VLLM_PORT": str(vllm_port),
        "JARVIS_OLLAMA_PORT": str(ollama_port),
        "JARVIS_VOICE_PORT": str(voice_port),
        "JARVIS_LLAMA_CPP_THREADS": llama_threads,
        "JARVIS_LLAMA_CPP_THREADS_BATCH": os.getenv("JARVIS_LLAMA_CPP_THREADS_BATCH", llama_threads),
        "JARVIS_LLAMA_CPP_BATCH_SIZE": os.getenv("JARVIS_LLAMA_CPP_BATCH_SIZE", "1024"),
        "JARVIS_STT_MODEL": stt_model,
        "JARVIS_STT_DEVICE": os.getenv("JARVIS_STT_DEVICE", "auto"),
        "JARVIS_STT_COMPUTE_TYPE": os.getenv("JARVIS_STT_COMPUTE_TYPE", "int8"),
        "JARVIS_STT_LANGUAGE": os.getenv("JARVIS_STT_LANGUAGE", "en"),
        "JARVIS_TTS_ENGINE": os.getenv("JARVIS_TTS_ENGINE", "kokoro"),
        "JARVIS_TTS_VOICE": os.getenv("JARVIS_TTS_VOICE", "am_adam"),
        "JARVIS_SYSTEM_TTS_VOICE": os.getenv("JARVIS_SYSTEM_TTS_VOICE", "en"),
    }
    if gguf:
        env["JARVIS_LLAMA_CPP_MODEL"] = _relative_posix(gguf, models_root)
    if vllm_dir:
        env["JARVIS_VLLM_MODEL"] = f"/models/{_relative_posix(vllm_dir, models_root)}"
    if os.getenv("JARVIS_OLLAMA_MODEL"):
        env["JARVIS_OLLAMA_MODEL"] = os.getenv("JARVIS_OLLAMA_MODEL", "")

    return {
        "env": env,
        "profile": selected,
        "requested_profile": profile,
        "models_root": str(models_root),
        "voice_assets_root": str(voice_root),
        "ports": {
            "llamacpp": llama_port,
            "vllm": vllm_port,
            "ollama": ollama_port,
            "voice": voice_port,
        },
        "llama_cpp_model_path": str(gguf) if gguf else "",
        "llama_cpp_model": env.get("JARVIS_LLAMA_CPP_MODEL", ""),
        "vllm_model_dir": str(vllm_dir) if vllm_dir else "",
        "vllm_model": env.get("JARVIS_VLLM_MODEL", ""),
        "whisper_model_dir": str(whisper_dir) if whisper_dir else "",
        "stt_model": stt_model,
        "model_roots": [str(root) for root in roots],
    }


def _http_probe(url: str, *, timeout: float = 1.5) -> dict[str, Any]:
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            body = response.read(4096)
        return {
            "ok": 200 <= response.status < 300,
            "status": response.status,
            "latency_ms": int((time.perf_counter() - started) * 1000),
            "sample": body.decode("utf-8", errors="replace")[:500],
        }
    except Exception as exc:
        return {
            "ok": False,
            "status": 0,
            "latency_ms": int((time.perf_counter() - started) * 1000),
            "error": f"{type(exc).__name__}: {exc}",
        }


def _service_status() -> dict[str, Any]:
    if not compose_available():
        return {"ok": False, "services": [], "error": "Docker Compose is not available."}

    result = _run(
        ["docker", "compose", "-f", str(compose_file_path()), "ps", "--all", "--format", "json"],
        timeout=15,
    )
    services: list[dict[str, Any]] = []
    if result.get("ok"):
        stdout = str(result.get("stdout") or "").strip()
        if stdout:
            try:
                parsed = json.loads(stdout)
                if isinstance(parsed, list):
                    services.extend(dict(item) for item in parsed if isinstance(item, Mapping))
                elif isinstance(parsed, Mapping):
                    services.append(dict(parsed))
            except json.JSONDecodeError:
                for line in stdout.splitlines():
                    try:
                        parsed_line = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if isinstance(parsed_line, Mapping):
                        services.append(dict(parsed_line))
    return {
        "ok": bool(result.get("ok")),
        "services": services,
        "command": result.get("command"),
        "stderr": result.get("stderr"),
    }


def _published_port(
    service_status: Mapping[str, Any],
    service_name: str,
    target_port: int,
) -> int | None:
    services = service_status.get("services")
    if not isinstance(services, list):
        return None
    for service in services:
        if not isinstance(service, Mapping):
            continue
        if service.get("Service") != service_name and service.get("Name") != service_name and service.get("Names") != service_name:
            continue
        publishers = service.get("Publishers")
        if isinstance(publishers, list):
            for publisher in publishers:
                if not isinstance(publisher, Mapping):
                    continue
                try:
                    if int(publisher.get("TargetPort") or 0) == target_port:
                        return int(publisher.get("PublishedPort") or 0)
                except (TypeError, ValueError):
                    continue
        ports = str(service.get("Ports") or "")
        marker = f"->{target_port}/tcp"
        if marker in ports:
            try:
                return int(ports.split("->", 1)[0].rsplit(":", 1)[-1])
            except (IndexError, ValueError):
                return None
    return None


def runtime_endpoints(plan: Mapping[str, Any] | None = None) -> dict[str, str]:
    ports = plan.get("ports") if isinstance(plan, Mapping) else None
    env = plan.get("env") if isinstance(plan, Mapping) else None
    def _port(name: str, env_name: str, fallback: int) -> int:
        if isinstance(ports, Mapping) and ports.get(name):
            return int(ports[name])
        if isinstance(env, Mapping) and env.get(env_name):
            return int(env[env_name])
        return fallback

    llama_port = _port("llamacpp", "JARVIS_LLAMA_CPP_PORT", LLAMA_CPP_PORT)
    vllm_port = _port("vllm", "JARVIS_VLLM_PORT", VLLM_PORT)
    ollama_port = _port("ollama", "JARVIS_OLLAMA_PORT", OLLAMA_PORT)
    voice_port = _port("voice", "JARVIS_VOICE_PORT", VOICE_PORT)
    return {
        "llamacpp": f"http://127.0.0.1:{llama_port}/v1",
        "vllm": f"http://127.0.0.1:{vllm_port}/v1",
        "ollama": f"http://127.0.0.1:{ollama_port}",
        "voice": f"http://127.0.0.1:{voice_port}",
    }


def resolved_runtime_endpoints(
    plan: Mapping[str, Any] | None = None,
    *,
    service_status: Mapping[str, Any] | None = None,
) -> dict[str, str]:
    endpoints = runtime_endpoints(plan)
    status = service_status or _service_status()
    overrides = {
        "llamacpp": ("jarvis-llamacpp", 8080, "/v1"),
        "vllm": ("jarvis-vllm", 8000, "/v1"),
        "ollama": ("jarvis-ollama", 11434, ""),
        "voice": ("jarvis-voice", 9010, ""),
    }
    for key, (service_name, target_port, suffix) in overrides.items():
        published = _published_port(status, service_name, target_port)
        if published:
            endpoints[key] = f"http://127.0.0.1:{published}{suffix}"
    return endpoints


def docker_runtime_status(profile: str = "auto") -> dict[str, Any]:
    plan = build_compose_environment(profile=profile)
    services = _service_status()
    endpoints = resolved_runtime_endpoints(plan, service_status=services)
    probes = {
        "llamacpp": _http_probe(f"{endpoints['llamacpp']}/models"),
        "vllm": _http_probe(f"{endpoints['vllm']}/models"),
        "ollama": _http_probe(f"{endpoints['ollama']}/api/tags"),
        "voice": _http_probe(f"{endpoints['voice']}/health"),
    }
    return {
        "docker_available": docker_available(),
        "compose_available": compose_available(),
        "compose_file": str(compose_file_path()),
        "profile": plan["profile"],
        "requested_profile": plan["requested_profile"],
        "services": services,
        "endpoints": endpoints,
        "probes": probes,
        "plan": {
            key: value
            for key, value in plan.items()
            if key != "env"
        },
        "resource_policy": (
            "No hard CPU, memory, or GPU limits are set in the local compose file; "
            "JARVIS starts and stops services so Docker Desktop/WSL can reclaim idle resources."
        ),
    }


def _compose_up_services(profile: str, include_voice: bool) -> list[str]:
    services = {
        "llamacpp": "jarvis-llamacpp",
        "vllm": "jarvis-vllm",
        "ollama": "jarvis-ollama",
    }
    result = [services.get(profile, "jarvis-ollama")]
    if include_voice:
        result.append("jarvis-voice")
    return result


def start_docker_runtime(profile: str = "auto", *, include_voice: bool = True) -> dict[str, Any]:
    plan = build_compose_environment(profile=profile)
    if not compose_available():
        return {
            "ok": False,
            "error": "Docker Compose is not available. Install/start Docker Desktop, then retry from Setup.",
            "status": docker_runtime_status(profile),
        }
    selected_profile = str(plan["profile"])
    services = _compose_up_services(selected_profile, include_voice)
    command = [
        "docker",
        "compose",
        "-f",
        str(compose_file_path()),
        "--profile",
        selected_profile,
    ]
    if include_voice:
        command.extend(["--profile", "voice"])
    command.extend(["up", "-d", *services])
    result = _run(command, env=plan["env"], timeout=180)
    return {
        "ok": bool(result.get("ok")),
        "profile": selected_profile,
        "services": services,
        "result": result,
        "status": docker_runtime_status(selected_profile),
    }


def stop_docker_runtime() -> dict[str, Any]:
    if not compose_available():
        return {
            "ok": False,
            "error": "Docker Compose is not available.",
            "status": docker_runtime_status("auto"),
        }
    services = ["jarvis-llamacpp", "jarvis-vllm", "jarvis-ollama", "jarvis-voice"]
    result = _run(
        [
            "docker",
            "compose",
            "-f",
            str(compose_file_path()),
            "--profile",
            "models",
            "stop",
            *services,
        ],
        timeout=90,
    )
    return {
        "ok": bool(result.get("ok")),
        "preserved_containers": True,
        "result": result,
        "status": docker_runtime_status("auto"),
    }


def _config_patch_for_profile(profile: str, plan: Mapping[str, Any]) -> dict[str, Any]:
    endpoints = resolved_runtime_endpoints(plan)
    runtime_patch: dict[str, Any] = {
        "runtime": {
            "docker": {
                "enabled": True,
                "compose_file": str(compose_file_path()),
                "profile": profile,
                "voice_url": endpoints["voice"],
                "resource_policy": "unrestricted_burst_reclaim_on_stop",
            }
        },
        "stt": {
            "enabled": True,
            "provider": "docker",
            "docker": {
                "url": endpoints["voice"],
                "engine": "faster-whisper",
                "model": str(plan.get("stt_model") or os.getenv("JARVIS_STT_MODEL", "large-v3-turbo")),
            },
        },
            "tts": {
                "provider": "docker",
                "docker": {
                    "url": endpoints["voice"],
                    "engine": "kokoro",
                    "fallback": "system-tts",
                    "kokoro_ready": True,
                },
            },
    }
    if profile == "llamacpp":
        model_path = str(plan.get("llama_cpp_model_path") or "")
        model = Path(model_path).stem if model_path else "llama-cpp-docker"
        runtime_patch.update(
            {
                "model": model,
                "providers": {
                    "jarvis_llamacpp_docker": {
                        "base_url": endpoints["llamacpp"],
                        "model": model,
                        "api_key": "",
                    }
                },
            }
        )
    elif profile == "vllm":
        model = str(plan.get("vllm_model") or plan.get("vllm_model_dir") or "vllm-docker")
        runtime_patch.update(
            {
                "model": model,
                "providers": {
                    "jarvis_vllm_docker": {
                        "base_url": endpoints["vllm"],
                        "model": model,
                        "api_key": "",
                    }
                },
            }
        )
    else:
        model = os.getenv("JARVIS_OLLAMA_MODEL", "qwen2.5")
        runtime_patch.update(
            {
                "model": model,
                "providers": {
                    "jarvis_ollama_docker": {
                        "base_url": f"{endpoints['ollama']}/v1",
                        "model": model,
                        "api_key": "",
                    }
                },
            }
        )
    return runtime_patch


def apply_docker_runtime(profile: str = "auto", *, include_voice: bool = True) -> dict[str, Any]:
    plan = build_compose_environment(profile=profile)
    selected_profile = str(plan["profile"])
    patch = _config_patch_for_profile(selected_profile, plan)
    if not include_voice:
        configured_stt_model = os.getenv("JARVIS_STT_MODEL", "").strip()
        whisper_dir = str(plan.get("whisper_model_dir") or "")
        host_stt_model = configured_stt_model or faster_whisper_model_for_dir(
            whisper_dir or None,
            str(plan.get("models_root") or ""),
            container_path=False,
        )
        patch["stt"] = {
            "enabled": True,
            "provider": "local",
            "local": {
                "engine": "faster-whisper",
                "model": host_stt_model,
            },
        }
        patch["tts"] = {
            "provider": "system",
            "system": {
                "engine": "windows-sapi" if os.name == "nt" else "system-tts",
                "fallback_from": "kokoro",
            },
        }
        patch["runtime"]["docker"]["voice_url"] = ""

    current = load_config()
    merged = merge_runtime_config(current, patch)
    changed = changed_top_level_keys(current, merged)
    save_config(merged)
    return {
        "ok": True,
        "profile": selected_profile,
        "changed_keys": changed,
        "config_path": str(get_config_path()),
        "config_patch": patch,
        "status": docker_runtime_status(selected_profile),
    }


def restart_docker_runtime(profile: str = "auto", *, include_voice: bool = True) -> dict[str, Any]:
    stopped = stop_docker_runtime()
    started = start_docker_runtime(profile, include_voice=include_voice)
    return {"ok": bool(started.get("ok")), "stop": stopped, "start": started}


def _print(payload: Mapping[str, Any], *, as_json: bool) -> None:
    if as_json:
        print(json.dumps(payload, indent=2, sort_keys=True))
        return
    ok = payload.get("ok")
    if ok is not None:
        print(f"ok: {ok}")
    status = payload.get("status", payload)
    if isinstance(status, Mapping):
        print(f"docker: {status.get('docker_available')} compose: {status.get('compose_available')}")
        print(f"profile: {status.get('profile')}")
        endpoints = status.get("endpoints")
        if isinstance(endpoints, Mapping):
            for name, endpoint in endpoints.items():
                print(f"{name}: {endpoint}")
        probes = status.get("probes")
        if isinstance(probes, Mapping):
            for name, probe in probes.items():
                if isinstance(probe, Mapping):
                    print(f"{name} ready: {probe.get('ok')}")
    result = payload.get("result")
    if isinstance(result, Mapping):
        if result.get("stdout"):
            print(result["stdout"])
        if result.get("stderr"):
            print(result["stderr"], file=sys.stderr)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Manage JARVIS Docker local model services.")
    parser.add_argument(
        "action",
        choices=("status", "start", "stop", "restart", "apply"),
        nargs="?",
        default="status",
    )
    parser.add_argument(
        "--profile",
        choices=tuple(sorted(VALID_PROFILES)),
        default="auto",
        help="Runtime profile. auto prefers llama.cpp, then vLLM, then Ollama.",
    )
    parser.add_argument("--no-voice", action="store_true", help="Do not start/apply the Docker voice runtime.")
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON.")
    args = parser.parse_args(argv)

    include_voice = not args.no_voice
    if args.action == "status":
        payload = docker_runtime_status(args.profile)
    elif args.action == "start":
        payload = start_docker_runtime(args.profile, include_voice=include_voice)
    elif args.action == "stop":
        payload = stop_docker_runtime()
    elif args.action == "restart":
        payload = restart_docker_runtime(args.profile, include_voice=include_voice)
    else:
        payload = apply_docker_runtime(args.profile, include_voice=include_voice)

    _print(payload, as_json=args.json)
    return 0 if payload.get("ok", True) else 1


if __name__ == "__main__":
    raise SystemExit(main())
