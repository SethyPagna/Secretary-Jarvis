"""Runtime readiness checks for JARVIS model and voice stacks.

This module is intentionally dependency-light. The desktop shell can call it
before optional packages such as FastAPI, faster-whisper, or Kokoro are
installed and still get a precise list of what is ready and what is blocking
production use.
"""

from __future__ import annotations

import importlib.util
import json
import os
import shutil
import time
import urllib.request
from pathlib import Path
from typing import Any, Callable, Iterable, Mapping


PackageChecker = Callable[[str], bool]
ExecutableChecker = Callable[[str], bool]
EndpointProbe = Callable[[str], Mapping[str, Any]]

MODEL_EXTENSIONS = {".gguf", ".safetensors", ".bin", ".onnx", ".pth"}
LOCAL_BACKENDS = {"ollama", "llama.cpp", "vllm", "lm-studio", "custom-local"}


def _package_available(name: str) -> bool:
    return importlib.util.find_spec(name) is not None


def _executable_available(name: str) -> bool:
    return shutil.which(name) is not None


def _probe_endpoint(url: str) -> Mapping[str, Any]:
    """Probe an OpenAI-compatible endpoint with a short timeout."""
    if not url:
        return {"ok": False, "error": "missing endpoint"}
    base = url.rstrip("/")
    if base.endswith("/v1"):
        probe_url = f"{base}/models"
    else:
        probe_url = f"{base}/v1/models"

    started = time.perf_counter()
    try:
        with urllib.request.urlopen(probe_url, timeout=1.5) as response:
            body = response.read(2048)
        latency_ms = round((time.perf_counter() - started) * 1000, 2)
        return {
            "ok": 200 <= response.status < 300,
            "latency_ms": latency_ms,
            "sample": body.decode("utf-8", errors="ignore")[:160],
        }
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def _probe_health_url(url: str) -> Mapping[str, Any]:
    if not url:
        return {"ok": False, "error": "missing endpoint"}
    probe_url = f"{url.rstrip('/')}/health"
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(probe_url, timeout=1.5) as response:
            body = response.read(2048)
        return {
            "ok": 200 <= response.status < 300,
            "latency_ms": round((time.perf_counter() - started) * 1000, 2),
            "sample": body.decode("utf-8", errors="ignore")[:240],
        }
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def _cfg(config: Mapping[str, Any], *keys: str, default: Any = None) -> Any:
    current: Any = config
    for key in keys:
        if not isinstance(current, Mapping):
            return default
        current = current.get(key, default)
    return current


def _first_provider(config: Mapping[str, Any]) -> tuple[str, Mapping[str, Any]]:
    providers = config.get("providers")
    if isinstance(providers, Mapping):
        for name, value in providers.items():
            if isinstance(value, Mapping):
                return str(name), value
    custom = config.get("custom_providers")
    if isinstance(custom, list):
        for value in custom:
            if isinstance(value, Mapping):
                return str(value.get("name") or "custom"), value
    return "", {}


def _infer_backend(provider_name: str, provider: Mapping[str, Any], env: Mapping[str, str]) -> str:
    name = provider_name.lower()
    base_url = str(provider.get("base_url") or provider.get("url") or "").lower()
    combined = f"{name} {base_url}"

    if "ollama" in combined or ":11434" in combined:
        return "ollama"
    if "llama" in combined or ":8080" in combined:
        return "llama.cpp"
    if "vllm" in combined or ":8000" in combined:
        return "vllm"
    if "lmstudio" in combined or "lm-studio" in combined or ":1234" in combined:
        return "lm-studio"
    if "anthropic" in combined or env.get("ANTHROPIC_API_KEY"):
        return "anthropic"
    if "gemini" in combined or env.get("GEMINI_API_KEY") or env.get("GOOGLE_API_KEY"):
        return "gemini"
    if "groq" in combined or env.get("GROQ_API_KEY"):
        return "groq"
    if "together" in combined or env.get("TOGETHER_API_KEY"):
        return "together"
    if "openai" in combined or env.get("OPENAI_API_KEY"):
        return "openai"
    if base_url.startswith(("http://127.", "http://localhost", "http://0.0.0.0")):
        return "custom-local"
    return "unconfigured"


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


def _find_model_assets(model_name: str, roots: Iterable[Path]) -> list[str]:
    needle = model_name.lower().replace("/", "-").replace(":", "-").replace("_", "-")
    assets: list[str] = []
    for root in roots:
        try:
            if not root.exists():
                continue
            for path in root.rglob("*"):
                if not path.is_file() or path.suffix.lower() not in MODEL_EXTENSIONS:
                    continue
                normalized = path.name.lower().replace("_", "-")
                if not needle or needle in normalized or normalized in needle:
                    assets.append(str(path))
        except OSError:
            continue
    return assets[:20]


def _env_has(env: Mapping[str, str], *names: str) -> bool:
    return any(bool(str(env.get(name, "")).strip()) for name in names)


def _llm_status(
    config: Mapping[str, Any],
    env: Mapping[str, str],
    model_roots: Iterable[Path],
    endpoint_probe: EndpointProbe,
) -> dict[str, Any]:
    provider_name, provider = _first_provider(config)
    model = str(provider.get("model") or config.get("model") or "").strip()
    base_url = str(provider.get("base_url") or provider.get("url") or "").strip()
    backend = _infer_backend(provider_name, provider, env)
    assets = _find_model_assets(model, model_roots) if model else []
    issues: list[str] = []
    endpoint: Mapping[str, Any] = {"ok": False}

    if not model:
        issues.append("No active LLM model is configured.")
    if backend == "unconfigured":
        issues.append("No LLM provider or local backend is configured.")

    if backend in LOCAL_BACKENDS and base_url:
        endpoint = endpoint_probe(base_url)
        if not endpoint.get("ok"):
            issues.append(f"{backend} endpoint is not reachable: {endpoint.get('error', 'offline')}")
    elif backend in LOCAL_BACKENDS and not assets:
        issues.append("No local model asset was found for the active model.")
    elif backend == "openai" and not _env_has(env, "OPENAI_API_KEY"):
        issues.append("OPENAI_API_KEY is required for the active OpenAI model.")
    elif backend == "anthropic" and not _env_has(env, "ANTHROPIC_API_KEY"):
        issues.append("ANTHROPIC_API_KEY is required for the active Anthropic model.")
    elif backend == "gemini" and not _env_has(env, "GEMINI_API_KEY", "GOOGLE_API_KEY"):
        issues.append("GEMINI_API_KEY or GOOGLE_API_KEY is required for Gemini.")
    elif backend == "groq" and not _env_has(env, "GROQ_API_KEY"):
        issues.append("GROQ_API_KEY is required for Groq.")
    elif backend == "together" and not _env_has(env, "TOGETHER_API_KEY"):
        issues.append("TOGETHER_API_KEY is required for Together AI.")

    target_tps = {
        "ollama": 35,
        "llama.cpp": 28,
        "vllm": 80,
        "lm-studio": 30,
        "custom-local": 30,
        "openai": 120,
        "anthropic": 90,
        "gemini": 120,
        "groq": 300,
        "together": 120,
    }.get(backend, 0)

    return {
        "backend": backend,
        "provider": provider_name,
        "model": model,
        "base_url": base_url,
        "ready": not issues,
        "issues": issues,
        "local_assets": assets,
        "endpoint": dict(endpoint),
        "tokens_per_second_target": target_tps,
    }


def _kokoro_assets(config: Mapping[str, Any], model_roots: Iterable[Path]) -> dict[str, Any]:
    model_dir = str(_cfg(config, "tts", "kokoro", "model_dir", default="") or "").strip()
    roots = [Path(model_dir)] if model_dir else []
    roots.extend(Path(root) / "hexgrad__Kokoro-82M" for root in model_roots)

    model_files: list[str] = []
    voices: list[str] = []
    for root in roots:
        try:
            if not root.exists():
                continue
            model_files.extend(str(path) for path in root.glob("kokoro*") if path.is_file())
            voices.extend(str(path) for path in (root / "voices").glob("*.pt"))
        except OSError:
            continue
    return {"model_files": model_files[:10], "voices": voices[:50]}


def _omnivoice_assets(config: Mapping[str, Any]) -> dict[str, Any]:
    configured = _cfg(config, "tts", "omnivoice", "voice_assets", default=[]) or []
    roots = [
        Path.cwd() / "assets" / "voices",
        Path.cwd() / "vendor" / "voices",
    ]
    voices = [str(Path(path)) for path in configured if str(path).strip()]
    for root in roots:
        try:
            if not root.exists():
                continue
            voices.extend(
                str(path)
                for path in root.rglob("*")
                if path.is_file() and path.suffix.lower() in {".wav", ".mp3", ".flac", ".ogg", ".m4a", ".pt"}
            )
        except OSError:
            continue
    return {"voices": voices[:100]}


def _tts_status(
    config: Mapping[str, Any],
    env: Mapping[str, str],
    model_roots: Iterable[Path],
    package_available: PackageChecker,
    executable_available: ExecutableChecker,
) -> dict[str, Any]:
    provider = str(_cfg(config, "tts", "provider", default="kokoro") or "kokoro").strip().lower()
    engine = {
        "kokoro": "kokoro",
        "omnivoice": "omnivoice",
        "system": "system-tts",
        "piper": "piper",
        "neutts": "neutts",
        "kittentts": "kittentts",
    }.get(provider, provider or "unconfigured")
    issues: list[str] = []
    assets: dict[str, Any] = {}
    endpoint: Mapping[str, Any] = {}

    if provider == "kokoro":
        assets = _kokoro_assets(config, model_roots)
        package_ok = package_available("kokoro") or package_available("kokoro_onnx")
        if not package_ok:
            issues.append("Kokoro Python package is not installed.")
        if not assets["model_files"] or not assets["voices"]:
            issues.append("Kokoro model or voice assets are missing.")
    elif provider == "omnivoice":
        assets = _omnivoice_assets(config)
        if not (package_available("omnivoice") or package_available("omni_voice")):
            issues.append("OmniVoice runtime is not installed.")
        if not assets["voices"]:
            issues.append("OmniVoice reference voices are missing from assets/voices or vendor/voices.")
    elif provider == "piper":
        if not (package_available("piper") or executable_available("piper")):
            issues.append("Piper TTS is not installed.")
    elif provider == "neutts":
        if not package_available("neutts"):
            issues.append("NeuTTS is not installed.")
    elif provider == "kittentts":
        if not package_available("kittentts"):
            issues.append("KittenTTS is not installed.")
    elif provider == "system":
        if not (
            executable_available("say")
            or executable_available("espeak")
            or executable_available("powershell")
        ):
            issues.append("No system TTS command was found.")
    elif provider == "docker":
        issues.append("Docker voice runtime has been removed from JARVIS Desktop.")
    else:
        issues.append(f"Unknown TTS provider: {provider or 'empty'}")

    return {
        "engine": engine,
        "provider": provider,
        "ready": not issues,
        "issues": issues,
        "assets": assets,
        "endpoint": dict(endpoint),
        "fallback_chain": ["kokoro", "omnivoice", "system"],
    }


def _stt_status(
    config: Mapping[str, Any],
    env: Mapping[str, str],
    package_available: PackageChecker,
    executable_available: ExecutableChecker,
) -> dict[str, Any]:
    enabled = bool(_cfg(config, "stt", "enabled", default=True))
    provider = str(_cfg(config, "stt", "provider", default="local") or "local").strip().lower()
    model = str(_cfg(config, "stt", provider, "model", default="") or _cfg(config, "stt", "local", "model", default="base"))
    issues: list[str] = []
    endpoint: Mapping[str, Any] = {}

    if not enabled:
        return {
            "engine": "disabled",
            "provider": provider,
            "model": model,
            "ready": False,
            "issues": ["STT is disabled."],
            "fallback_chain": ["faster-whisper", "whisper.cpp", "openai"],
        }

    if provider in {"local", "faster-whisper", "faster_whisper"}:
        engine = "faster-whisper"
        if not package_available("faster_whisper"):
            issues.append("faster-whisper is not installed.")
    elif provider in {"whisper.cpp", "whisper-cpp", "whisper_cpp"}:
        engine = "whisper.cpp"
        if not (executable_available("whisper-cli") or executable_available("main")):
            issues.append("whisper.cpp executable is not available.")
    elif provider == "openai":
        engine = "openai-whisper"
        if not _env_has(env, "OPENAI_API_KEY"):
            issues.append("OPENAI_API_KEY is required for OpenAI transcription.")
    elif provider == "groq":
        engine = "groq-whisper"
        if not _env_has(env, "GROQ_API_KEY"):
            issues.append("GROQ_API_KEY is required for Groq Whisper.")
    elif provider == "docker":
        engine = "removed-docker-stt"
        issues.append("Docker STT runtime has been removed from JARVIS Desktop.")
    else:
        engine = provider or "unconfigured"
        issues.append(f"Unknown STT provider: {provider or 'empty'}")

    return {
        "engine": engine,
        "provider": provider,
        "model": model,
        "ready": not issues,
        "issues": issues,
        "endpoint": dict(endpoint),
        "fallback_chain": ["faster-whisper", "whisper.cpp", "openai"],
    }


def _optimization_flags(config: Mapping[str, Any], llm: Mapping[str, Any], stt: Mapping[str, Any]) -> list[str]:
    flags = ["streaming", "hot-swap-models"]
    if llm.get("backend") in LOCAL_BACKENDS:
        flags.append("local-llm")
    device = str(_cfg(config, "stt", "local", "device", default="") or "").lower()
    if "cuda" in device:
        flags.append("cuda")
    if llm.get("tokens_per_second_target", 0) >= 80:
        flags.append("high-throughput")
    if stt.get("engine") == "faster-whisper":
        flags.append("fast-stt")
    return flags


def build_runtime_readiness(
    config: Mapping[str, Any],
    *,
    env: Mapping[str, str] | None = None,
    model_roots: Iterable[Path] | None = None,
    package_available: PackageChecker = _package_available,
    executable_available: ExecutableChecker = _executable_available,
    endpoint_probe: EndpointProbe = _probe_endpoint,
) -> dict[str, Any]:
    """Build a desktop/API friendly readiness payload for LLM, TTS, and STT."""
    env_map = dict(os.environ if env is None else env)
    roots = list(_default_model_roots() if model_roots is None else model_roots)

    llm = _llm_status(config, env_map, roots, endpoint_probe)
    tts = _tts_status(config, env_map, roots, package_available, executable_available)
    stt = _stt_status(config, env_map, package_available, executable_available)

    blocking = []
    for label, section in (("llm", llm), ("tts", tts), ("stt", stt)):
        for issue in section.get("issues", []):
            blocking.append({"component": label, "issue": issue})

    payload = {
        "production_ready": not blocking,
        "llm": llm,
        "tts": tts,
        "stt": stt,
        "optimizations": _optimization_flags(config, llm, stt),
        "blocking_issues": blocking,
    }
    json.dumps(payload)  # Guard API serializability while staying cheap.
    return payload
