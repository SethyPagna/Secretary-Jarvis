"""Autoconfiguration planner for fast local JARVIS runtimes."""

from __future__ import annotations

import importlib.util
import json
import os
import shutil
import socket
import subprocess
import urllib.request
from pathlib import Path
from typing import Any, Callable, Iterable, Mapping


PackageChecker = Callable[[str], bool]
ExecutableChecker = Callable[[str], bool]
OllamaModels = Callable[[], list[str]]
PortChecker = Callable[[int], bool]
EndpointChecker = Callable[[int], bool]


def _package_available(name: str) -> bool:
    return importlib.util.find_spec(name) is not None


def _executable_available(name: str) -> bool:
    return shutil.which(name) is not None


def _loopback_port_available(port: int) -> bool:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.bind(("127.0.0.1", port))
        return True
    except OSError:
        return False


def _openai_endpoint_ready(port: int) -> bool:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/v1/models", timeout=1.0) as response:
            return 200 <= response.status < 300
    except Exception:
        return False


def _roots_from_config(config: Mapping[str, Any]) -> list[Path]:
    roots: list[Path] = []
    providers = config.get("providers")
    if isinstance(providers, Mapping):
        for provider in providers.values():
            if not isinstance(provider, Mapping):
                continue
            for key in ("model_path", "model_dir"):
                raw = str(provider.get(key) or "").strip()
                if not raw:
                    continue
                path = Path(raw).expanduser()
                roots.append(path.parent if path.is_file() else path)
    for section in (
        ((config.get("tts") or {}).get("kokoro") if isinstance(config.get("tts"), Mapping) else {}) or {},
        ((config.get("stt") or {}).get("local") if isinstance(config.get("stt"), Mapping) else {}) or {},
    ):
        if not isinstance(section, Mapping):
            continue
        raw = str(section.get("model_dir") or "").strip()
        if raw:
            path = Path(raw).expanduser()
            roots.append(path.parent if path.is_file() else path)
    return roots


def _default_model_roots(config: Mapping[str, Any] | None = None) -> list[Path]:
    roots = []
    env_root = os.getenv("JARVIS_MODELS_DIR", "").strip()
    if env_root:
        roots.append(Path(env_root))
    if config:
        roots.extend(_roots_from_config(config))
    roots.extend([
        Path.home() / ".jarvis" / "models",
        Path.cwd() / "models",
        Path.cwd().parent / "models",
    ])
    unique: list[Path] = []
    seen: set[str] = set()
    for root in roots:
        key = str(root.resolve()) if root.exists() else str(root)
        if key not in seen:
            seen.add(key)
            unique.append(root)
    return unique


def _default_voice_roots() -> list[Path]:
    roots = []
    env_root = os.getenv("JARVIS_VOICES_DIR", "").strip()
    if env_root:
        roots.append(Path(env_root))
    roots.extend([
        Path.home() / ".jarvis" / "voices",
        Path.cwd() / "assets" / "voices",
        Path.cwd() / "assets" / "voice",
        Path.cwd() / "vendor" / "voices",
        Path.cwd() / "vendor" / "voice",
        Path.cwd() / "assets",
        Path.cwd() / "vendor",
        Path.cwd().parent / "assets" / "voices",
        Path.cwd().parent / "assets" / "voice",
        Path.cwd().parent / "vendor" / "voices",
        Path.cwd().parent / "vendor" / "voice",
        Path.cwd().parent / "vendor" / "voice and ui image",
    ])
    return roots


def _ollama_models() -> list[str]:
    if not shutil.which("ollama"):
        return []
    try:
        completed = subprocess.run(
            ["ollama", "list"],
            check=False,
            capture_output=True,
            text=True,
            timeout=5,
        )
    except Exception:
        return []
    if completed.returncode != 0:
        return []

    models = []
    for line in completed.stdout.splitlines():
        stripped = line.strip()
        if not stripped or stripped.lower().startswith("name "):
            continue
        models.append(stripped.split()[0])
    return models


def _quote(path: Path) -> str:
    value = str(path)
    return f'"{value}"' if " " in value else value


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


def _gguf_score(path: Path) -> tuple[int, int, str]:
    name = path.name.lower()
    quant_score = 0
    for score, token in (
        (120, "q4_k_m"),
        (110, "q5_k_m"),
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
    for score, token in ((50, "qwen"), (40, "gemma"), (35, "llama"), (30, "mistral")):
        if token in str(path).lower():
            family_score = score
            break
    return (family_score + quant_score, -len(name), name)


def _best_gguf(roots: Iterable[Path]) -> Path | None:
    selected = os.getenv("JARVIS_ACTIVE_GGUF_MODEL_PATH", "").strip()
    if selected:
        selected_path = Path(selected).expanduser()
        if selected_path.is_file() and selected_path.suffix.lower() == ".gguf":
            return selected_path
    files = _scan_files(roots, {".gguf"})
    if not files:
        return None
    return sorted(files, key=_gguf_score, reverse=True)[0]


def _physical_core_count() -> int:
    try:
        import psutil

        count = psutil.cpu_count(logical=False) or psutil.cpu_count(logical=True)
    except Exception:
        count = os.cpu_count()
    return max(2, int(count or 4))


def _vllm_score(path: Path) -> tuple[int, int, str]:
    text = str(path).lower()
    family_score = 0
    for score, token in ((60, "qwen"), (50, "gemma"), (45, "llama"), (40, "mistral"), (35, "deepseek")):
        if token in text:
            family_score = score
            break
    return (family_score, -len(path.name), path.name.lower())


def _best_vllm_model_dir(roots: Iterable[Path]) -> Path | None:
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
    if not candidates:
        return None
    return sorted(candidates, key=_vllm_score, reverse=True)[0]


def _best_ollama_model(models: list[str]) -> str:
    priorities = ("qwen", "gemma", "llama", "mistral", "phi", "deepseek")
    for token in priorities:
        for model in models:
            if token in model.lower():
                return model
    return models[0] if models else ""


def _first_available_port(
    preferred: int,
    fallbacks: Iterable[int],
    port_available: PortChecker,
    endpoint_ready: EndpointChecker,
) -> int:
    for port in (preferred, *tuple(fallbacks)):
        if endpoint_ready(port) or port_available(port):
            return port
    return preferred


def _find_kokoro_assets(roots: Iterable[Path]) -> dict[str, Any]:
    candidates = []
    for root in roots:
        candidates.extend([
            root / "hexgrad__Kokoro-82M",
            root / "kokoro",
            root,
        ])

    for base in candidates:
        try:
            if not base.exists():
                continue
            models = [path for path in base.glob("kokoro*") if path.is_file()]
            voices = [path for path in (base / "voices").glob("*.pt")]
            if models and voices:
                preferred_voice = next(
                    (voice for voice in voices if voice.name.lower() == "am_adam.pt"),
                    voices[0],
                )
                return {
                    "model_dir": str(base),
                    "model_files": [str(path) for path in models[:10]],
                    "voice": preferred_voice.stem,
                    "voices": [str(path) for path in voices[:50]],
                }
        except OSError:
            continue
    return {"model_dir": "", "model_files": [], "voice": "", "voices": []}


def _find_omnivoice_assets(roots: Iterable[Path]) -> dict[str, Any]:
    """Find local OmniVoice reference voices and model assets.

    JARVIS does not use cloud voice cloning. User-provided reference
    voices under assets/voices and vendor/voices are treated as local assets
    that Kokoro or OmniVoice-compatible runtimes can simulate offline.
    """
    voice_files: list[Path] = []
    model_files: list[Path] = []
    for root in roots:
        try:
            if not root.exists():
                continue
            for path in root.rglob("*"):
                if not path.is_file():
                    continue
                lower = str(path).lower()
                suffix = path.suffix.lower()
                if "omnivoice" in lower and suffix in {".onnx", ".pt", ".pth", ".safetensors"}:
                    model_files.append(path)
                if suffix in {".wav", ".mp3", ".flac", ".ogg", ".m4a", ".pt"}:
                    voice_files.append(path)
        except OSError:
            continue

    preferred_voice = next(
        (voice for voice in voice_files if "jarvis" in voice.name.lower()),
        voice_files[0] if voice_files else None,
    )
    return {
        "model_files": [str(path) for path in model_files[:20]],
        "voice": preferred_voice.stem if preferred_voice else "",
        "voices": [str(path) for path in voice_files[:100]],
    }


def _find_whisper_assets(roots: Iterable[Path]) -> list[str]:
    results = []
    for root in roots:
        try:
            if not root.exists():
                continue
            for path in root.rglob("*"):
                if not path.is_file():
                    continue
                lower = str(path).lower()
                if "whisper" in lower and path.suffix.lower() in {".bin", ".gguf", ".safetensors"}:
                    results.append(str(path))
        except OSError:
            continue
    return results[:20]


def _llm_plan(
    roots: list[Path],
    executable_available: ExecutableChecker,
    package_available: PackageChecker,
    ollama_models: OllamaModels,
    port_available: PortChecker,
    endpoint_ready: EndpointChecker,
) -> tuple[dict[str, Any], dict[str, Any]]:
    gguf = _best_gguf(roots)
    if gguf and executable_available("llama-server"):
        port = _first_available_port(8080, range(8081, 8090), port_available, endpoint_ready)
        endpoint = f"http://127.0.0.1:{port}/v1"
        model = gguf.stem
        has_nvidia = executable_available("nvidia-smi")
        ctx_size = int(os.getenv("JARVIS_LLAMA_CPP_CTX_SIZE") or "8192")
        gpu_layers = 999 if has_nvidia else 0
        threads = _physical_core_count()
        batch = int(os.getenv("JARVIS_LLAMA_CPP_BATCH_SIZE") or "256")
        start_command = (
            f"llama-server --model {_quote(gguf)} --host 127.0.0.1 --port {port} "
            f"--ctx-size {ctx_size} --n-gpu-layers {gpu_layers} --threads {threads} "
            f"--batch-size {batch}"
        )
        config_patch = {
            "model": model,
            "providers": {
                "llama_cpp_local": {
                    "base_url": endpoint,
                    "model": model,
                    "api_key": "",
                }
            },
        }
        return (
            {
                "backend": "llama.cpp",
                "model": model,
                "model_path": str(gguf),
                "endpoint": endpoint,
                "dependency_ready": True,
                "start_command": start_command,
                "actions": [f"Start llama.cpp server: {start_command}"],
                "optimization": "Default to llama.cpp with 8K context, physical-core threading, batch 256, and the selected GGUF for fast startup and low RAM/VRAM pressure.",
            },
            config_patch,
        )

    vllm_model_dir = _best_vllm_model_dir(roots)
    vllm_ready = executable_available("vllm") or package_available("vllm")
    if vllm_model_dir and vllm_ready:
        port = _first_available_port(8000, range(8001, 8010), port_available, endpoint_ready)
        endpoint = f"http://127.0.0.1:{port}/v1"
        model = str(vllm_model_dir)
        start_command = (
            f"python -m vllm.entrypoints.openai.api_server --model {_quote(vllm_model_dir)} "
            f"--host 127.0.0.1 --port {port} --gpu-memory-utilization 0.90"
        )
        config_patch = {
            "model": model,
            "providers": {
                "vllm_local": {
                    "base_url": endpoint,
                    "model": model,
                    "api_key": "",
                }
            },
        }
        return (
            {
                "backend": "vLLM",
                "model": model,
                "model_path": str(vllm_model_dir),
                "endpoint": endpoint,
                "dependency_ready": True,
                "start_command": start_command,
                "actions": [f"Start vLLM OpenAI-compatible server: {start_command}"],
                "optimization": "Use vLLM for higher throughput batching when a safetensors model directory is available.",
            },
            config_patch,
        )

    models = ollama_models() if executable_available("ollama") else []
    if models:
        model = _best_ollama_model(models)
        config_patch = {
            "model": model,
            "providers": {
                "ollama_local": {
                    "base_url": "http://127.0.0.1:11434/v1",
                    "model": model,
                    "api_key": "",
                }
            },
        }
        return (
            {
                "backend": "ollama",
                "model": model,
                "endpoint": "http://127.0.0.1:11434/v1",
                "dependency_ready": True,
                "start_command": "ollama serve",
                "actions": [],
                "optimization": "Ollama is retained as the last local fallback for already-registered models.",
            },
            config_patch,
        )

    actions = []
    if gguf and not executable_available("llama-server"):
        actions.append("Install llama.cpp/llama-server to serve the discovered GGUF model.")
    if vllm_model_dir and not vllm_ready:
        actions.append("Install vLLM to serve the discovered safetensors model directory.")
    if not gguf and not vllm_model_dir and not models:
        actions.append("Download a GGUF model for llama.cpp, a safetensors model for vLLM, or register an Ollama fallback.")
    return (
        {
            "backend": "unconfigured",
            "model": "",
            "dependency_ready": False,
            "actions": actions,
            "optimization": "Backend priority is llama.cpp first, vLLM second, Ollama last.",
        },
        {},
    )


def _tts_plan(
    config_patch: dict[str, Any],
    roots: list[Path],
    package_available: PackageChecker,
) -> dict[str, Any]:
    voice_roots = [*roots, *_default_voice_roots()]
    kokoro = _find_kokoro_assets(voice_roots)
    omnivoice = _find_omnivoice_assets(voice_roots)
    kokoro_runtime_ready = package_available("kokoro") or package_available("kokoro_onnx")
    omnivoice_runtime_ready = package_available("omnivoice") or package_available("omni_voice")

    if kokoro["model_files"] and kokoro_runtime_ready:
        provider = "kokoro"
        actions: list[str] = []
    elif omnivoice["voices"] and omnivoice_runtime_ready:
        provider = "omnivoice"
        actions = []
        if kokoro["model_files"]:
            actions.append("Install Kokoro runtime for offline low-latency TTS: pip install kokoro-onnx onnxruntime")
    elif kokoro["model_files"]:
        provider = "system"
        actions = ["Install Kokoro runtime for offline low-latency TTS: pip install kokoro-onnx onnxruntime"]
    elif omnivoice["voices"]:
        provider = "system"
        actions = ["Install OmniVoice runtime for local voice simulation from assets/voices or vendor/voices."]
    else:
        provider = "system"
        actions = ["Add Kokoro or OmniVoice voice assets under assets/voices or vendor/voices for local cloned voices."]

    config_patch.setdefault("tts", {})["provider"] = provider
    if kokoro["model_dir"]:
        config_patch["tts"].setdefault("kokoro", {})["model_dir"] = kokoro["model_dir"]
        if kokoro["voice"]:
            config_patch["tts"]["kokoro"]["voice"] = kokoro["voice"]
    if omnivoice["voices"]:
        config_patch["tts"].setdefault("omnivoice", {})["voice_assets"] = omnivoice["voices"]
        if omnivoice["voice"]:
            config_patch["tts"]["omnivoice"]["voice"] = omnivoice["voice"]

    return {
        "provider": provider,
        "target_provider": "kokoro" if kokoro["model_files"] else "omnivoice" if omnivoice["voices"] else provider,
        "dependency_ready": (
            provider == "system"
            or provider == "kokoro" and kokoro_runtime_ready
            or provider == "omnivoice" and omnivoice_runtime_ready
        ),
        "assets": {
            "kokoro": kokoro,
            "omnivoice": omnivoice,
            "voice_roots": [str(root) for root in voice_roots],
        },
        "actions": actions,
        "fallback_chain": ["kokoro", "omnivoice", "system"],
    }


def _stt_plan(
    config_patch: dict[str, Any],
    roots: list[Path],
    package_available: PackageChecker,
    executable_available: ExecutableChecker,
) -> dict[str, Any]:
    faster_ready = package_available("faster_whisper")
    whisper_cpp_ready = executable_available("whisper-cli") or executable_available("whisper")
    nvidia_ready = executable_available("nvidia-smi")
    assets = _find_whisper_assets(roots)
    local_model = "large-v3" if nvidia_ready else "base"
    local_device = "auto" if nvidia_ready else "cpu"
    local_compute = "float16" if nvidia_ready else "int8"
    local_language = "" if nvidia_ready else "en"

    config_patch.setdefault("stt", {})
    config_patch["stt"].update({
        "enabled": True,
        "provider": "local",
        "local": {
            "model": local_model,
            "language": local_language,
            "device": local_device,
            "compute_type": local_compute,
        },
    })

    actions: list[str] = []
    if not faster_ready:
        actions.append("Install faster-whisper for local STT: pip install faster-whisper")
    if assets and not faster_ready:
        actions.append("Use the discovered Whisper assets after converting/downloading a faster-whisper compatible CTranslate2 model.")
    if not assets and not faster_ready and not whisper_cpp_ready:
        actions.append("Download a Whisper model, install whisper.cpp, or configure OpenAI Whisper API credentials.")

    return {
        "provider": "local",
        "engine": "faster-whisper" if faster_ready else "faster-whisper",
        "dependency_ready": faster_ready,
        "whisper_cpp_ready": whisper_cpp_ready,
        "nvidia_ready": nvidia_ready,
        "selected_model": local_model,
        "assets": assets,
        "actions": actions,
        "optimization": "Use faster-whisper large-v3 on NVIDIA/CUDA; otherwise use base on CPU int8 for fast local STT. Fallback order is faster-whisper -> whisper.cpp -> OpenAI Whisper API.",
    }


def build_runtime_autoconfig_plan(
    config: Mapping[str, Any],
    *,
    model_roots: Iterable[Path] | None = None,
    executable_available: ExecutableChecker = _executable_available,
    package_available: PackageChecker = _package_available,
    ollama_models: OllamaModels = _ollama_models,
    port_available: PortChecker = _loopback_port_available,
    endpoint_ready: EndpointChecker = _openai_endpoint_ready,
) -> dict[str, Any]:
    """Return a config patch and action plan for a fast working runtime."""
    roots = list(_default_model_roots(config) if model_roots is None else model_roots)
    config_patch: dict[str, Any] = {}

    llm, llm_patch = _llm_plan(
        roots,
        executable_available,
        package_available,
        ollama_models,
        port_available,
        endpoint_ready,
    )
    config_patch.update(llm_patch)
    tts = _tts_plan(config_patch, roots, package_available)
    stt = _stt_plan(config_patch, roots, package_available, executable_available)

    actions = []
    for section in (llm, tts, stt):
        actions.extend(section.get("actions", []))

    production_ready = bool(
        llm.get("dependency_ready")
        and not llm.get("actions")
        and tts.get("dependency_ready")
        and not tts.get("actions")
        and stt.get("dependency_ready")
        and not stt.get("actions")
    )

    payload = {
        "production_ready": production_ready,
        "model_roots": [str(root) for root in roots],
        "llm": llm,
        "tts": tts,
        "stt": stt,
        "config_patch": config_patch,
        "actions": actions,
    }
    json.dumps(payload)
    return payload
