"""Desktop-native agent chat runtime.

The Electron Home page must not depend on the POSIX PTY/TUI path for normal
assistant turns. Native Windows uses a PowerShell bridge for the embedded
terminal, so voice transcripts and plain language prompts need a direct agent
pipeline that can stream text deltas and update dashboard token stats.
"""

from __future__ import annotations

import json
import logging
import os
import time
import urllib.parse
import urllib.request
from contextlib import redirect_stderr, redirect_stdout
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Mapping, Optional

from utils import atomic_replace


DeltaCallback = Callable[[str], None]


@dataclass(frozen=True)
class DesktopChatResult:
    response: str
    input_tokens: int
    output_tokens: int
    model: str
    provider: str
    latency_ms: int

    def as_dict(self) -> dict[str, Any]:
        return {
            "response": self.response,
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "model": self.model,
            "provider": self.provider,
            "latency_ms": self.latency_ms,
        }


def _normalize_toolsets(toolsets: object = None) -> list[str] | None:
    if not toolsets:
        return None
    raw_items = [toolsets] if isinstance(toolsets, str) else toolsets
    if not isinstance(raw_items, (list, tuple)):
        raw_items = [raw_items]
    normalized: list[str] = []
    for item in raw_items:
        if isinstance(item, str):
            normalized.extend(part.strip() for part in item.split(","))
        else:
            normalized.append(str(item).strip())
    return [item for item in normalized if item] or None


def _create_session_db():
    try:
        from jarvis_state import SessionDB

        return SessionDB()
    except Exception as exc:
        logging.debug("SQLite session store not available for desktop chat: %s", exc)
        return None


def _read_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def _record_desktop_tokens(
    jarvis_home: Path,
    *,
    input_tokens: int,
    output_tokens: int,
    model: str,
    provider: str,
) -> None:
    """Persist current and lifetime desktop token counters for live stats."""
    jarvis_home.mkdir(parents=True, exist_ok=True)
    stats_path = jarvis_home / "stats.json"
    payload = _read_json(stats_path)
    previous_lifetime = 0
    for key in ("tokens_total_lifetime", "tokens_lifetime_total", "tokens_total"):
        try:
            previous_lifetime = int(payload.get(key) or 0)
            break
        except (TypeError, ValueError):
            continue

    turn_total = max(0, int(input_tokens or 0)) + max(0, int(output_tokens or 0))
    payload["tokens_total_lifetime"] = previous_lifetime + turn_total
    payload["desktop_current_tokens"] = {
        "input": max(0, int(input_tokens or 0)),
        "output": max(0, int(output_tokens or 0)),
        "total": turn_total,
        "model": model,
        "provider": provider,
        "updated_at": time.time(),
    }
    tmp_path = stats_path.with_suffix(".json.tmp")
    tmp_path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    atomic_replace(tmp_path, stats_path)


def _is_loopback_openai_endpoint(base_url: str) -> bool:
    try:
        parsed = urllib.parse.urlparse(base_url)
    except Exception:
        return False
    host = (parsed.hostname or "").lower()
    return parsed.scheme in {"http", "https"} and host in {
        "127.0.0.1",
        "localhost",
        "::1",
        "0.0.0.0",
    }


def _endpoint_has_models(base_url: str) -> bool:
    base = base_url.rstrip("/")
    probe = f"{base}/models" if base.endswith("/v1") else f"{base}/v1/models"
    try:
        with urllib.request.urlopen(probe, timeout=1.5) as response:
            return 200 <= response.status < 300
    except Exception:
        return False


def _desktop_local_runtime_from_config(
    cfg: Mapping[str, Any],
    target_model: str,
) -> tuple[dict[str, Any], str] | None:
    """Resolve the desktop chat runtime from the Models-page provider map.

    The inherited CLI runtime resolver only understands the legacy
    ``model.provider`` shape. The desktop app stores local backends under
    ``providers`` so the Models page can rank llama.cpp first, vLLM second,
    and Ollama last. Home chat must use that same map.
    """
    providers = cfg.get("providers")
    if not isinstance(providers, Mapping):
        return None

    def priority(name: str, provider: Mapping[str, Any]) -> tuple[int, str]:
        combined = f"{name} {provider.get('base_url') or provider.get('url') or ''}".lower()
        if "docker" in combined:
            return (90, name)
        if "llama" in combined or ":808" in combined:
            return (0, name)
        if "vllm" in combined or ":8000" in combined:
            return (1, name)
        if "ollama" in combined or ":11434" in combined:
            return (2, name)
        return (20, name)

    candidates: list[tuple[str, Mapping[str, Any]]] = []
    for name, value in providers.items():
        if not isinstance(value, Mapping):
            continue
        base_url = str(value.get("base_url") or value.get("url") or "").strip().rstrip("/")
        if not base_url or not _is_loopback_openai_endpoint(base_url):
            continue
        if "docker" in f"{name} {base_url}".lower():
            continue
        candidates.append((str(name), value))

    for name, provider in sorted(candidates, key=lambda item: priority(item[0], item[1])):
        base_url = str(provider.get("base_url") or provider.get("url") or "").strip().rstrip("/")
        model_name = str(provider.get("model") or target_model or "").strip()
        if not model_name:
            continue
        if not _endpoint_has_models(base_url):
            continue
        return (
            {
                "provider": "custom",
                "requested_provider": name,
                "api_mode": str(provider.get("api_mode") or "chat_completions"),
                "base_url": base_url,
                "api_key": str(provider.get("api_key") or "no-key-required"),
                "source": f"desktop-providers:{name}",
            },
            model_name,
        )
    return None


def run_desktop_chat_turn(
    prompt: str,
    *,
    jarvis_home: Path,
    on_delta: DeltaCallback | None = None,
    model: Optional[str] = None,
    provider: Optional[str] = None,
    toolsets: object = None,
) -> DesktopChatResult:
    """Run one desktop assistant turn and optionally stream text deltas."""
    clean_prompt = prompt.strip()
    if not clean_prompt:
        raise ValueError("Prompt is empty.")

    os.environ["JARVIS_YOLO_MODE"] = "1"
    os.environ["JARVIS_ACCEPT_HOOKS"] = "1"

    from jarvis_cli.config import load_config
    from jarvis_cli.models import detect_provider_for_model
    from jarvis_cli.runtime_provider import resolve_runtime_provider
    from jarvis_cli.tools_config import _get_platform_tools
    from run_agent import AIAgent

    cfg = load_config()
    model_cfg = cfg.get("model") or {}
    if isinstance(model_cfg, str):
        cfg_model = model_cfg
    else:
        cfg_model = model_cfg.get("default") or model_cfg.get("model") or ""

    env_model = os.getenv("JARVIS_INFERENCE_MODEL", "").strip()
    effective_model = (model or "").strip() or env_model or cfg_model
    effective_provider = (provider or "").strip() or None
    explicit_base_url_from_alias: Optional[str] = None

    if effective_provider is None and (model or env_model):
        explicit_model = (model or "").strip() or env_model
        try:
            from jarvis_cli import model_switch as _ms

            _ms._ensure_direct_aliases()
            direct = _ms.DIRECT_ALIASES.get(explicit_model.strip().lower())
        except Exception:
            direct = None
        if direct is not None:
            effective_model = direct.model
            effective_provider = direct.provider
            if direct.base_url:
                explicit_base_url_from_alias = direct.base_url.rstrip("/")
        else:
            cfg_provider = ""
            if isinstance(model_cfg, Mapping):
                cfg_provider = str(model_cfg.get("provider") or "").strip().lower()
            current_provider = (
                cfg_provider
                or os.getenv("JARVIS_INFERENCE_PROVIDER", "").strip().lower()
                or "auto"
            )
            detected = detect_provider_for_model(explicit_model, current_provider)
            if detected:
                effective_provider, effective_model = detected

    desktop_runtime = (
        None
        if effective_provider or explicit_base_url_from_alias
        else _desktop_local_runtime_from_config(cfg, effective_model)
    )
    if desktop_runtime is not None:
        runtime, effective_model = desktop_runtime
    else:
        runtime = resolve_runtime_provider(
            requested=effective_provider,
            target_model=effective_model or None,
            explicit_base_url=explicit_base_url_from_alias,
        )

    toolsets_list = _normalize_toolsets(toolsets)
    if toolsets_list is None:
        toolsets_list = sorted(_get_platform_tools(cfg, "desktop"))
        if not toolsets_list:
            toolsets_list = sorted(_get_platform_tools(cfg, "cli"))

    fallback = cfg.get("fallback_providers") or cfg.get("fallback_model") or []
    if isinstance(fallback, dict):
        fallback = [fallback] if fallback.get("provider") and fallback.get("model") else []

    agent = AIAgent(
        api_key=runtime.get("api_key"),
        base_url=runtime.get("base_url"),
        provider=runtime.get("provider"),
        api_mode=runtime.get("api_mode"),
        model=effective_model,
        enabled_toolsets=toolsets_list,
        quiet_mode=True,
        platform="desktop",
        session_db=_create_session_db(),
        credential_pool=runtime.get("credential_pool"),
        fallback_model=fallback or None,
        clarify_callback=lambda question, choices=None: (
            "[desktop mode: make the most reasonable assumption and continue.]"
        ),
    )
    agent.suppress_status_output = True
    agent.stream_delta_callback = None
    agent.tool_gen_callback = None

    started = time.perf_counter()
    with open(os.devnull, "w", encoding="utf-8") as devnull:
        with redirect_stdout(devnull), redirect_stderr(devnull):
            response = agent.chat(clean_prompt, stream_callback=on_delta) or ""
    latency_ms = int((time.perf_counter() - started) * 1000)

    input_tokens = int(getattr(agent, "session_input_tokens", 0) or 0)
    output_tokens = int(getattr(agent, "session_output_tokens", 0) or 0)
    model_name = str(getattr(agent, "model", None) or effective_model or "")
    provider_name = str(runtime.get("provider") or effective_provider or "")

    _record_desktop_tokens(
        jarvis_home,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        model=model_name,
        provider=provider_name,
    )
    return DesktopChatResult(
        response=response,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        model=model_name,
        provider=provider_name,
        latency_ms=latency_ms,
    )
