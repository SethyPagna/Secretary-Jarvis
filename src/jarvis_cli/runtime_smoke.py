"""Runtime smoke tests that verify JARVIS can actually think, speak, and hear."""

from __future__ import annotations

import json
import os
import importlib.util
import tempfile
import time
import urllib.parse
import urllib.request
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Callable, Mapping

from jarvis_cli.runtime_readiness import _cfg, _first_provider, _infer_backend


Probe = Callable[..., Mapping[str, Any]]
SMOKE_PROMPT = "/no_think\nReply with exactly: ready"
SMOKE_TTS_TEXT = "JARVIS runtime smoke ready."


def _elapsed_ms(started: float) -> float:
    return round((time.perf_counter() - started) * 1000, 2)


def _count_tokens(text: str) -> int:
    return max(1, len((text or "").split()))


@contextmanager
def _temporary_environ(env: Mapping[str, str]):
    previous: dict[str, str | None] = {}
    for key, value in env.items():
        previous[key] = os.environ.get(key)
        os.environ[key] = str(value)
    try:
        yield
    finally:
        for key, old_value in previous.items():
            if old_value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = old_value


def _tokens_per_second(text: str, latency_ms: float, explicit_tokens: Any = None) -> float:
    try:
        tokens = int(explicit_tokens)
    except (TypeError, ValueError):
        tokens = _count_tokens(text)
    seconds = max(latency_ms / 1000, 0.001)
    return round(tokens / seconds, 2)


def _provider_settings(config: Mapping[str, Any], env: Mapping[str, str]) -> dict[str, Any]:
    provider_name, provider = _first_provider(config)
    model = str(provider.get("model") or config.get("model") or "").strip()
    base_url = str(provider.get("base_url") or provider.get("url") or provider.get("api") or "").strip()
    backend = _infer_backend(provider_name, provider, env)

    if backend == "ollama" and not base_url:
        base_url = "http://127.0.0.1:11434"
    elif backend == "llama.cpp" and not base_url:
        base_url = "http://127.0.0.1:8080"
    elif backend == "vllm" and not base_url:
        base_url = "http://127.0.0.1:8000"
    elif backend == "lm-studio" and not base_url:
        base_url = "http://127.0.0.1:1234"
    elif backend == "openai" and not base_url:
        base_url = "https://api.openai.com/v1"
    elif backend == "groq" and not base_url:
        base_url = "https://api.groq.com/openai/v1"
    elif backend == "together" and not base_url:
        base_url = "https://api.together.xyz/v1"
    elif backend == "anthropic" and not base_url:
        base_url = "https://api.anthropic.com/v1"
    elif backend == "gemini" and not base_url:
        base_url = "https://generativelanguage.googleapis.com/v1beta"

    return {
        "provider_name": provider_name,
        "provider": provider,
        "model": model,
        "base_url": base_url,
        "backend": backend,
        "api_key": _resolve_api_key(provider, backend, env),
    }


def _resolve_api_key(provider: Mapping[str, Any], backend: str, env: Mapping[str, str]) -> str:
    configured_key = str(provider.get("api_key") or "").strip()
    if configured_key.startswith("${") and configured_key.endswith("}"):
        configured_key = str(env.get(configured_key[2:-1], "") or "").strip()
    if configured_key:
        return configured_key

    key_env = str(provider.get("key_env") or provider.get("api_key_env") or "").strip()
    if key_env and env.get(key_env):
        return str(env.get(key_env) or "")

    candidates = {
        "openai": ("OPENAI_API_KEY",),
        "anthropic": ("ANTHROPIC_API_KEY",),
        "gemini": ("GEMINI_API_KEY", "GOOGLE_API_KEY"),
        "groq": ("GROQ_API_KEY",),
        "together": ("TOGETHER_API_KEY",),
    }.get(backend, ("OPENAI_API_KEY",))
    for name in candidates:
        if env.get(name):
            return str(env.get(name) or "")
    return ""


def _json_request(
    url: str,
    payload: Mapping[str, Any],
    *,
    headers: Mapping[str, str] | None = None,
    timeout: float = 10.0,
) -> dict[str, Any]:
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", **dict(headers or {})},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        body = response.read()
    return json.loads(body.decode("utf-8"))


def _openai_compatible_probe(settings: Mapping[str, Any], prompt: str) -> dict[str, Any]:
    model = str(settings.get("model") or "").strip()
    base_url = str(settings.get("base_url") or "").rstrip("/")
    if not model:
        return {"ready": False, "error": "No active LLM model is configured."}
    if not base_url:
        return {"ready": False, "error": "No OpenAI-compatible base URL is configured."}

    url = f"{base_url}/chat/completions" if base_url.endswith("/v1") else f"{base_url}/v1/chat/completions"
    api_key = str(settings.get("api_key") or "")
    headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0,
        "max_tokens": 64,
        "stream": False,
    }
    if str(settings.get("backend") or "").lower() == "llama.cpp":
        payload["chat_template_kwargs"] = {"enable_thinking": False}

    started = time.perf_counter()
    body = _json_request(url, payload, headers=headers)
    latency_ms = _elapsed_ms(started)
    choices = body.get("choices") or []
    response = ""
    if choices:
        message = choices[0].get("message") or {}
        response = str(message.get("content") or "").strip()
    usage = body.get("usage") if isinstance(body.get("usage"), Mapping) else {}

    return {
        "ready": bool(response),
        "response": response,
        "latency_ms": latency_ms,
        "tokens_per_second": _tokens_per_second(
            response,
            latency_ms,
            usage.get("completion_tokens"),
        ),
        "model": model,
        "backend": settings.get("backend"),
        "provider": settings.get("provider_name"),
    }


def _start_local_runtime_for_smoke(settings: Mapping[str, Any]) -> dict[str, Any]:
    """Start the native local helper before declaring a local LLM offline."""
    backend = str(settings.get("backend") or "").lower()
    if backend not in {"llama.cpp", "vllm", "ollama", "custom-local", "lm-studio"}:
        return {"ok": False, "skipped": True}
    try:
        from jarvis_cli.local_runtime import start_local_runtime

        return dict(start_local_runtime(timeout_seconds=150.0))
    except Exception as exc:
        return {"ok": False, "error": f"{type(exc).__name__}: {exc}"}


def _settings_from_local_runtime(
    original: Mapping[str, Any],
    start_result: Mapping[str, Any],
) -> dict[str, Any]:
    settings = dict(original)
    endpoint = str(start_result.get("endpoint") or "").strip()
    if endpoint:
        settings["base_url"] = endpoint
    plan = start_result.get("plan")
    plan_llm = plan.get("llm") if isinstance(plan, Mapping) and isinstance(plan.get("llm"), Mapping) else {}
    if plan_llm.get("model"):
        settings["model"] = str(plan_llm.get("model") or settings.get("model") or "")
    if plan_llm.get("backend"):
        settings["backend"] = str(plan_llm.get("backend") or settings.get("backend") or "")
    return settings


def _ollama_probe(settings: Mapping[str, Any], prompt: str) -> dict[str, Any]:
    model = str(settings.get("model") or "").strip()
    base_url = str(settings.get("base_url") or "http://127.0.0.1:11434").rstrip("/")
    if base_url.endswith("/v1"):
        base_url = base_url[: -len("/v1")]
    if not model:
        return {"ready": False, "error": "No Ollama model is configured."}

    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt.replace("/no_think\n", "")}],
        "stream": False,
        "think": False,
        "options": {
            "temperature": 0,
            "num_predict": 32,
        },
    }
    started = time.perf_counter()
    body = _json_request(f"{base_url}/api/chat", payload)
    latency_ms = _elapsed_ms(started)
    message = body.get("message") if isinstance(body.get("message"), Mapping) else {}
    response = str(message.get("content") or "").strip()
    eval_count = body.get("eval_count")
    eval_duration_ns = body.get("eval_duration")
    if eval_count and eval_duration_ns:
        try:
            tokens_per_second = round(int(eval_count) / (int(eval_duration_ns) / 1_000_000_000), 2)
        except (TypeError, ValueError, ZeroDivisionError):
            tokens_per_second = _tokens_per_second(response, latency_ms)
    else:
        tokens_per_second = _tokens_per_second(response, latency_ms)

    return {
        "ready": bool(response),
        "response": response,
        "latency_ms": latency_ms,
        "tokens_per_second": tokens_per_second,
        "model": model,
        "backend": "ollama",
        "provider": settings.get("provider_name"),
    }


def _anthropic_probe(settings: Mapping[str, Any], prompt: str) -> dict[str, Any]:
    model = str(settings.get("model") or "").strip()
    api_key = str(settings.get("api_key") or "")
    if not model:
        return {"ready": False, "error": "No Anthropic model is configured."}
    if not api_key:
        return {"ready": False, "error": "ANTHROPIC_API_KEY is required."}

    url = f"{str(settings.get('base_url') or '').rstrip('/')}/messages"
    started = time.perf_counter()
    body = _json_request(
        url,
        {
            "model": model,
            "max_tokens": 16,
            "temperature": 0,
            "messages": [{"role": "user", "content": prompt}],
        },
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
    )
    latency_ms = _elapsed_ms(started)
    parts = body.get("content") or []
    response = ""
    if parts and isinstance(parts[0], Mapping):
        response = str(parts[0].get("text") or "").strip()
    usage = body.get("usage") if isinstance(body.get("usage"), Mapping) else {}
    return {
        "ready": bool(response),
        "response": response,
        "latency_ms": latency_ms,
        "tokens_per_second": _tokens_per_second(response, latency_ms, usage.get("output_tokens")),
        "model": model,
        "backend": "anthropic",
        "provider": settings.get("provider_name"),
    }


def _gemini_probe(settings: Mapping[str, Any], prompt: str) -> dict[str, Any]:
    model = str(settings.get("model") or "").strip()
    api_key = str(settings.get("api_key") or "")
    if not model:
        return {"ready": False, "error": "No Gemini model is configured."}
    if not api_key:
        return {"ready": False, "error": "GEMINI_API_KEY or GOOGLE_API_KEY is required."}

    base_url = str(settings.get("base_url") or "").rstrip("/")
    model_path = urllib.parse.quote(model, safe="")
    url = f"{base_url}/models/{model_path}:generateContent?key={urllib.parse.quote(api_key)}"
    started = time.perf_counter()
    body = _json_request(
        url,
        {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0, "maxOutputTokens": 16},
        },
        headers={},
    )
    latency_ms = _elapsed_ms(started)
    candidates = body.get("candidates") or []
    response = ""
    if candidates:
        content = candidates[0].get("content") or {}
        parts = content.get("parts") or []
        if parts and isinstance(parts[0], Mapping):
            response = str(parts[0].get("text") or "").strip()
    usage = body.get("usageMetadata") if isinstance(body.get("usageMetadata"), Mapping) else {}
    return {
        "ready": bool(response),
        "response": response,
        "latency_ms": latency_ms,
        "tokens_per_second": _tokens_per_second(response, latency_ms, usage.get("candidatesTokenCount")),
        "model": model,
        "backend": "gemini",
        "provider": settings.get("provider_name"),
    }


def default_llm_probe(config: Mapping[str, Any], env: Mapping[str, str], prompt: str) -> dict[str, Any]:
    settings = _provider_settings(config, env)
    backend = settings["backend"]
    if backend == "unconfigured":
        return {"ready": False, "error": "No LLM provider or local backend is configured."}
    try:
        if backend == "ollama":
            result = _ollama_probe(settings, prompt)
        elif backend == "anthropic":
            result = _anthropic_probe(settings, prompt)
        elif backend == "gemini":
            result = _gemini_probe(settings, prompt)
        else:
            result = _openai_compatible_probe(settings, prompt)
    except Exception as exc:
        result = {"ready": False, "error": f"{type(exc).__name__}: {exc}"}

    if result.get("ready"):
        return result

    # If the selected local runtime is not answering yet, make the smoke test
    # exercise the same native helper startup path the desktop chat uses. This
    # warms the GGUF server and avoids falling back to cloud just because the
    # endpoint was cold at probe time.
    if backend in {"llama.cpp", "vllm", "ollama", "custom-local", "lm-studio"}:
        local_start = _start_local_runtime_for_smoke(settings)
        if local_start.get("ok"):
            warmed_settings = _settings_from_local_runtime(settings, local_start)
            try:
                warmed = _openai_compatible_probe(warmed_settings, prompt)
            except Exception as exc:
                warmed = {"ready": False, "error": f"{type(exc).__name__}: {exc}"}
            warmed["local_runtime_start"] = {
                key: local_start.get(key)
                for key in ("ok", "running", "already_running", "adopted", "pid", "endpoint")
                if key in local_start
            }
            if warmed.get("ready"):
                return warmed
            result = {
                **result,
                "local_runtime_start": warmed["local_runtime_start"],
                "local_runtime_error": warmed.get("error") or warmed,
            }
        else:
            result = {
                **result,
                "local_runtime_start": {
                    key: local_start.get(key)
                    for key in ("ok", "error", "skipped", "endpoint")
                    if key in local_start
                },
            }

    # Desktop chat falls back to a verified Mistral key when the selected local
    # llama.cpp/vLLM/Ollama endpoint is not actually serving chat. Keep smoke
    # aligned with that user-visible behavior instead of reporting a dead local
    # endpoint as the whole app being dead.
    if backend in {"llama.cpp", "vllm", "ollama", "custom-local", "lm-studio"} and env.get("MISTRAL_API_KEY"):
        fallback_settings = {
            "provider_name": "mistral_api",
            "provider": {},
            "model": env.get("MISTRAL_MODEL") or "mistral-small-latest",
            "base_url": "https://api.mistral.ai/v1",
            "backend": "openai-compatible",
            "api_key": env.get("MISTRAL_API_KEY") or "",
        }
        try:
            fallback = _openai_compatible_probe(fallback_settings, prompt)
        except Exception as exc:
            fallback = {"ready": False, "error": f"{type(exc).__name__}: {exc}"}
        fallback["fallback_from"] = backend
        fallback["primary_error"] = result.get("error") or result
        return fallback

    return result


def default_tts_probe(
    config: Mapping[str, Any],
    env: Mapping[str, str],
    text: str,
    output_dir: Path,
) -> dict[str, Any]:
    provider = str(_cfg(config, "tts", "provider", default="kokoro") or "kokoro").lower()
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / ("jarvis-smoke-tts.wav" if provider == "system" else "jarvis-smoke-tts.mp3")
    timeout = float(env.get("JARVIS_SMOKE_TIMEOUT_SECONDS", "20") or 20)

    started = time.perf_counter()
    error = ""
    try:
        if provider in {"kokoro", "omnivoice", "system", "edge", "system-tts", "windows", "sapi"}:
            from jarvis_cli.desktop_voice import synthesize_desktop_speech

            # Match the Home page path exactly: when the config says "system"
            # but local Kokoro assets/runtime are available, desktop speech
            # auto-promotes to Kokoro instead of downgrading the smoke result.
            requested_provider = None if provider in {"", "system", "edge", "system-tts", "windows", "sapi"} else provider
            payload = synthesize_desktop_speech(text, output_dir, provider=requested_provider)
            audio_path = str(payload.get("file_path") or "")
            return {
                "ready": bool(payload.get("success")),
                "engine": payload.get("engine") or provider,
                "provider": payload.get("provider") or provider,
                "fallback_from": payload.get("fallback_from", ""),
                "fallback_reason": payload.get("fallback_reason", ""),
                "latency_ms": payload.get("latency_ms") or _elapsed_ms(started),
                "audio_path": audio_path,
                "audio_bytes": payload.get("audio_bytes") or 0,
                "error": payload.get("error", ""),
            }
        elif provider == "docker":
            error = (
                "Docker TTS runtime has been removed from JARVIS Desktop. "
                "Use kokoro, omnivoice, or system for local smoke testing."
            )
        else:
            error = (
                f"TTS smoke test for provider '{provider}' is not implemented yet. "
                "Use kokoro, omnivoice, or system for local smoke testing."
            )
    except TimeoutError:
        error = f"TTS smoke test timed out after {timeout:.1f}s."
    except Exception as exc:
        error = f"{type(exc).__name__}: {exc}"

    latency_ms = _elapsed_ms(started)
    audio_bytes = output_path.stat().st_size if output_path.exists() else 0
    ready = bool(audio_bytes > 0 and not error)
    result = {
        "ready": ready,
        "engine": provider,
        "latency_ms": latency_ms,
        "audio_path": str(output_path) if output_path.exists() else "",
        "audio_bytes": audio_bytes,
    }
    if not ready:
        result["error"] = error or "TTS did not produce audio."
    return result


def default_stt_probe(
    config: Mapping[str, Any],
    env: Mapping[str, str],
    sample_audio: Path | None,
) -> dict[str, Any]:
    provider = str(_cfg(config, "stt", "provider", default="local") or "local").lower()
    if sample_audio is None or not sample_audio.exists():
        return {
            "ready": False,
            "engine": provider,
            "error": "No sample audio is available for STT smoke testing.",
        }
    if provider in {"local", "faster-whisper", "faster_whisper"} and importlib.util.find_spec("faster_whisper") is None:
        return {
            "ready": False,
            "engine": "faster-whisper",
            "sample_audio": str(sample_audio),
            "error": "faster-whisper is not installed.",
        }
    if provider in {"openai", "groq"} and importlib.util.find_spec("openai") is None:
        return {
            "ready": False,
            "engine": provider,
            "sample_audio": str(sample_audio),
            "error": "openai package is required for this STT provider.",
        }

    started = time.perf_counter()
    if provider == "docker":
        return {
            "ready": False,
            "engine": "removed-docker-stt",
            "latency_ms": _elapsed_ms(started),
            "sample_audio": str(sample_audio),
            "error": "Docker STT runtime has been removed from JARVIS Desktop.",
        }

    with _temporary_environ(env):
        from tools.transcription_tools import transcribe_audio

        payload = transcribe_audio(str(sample_audio))
    latency_ms = _elapsed_ms(started)
    transcript = str(payload.get("transcript") or "").strip()
    ready = bool(payload.get("success")) and bool(transcript)
    result = {
        "ready": ready,
        "engine": str(payload.get("provider") or _cfg(config, "stt", "provider", default="local") or "local"),
        "latency_ms": latency_ms,
        "transcript": transcript,
        "sample_audio": str(sample_audio),
    }
    if not ready:
        result["error"] = str(payload.get("error") or "STT did not produce a transcript.")
    return result


def _run_probe(component: str, callback: Callable[[], Mapping[str, Any]]) -> dict[str, Any]:
    started = time.perf_counter()
    try:
        result = dict(callback())
    except Exception as exc:
        return {
            "ready": False,
            "error": f"{type(exc).__name__}: {exc}",
            "latency_ms": _elapsed_ms(started),
        }

    result.setdefault("ready", not bool(result.get("error")))
    result.setdefault("latency_ms", _elapsed_ms(started))
    if not result.get("ready") and not result.get("error"):
        result["error"] = f"{component.upper()} smoke probe did not report ready."
    return result


def _blocking_issues(results: Mapping[str, Mapping[str, Any]]) -> list[dict[str, str]]:
    blockers = []
    for component, result in results.items():
        if not result.get("ready"):
            blockers.append({
                "component": component,
                "issue": str(result.get("error") or "not ready"),
            })
    return blockers


def run_runtime_smoke_test(
    config: Mapping[str, Any],
    *,
    env: Mapping[str, str] | None = None,
    output_dir: Path | str | None = None,
    sample_audio: Path | str | None = None,
    prompt: str = SMOKE_PROMPT,
    tts_text: str = SMOKE_TTS_TEXT,
    llm_probe: Probe = default_llm_probe,
    tts_probe: Probe = default_tts_probe,
    stt_probe: Probe = default_stt_probe,
) -> dict[str, Any]:
    """Run real runtime smoke checks for LLM, TTS, and STT."""
    env_map = dict(os.environ if env is None else env)
    out_dir = Path(output_dir) if output_dir is not None else Path(
        tempfile.mkdtemp(prefix="jarvis-runtime-smoke-")
    )
    out_dir.mkdir(parents=True, exist_ok=True)
    sample_path = Path(sample_audio) if sample_audio is not None else None

    llm = _run_probe("llm", lambda: llm_probe(config, env_map, prompt))
    tts = _run_probe("tts", lambda: tts_probe(config, env_map, tts_text, out_dir))

    if sample_path is None:
        audio_path = str(tts.get("audio_path") or "").strip()
        sample_path = Path(audio_path) if audio_path else None
    stt = _run_probe("stt", lambda: stt_probe(config, env_map, sample_path))

    results = {"llm": llm, "tts": tts, "stt": stt}
    blockers = _blocking_issues(results)
    payload = {
        "production_ready": not blockers,
        **results,
        "blocking_issues": blockers,
        "output_dir": str(out_dir),
    }
    json.dumps(payload)
    return payload
