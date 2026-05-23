"""Autoconfiguration planner for fast local JARVIS runtimes."""

from __future__ import annotations

import importlib.util
import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any, Callable, Iterable, Mapping


PackageChecker = Callable[[str], bool]
ExecutableChecker = Callable[[str], bool]
OllamaModels = Callable[[], list[str]]


def _package_available(name: str) -> bool:
    return importlib.util.find_spec(name) is not None


def _executable_available(name: str) -> bool:
    return shutil.which(name) is not None


def _default_model_roots() -> list[Path]:
    roots = []
    env_root = os.getenv("JARVIS_MODELS_DIR", "").strip()
    if env_root:
        roots.append(Path(env_root))
    roots.extend([
        Path.home() / ".jarvis" / "models",
        Path.cwd() / "models",
        Path.cwd().parent / "models",
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
    files = _scan_files(roots, {".gguf"})
    if not files:
        return None
    return sorted(files, key=_gguf_score, reverse=True)[0]


def _best_ollama_model(models: list[str]) -> str:
    priorities = ("qwen", "gemma", "llama", "mistral", "phi", "deepseek")
    for token in priorities:
        for model in models:
            if token in model.lower():
                return model
    return models[0] if models else ""


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
    ollama_models: OllamaModels,
) -> tuple[dict[str, Any], dict[str, Any]]:
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
                "optimization": "Use Ollama keep_alive and Q4/Q5 quantized local models for fast startup.",
            },
            config_patch,
        )

    gguf = _best_gguf(roots)
    if gguf and executable_available("llama-server"):
        model = gguf.stem
        start_command = (
            f"llama-server --model {_quote(gguf)} --host 127.0.0.1 --port 8080 "
            "--ctx-size 32768 --n-gpu-layers 999 --threads 8"
        )
        config_patch = {
            "model": model,
            "providers": {
                "llama_cpp_local": {
                    "base_url": "http://127.0.0.1:8080/v1",
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
                "endpoint": "http://127.0.0.1:8080/v1",
                "dependency_ready": True,
                "start_command": start_command,
                "actions": [f"Start llama.cpp server: {start_command}"],
                "optimization": "Q4_K_M GGUF is preferred over F16 for faster tokens/sec and lower RAM/VRAM.",
            },
            config_patch,
        )

    actions = []
    if gguf and not executable_available("llama-server"):
        actions.append("Install llama.cpp/llama-server to serve the discovered GGUF model.")
    if not gguf and not models:
        actions.append("Download or register an LLM model with Ollama or llama.cpp.")
    return (
        {
            "backend": "unconfigured",
            "model": "",
            "dependency_ready": False,
            "actions": actions,
            "optimization": "Use Qwen/Gemma Q4_K_M GGUF or an Ollama model for fast local startup.",
        },
        {},
    )


def _tts_plan(
    config_patch: dict[str, Any],
    roots: list[Path],
    package_available: PackageChecker,
) -> dict[str, Any]:
    kokoro = _find_kokoro_assets(roots)
    kokoro_runtime_ready = package_available("kokoro") or package_available("kokoro_onnx")
    edge_ready = package_available("edge_tts")

    if kokoro["model_files"] and kokoro_runtime_ready:
        provider = "kokoro"
        actions: list[str] = []
    elif edge_ready:
        provider = "edge"
        actions = []
        if kokoro["model_files"]:
            actions.append("Install Kokoro runtime for offline low-latency TTS: pip install kokoro-onnx onnxruntime")
    else:
        provider = "kokoro" if kokoro["model_files"] else "edge"
        actions = ["Install a TTS runtime: pip install edge-tts or pip install kokoro-onnx onnxruntime"]

    config_patch.setdefault("tts", {})["provider"] = provider
    if kokoro["model_dir"]:
        config_patch["tts"].setdefault("kokoro", {})["model_dir"] = kokoro["model_dir"]
        if kokoro["voice"]:
            config_patch["tts"]["kokoro"]["voice"] = kokoro["voice"]

    return {
        "provider": provider,
        "target_provider": "kokoro" if kokoro["model_files"] else provider,
        "dependency_ready": provider == "edge" and edge_ready or provider == "kokoro" and kokoro_runtime_ready,
        "assets": kokoro,
        "actions": actions,
        "fallback_chain": ["kokoro", "edge", "openai", "elevenlabs", "system"],
    }


def _stt_plan(
    config_patch: dict[str, Any],
    roots: list[Path],
    package_available: PackageChecker,
    executable_available: ExecutableChecker,
) -> dict[str, Any]:
    faster_ready = package_available("faster_whisper")
    whisper_cpp_ready = executable_available("whisper-cli") or executable_available("whisper")
    assets = _find_whisper_assets(roots)

    config_patch.setdefault("stt", {})
    config_patch["stt"].update({
        "enabled": True,
        "provider": "local",
        "local": {
            "model": "large-v3",
            "device": "auto",
            "compute_type": "int8_float16",
        },
    })

    actions: list[str] = []
    if not faster_ready:
        actions.append("Install faster-whisper for local STT: pip install faster-whisper")
    if assets and not faster_ready:
        actions.append("Use the discovered Whisper assets after converting/downloading a faster-whisper compatible CTranslate2 model.")
    if not assets and not faster_ready and not whisper_cpp_ready:
        actions.append("Download a Whisper model or configure OpenAI/Groq STT credentials.")

    return {
        "provider": "local",
        "engine": "faster-whisper" if faster_ready else "faster-whisper",
        "dependency_ready": faster_ready,
        "whisper_cpp_ready": whisper_cpp_ready,
        "assets": assets,
        "actions": actions,
        "optimization": "Use faster-whisper with CUDA when available, CPU int8 fallback otherwise.",
    }


def build_runtime_autoconfig_plan(
    config: Mapping[str, Any],
    *,
    model_roots: Iterable[Path] | None = None,
    executable_available: ExecutableChecker = _executable_available,
    package_available: PackageChecker = _package_available,
    ollama_models: OllamaModels = _ollama_models,
) -> dict[str, Any]:
    """Return a config patch and action plan for a fast working runtime."""
    roots = list(_default_model_roots() if model_roots is None else model_roots)
    config_patch: dict[str, Any] = {}

    llm, llm_patch = _llm_plan(roots, executable_available, ollama_models)
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
