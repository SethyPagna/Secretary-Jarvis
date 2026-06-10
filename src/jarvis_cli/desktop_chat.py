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
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from contextlib import redirect_stderr, redirect_stdout
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Mapping, Optional
from uuid import uuid4

from jarvis_cli.utils import atomic_replace


DeltaCallback = Callable[[str], None]


_TOOL_INTENT_RE = re.compile(
    r"\b("
    r"attach|attached|browser|browse|click|crawl|download|email|file|folder|gateway|"
    r"open|read|remind|run|schedule|search|send|shell|skill|telegram|terminal|tool|"
    r"update|upload|web|whatsapp|workflow|write"
    r")\b",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class DesktopChatResult:
    response: str
    input_tokens: int
    output_tokens: int
    model: str
    provider: str
    latency_ms: int
    active_soul: str
    delegate_souls: list[str]

    def as_dict(self) -> dict[str, Any]:
        return {
            "response": self.response,
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "model": self.model,
            "provider": self.provider,
            "latency_ms": self.latency_ms,
            "active_soul": self.active_soul,
            "delegate_souls": self.delegate_souls,
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


def _desktop_prompt_needs_tools(prompt: str) -> bool:
    """Return True when a natural desktop turn needs the agent tool layer.

    Always loading every desktop toolset makes short voice turns slow because
    the model receives a large tool schema and extra system guidance even for
    "can you hear me?" style dialogue.  The dedicated UI buttons still call
    their direct endpoints; this gate only keeps plain chat lean until the
    user's words ask for action.
    """
    return bool(_TOOL_INTENT_RE.search(prompt or ""))


def _desktop_tool_policy() -> str:
    raw = os.getenv("JARVIS_DESKTOP_AUTO_TOOLS", "smart").strip().lower()
    return raw if raw in {"smart", "always", "off"} else "smart"


def _is_local_qwen_runtime(runtime: Mapping[str, Any], model: str) -> bool:
    base_url = str(runtime.get("base_url") or "")
    provider_name = str(runtime.get("provider") or runtime.get("requested_provider") or "").lower()
    return (
        "qwen" in str(model or "").lower()
        and _is_loopback_openai_endpoint(base_url)
        and ("llama" in provider_name or "custom" in provider_name or ":808" in base_url)
    )


def _desktop_request_overrides(runtime: Mapping[str, Any], model: str) -> dict[str, Any]:
    """Provider request hints for fast desktop conversation turns."""
    if not _is_local_qwen_runtime(runtime, model):
        return {}
    return {
        "extra_body": {
            "chat_template_kwargs": {"enable_thinking": False},
            "reasoning": {"enabled": False},
            "include_reasoning": False,
        }
    }


def _desktop_model_prompt(prompt: str, runtime: Mapping[str, Any], model: str) -> str:
    """Add model-native speed controls without changing persisted user text."""
    if _is_local_qwen_runtime(runtime, model):
        stripped = prompt.strip()
        if not stripped.lower().startswith("/no_think"):
            return f"/no_think\n{stripped}"
    return prompt


def _direct_desktop_chat_available(runtime: Mapping[str, Any], toolsets: list[str], model: str) -> bool:
    """Use the fast direct path only for local no-tool desktop turns."""
    return (
        not toolsets
        and bool(model)
        and _is_loopback_openai_endpoint(str(runtime.get("base_url") or ""))
        and str(runtime.get("api_mode") or "chat_completions") == "chat_completions"
    )


def _direct_desktop_chat_payload(
    *,
    model: str,
    prompt: str,
    system_prompt: str,
    runtime: Mapping[str, Any],
    stream: bool,
    max_tokens: int,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": _desktop_model_prompt(prompt, runtime, model)},
        ],
        "temperature": 0,
        "max_tokens": max_tokens,
        "stream": stream,
    }
    if _is_local_qwen_runtime(runtime, model):
        payload["chat_template_kwargs"] = {"enable_thinking": False}
    return payload


def _run_direct_desktop_chat(
    *,
    prompt: str,
    runtime: Mapping[str, Any],
    model: str,
    system_prompt: str,
    on_delta: DeltaCallback | None,
    max_tokens: int,
) -> tuple[str, int, int]:
    """Stream a local OpenAI-compatible no-tool turn without AIAgent overhead."""
    url = _chat_completions_url(str(runtime.get("base_url") or ""))
    api_key = str(runtime.get("api_key") or "")
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    payload = _direct_desktop_chat_payload(
        model=model,
        prompt=prompt,
        system_prompt=system_prompt,
        runtime=runtime,
        stream=bool(on_delta),
        max_tokens=max_tokens,
    )
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    timeout = float(os.getenv("JARVIS_DESKTOP_DIRECT_TIMEOUT_SECONDS", "45") or "45")
    pieces: list[str] = []
    usage: Mapping[str, Any] = {}
    with urllib.request.urlopen(request, timeout=timeout) as response:
        if payload["stream"]:
            for raw_line in response:
                line = raw_line.decode("utf-8", errors="replace").strip()
                if not line or not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                try:
                    event = json.loads(data)
                except json.JSONDecodeError:
                    continue
                choices = event.get("choices") or []
                if not choices:
                    continue
                delta = choices[0].get("delta") or {}
                text = str(delta.get("content") or "")
                if text:
                    pieces.append(text)
                    if on_delta:
                        on_delta(text)
                if isinstance(event.get("usage"), Mapping):
                    usage = event["usage"]
        else:
            body = json.loads(response.read().decode("utf-8", errors="replace"))
            choices = body.get("choices") or []
            if choices:
                message = choices[0].get("message") or {}
                text = str(message.get("content") or "")
                pieces.append(text)
                if text and on_delta:
                    on_delta(text)
            if isinstance(body.get("usage"), Mapping):
                usage = body["usage"]
    response_text = "".join(pieces).strip()
    input_tokens = int(usage.get("prompt_tokens") or 0) if usage else 0
    output_tokens = int(usage.get("completion_tokens") or 0) if usage else 0
    return response_text, input_tokens, output_tokens


def _create_session_db():
    try:
        from jarvis_cli.session_state import SessionDB

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
    active_soul: str = "jarvis",
    delegate_souls: list[str] | None = None,
    surface: str = "desktop",
    platform: str = "",
    session_key: str = "",
    user_id: str = "local-user",
) -> None:
    """Persist current and lifetime desktop token counters for live stats."""
    try:
        jarvis_home.mkdir(parents=True, exist_ok=True)
        probe = jarvis_home / ".write-probe"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink(missing_ok=True)
        stats_path = jarvis_home / "stats.json"
    except Exception:
        return
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
        "active_soul": active_soul,
        "delegate_souls": list(delegate_souls or []),
        "surface": surface,
        "platform": platform,
        "session_key": session_key,
        "user_id": user_id or "local-user",
        "updated_at": time.time(),
    }
    tmp_path = stats_path.with_suffix(".json.tmp")
    tmp_path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    atomic_replace(tmp_path, stats_path)


def _desktop_session_state_path(jarvis_home: Path) -> Path:
    return jarvis_home / "desktop" / "session.json"


def _surface_session_state_path(
    jarvis_home: Path,
    *,
    surface: str = "desktop",
    platform: str = "",
    session_key: str = "",
) -> Path:
    source = _normalize_session_segment(platform or surface or "desktop")
    if source == "desktop" and not session_key:
        return _desktop_session_state_path(jarvis_home)
    key = _normalize_session_segment(session_key or source)
    return jarvis_home / "gateway" / "sessions" / source / f"{key}.json"


def _normalize_session_segment(value: str) -> str:
    normalized = "".join(
        char.lower() if char.isalnum() else "-"
        for char in str(value or "").strip()
    ).strip("-")
    return normalized[:80] or "default"


def _get_or_create_desktop_session_id(
    jarvis_home: Path,
    *,
    model: str,
    provider: str,
    active_soul: str,
    delegate_souls: list[str] | None = None,
    surface: str = "desktop",
    platform: str = "",
    session_key: str = "",
) -> str:
    """Return the current desktop conversation id, creating it if needed.

    The desktop app is a long-lived conversational surface. Keeping a rolling
    session makes voice, typed chat, memory search, and analytics agree on the
    same transcript instead of scattering every utterance into a new row.
    """
    state_path = _surface_session_state_path(
        jarvis_home,
        surface=surface,
        platform=platform,
        session_key=session_key,
    )
    source = _normalize_session_segment(platform or surface or "desktop")
    now = time.time()
    payload = _read_json(state_path)
    session_id = str(payload.get("session_id") or "").strip()
    started_at = 0.0
    try:
        started_at = float(payload.get("started_at") or 0)
    except (TypeError, ValueError):
        started_at = 0.0
    max_age_seconds = int(os.getenv("JARVIS_DESKTOP_SESSION_MAX_AGE_SECONDS", "43200") or "43200")
    if not session_id or (started_at and now - started_at > max_age_seconds):
        session_id = f"{source}-{time.strftime('%Y%m%d-%H%M%S')}-{uuid4().hex[:8]}"
        payload = {"session_id": session_id, "started_at": now}

    payload.update(
        {
            "updated_at": now,
            "surface": surface,
            "platform": platform,
            "session_key": session_key,
            "model": model,
            "provider": provider,
            "active_soul": active_soul,
            "delegate_souls": list(delegate_souls or []),
        }
    )
    try:
        state_path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = state_path.with_suffix(".json.tmp")
        tmp_path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
        atomic_replace(tmp_path, state_path)
    except Exception as exc:
        logging.debug("Desktop session state write failed: %s", exc)
    return session_id


def _record_desktop_session_turn(
    jarvis_home: Path,
    *,
    prompt: str,
    response: str,
    input_tokens: int,
    output_tokens: int,
    model: str,
    provider: str,
    active_soul: str,
    delegate_souls: list[str] | None = None,
    surface: str = "desktop",
    platform: str = "",
    session_key: str = "",
    user_id: str = "local-user",
) -> str | None:
    """Persist a desktop/voice turn to the shared SQLite session store."""
    db = _create_session_db()
    if db is None:
        return None
    session_id = _get_or_create_desktop_session_id(
        jarvis_home,
        model=model,
        provider=provider,
        active_soul=active_soul,
        delegate_souls=delegate_souls,
        surface=surface,
        platform=platform,
        session_key=session_key,
    )
    source = _normalize_session_segment(platform or surface or "desktop")
    model_config = {
        "provider": provider,
        "model": model,
        "surface": surface,
        "platform": platform,
        "session_key": session_key,
        "active_soul": active_soul,
        "delegate_souls": list(delegate_souls or []),
    }
    try:
        db.create_session(
            session_id,
            source,
            model=model,
            model_config=model_config,
            user_id=user_id or "local-user",
        )
        db.append_message(
            session_id,
            "user",
            prompt,
            token_count=max(0, int(input_tokens or 0)),
        )
        db.append_message(
            session_id,
            "assistant",
            response,
            token_count=max(0, int(output_tokens or 0)),
        )
        db.update_token_counts(
            session_id,
            input_tokens=max(0, int(input_tokens or 0)),
            output_tokens=max(0, int(output_tokens or 0)),
            model=model,
            billing_provider=provider,
            billing_mode="desktop",
            api_call_count=1,
        )
        return session_id
    except Exception as exc:
        logging.debug("Desktop session persistence failed: %s", exc)
        return None
    finally:
        try:
            db.close()
        except Exception:
            pass


def _estimated_tokens(text: str) -> int:
    """Conservative visible-text token estimate when a local server omits usage."""
    stripped = (text or "").strip()
    if not stripped:
        return 0
    return max(1, int(len(stripped) / 4))


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


def _chat_completions_url(base_url: str) -> str:
    base = base_url.rstrip("/")
    return f"{base}/chat/completions" if base.endswith("/v1") else f"{base}/v1/chat/completions"


def _endpoint_has_chat_completions(base_url: str, model: str) -> bool:
    """Return True only when a local OpenAI-style endpoint can answer chat.

    `/models` alone is not enough: stale helpers and unrelated web servers can
    expose or fake model-list routes while `/chat/completions` returns 404.
    Desktop voice/chat must verify the route users actually need.
    """
    if not base_url or not model:
        return False
    payload = json.dumps(
        {
            "model": model,
            "messages": [{"role": "user", "content": "ping"}],
            "max_tokens": 1,
            "temperature": 0,
            "stream": False,
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        _chat_completions_url(base_url),
        data=payload,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=4.0) as response:
            return 200 <= response.status < 300
    except urllib.error.HTTPError as exc:
        # 400/401/422 still prove the chat route exists. 404/405 means the
        # selected endpoint is not a usable chat-completions server.
        return exc.code not in {404, 405}
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
        if not _endpoint_has_models(base_url) or not _endpoint_has_chat_completions(base_url, model_name):
            try:
                from jarvis_cli.local_runtime import start_local_runtime

                started = start_local_runtime(timeout_seconds=90.0)
                started_endpoint = str(started.get("endpoint") or "").strip().rstrip("/")
                if started.get("ok") and started_endpoint:
                    base_url = started_endpoint
                    plan_llm = (started.get("plan") or {}).get("llm")
                    if isinstance(plan_llm, Mapping) and plan_llm.get("model"):
                        model_name = str(plan_llm.get("model") or model_name)
            except Exception:
                pass
        if not _endpoint_has_models(base_url) or not _endpoint_has_chat_completions(base_url, model_name):
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


def _desktop_cloud_runtime_from_env() -> tuple[dict[str, Any], str] | None:
    """Return a verified API-key fallback when local llama.cpp/vLLM is offline.

    The desktop app should not dead-end just because the local GGUF server is
    missing or still loading. Mistral is OpenAI-compatible and the Settings
    diagnostics already verify the key with /v1/models, so it is the safest
    fast fallback for this package when present.
    """
    try:
        from jarvis_cli.config import load_env

        env = {**os.environ, **load_env()}
    except Exception:
        env = dict(os.environ)
    mistral_key = str(env.get("MISTRAL_API_KEY") or "").strip()
    if mistral_key:
        return (
            {
                "provider": "custom",
                "requested_provider": "mistral_api",
                "api_mode": "chat_completions",
                "base_url": "https://api.mistral.ai/v1",
                "api_key": mistral_key,
                "source": "desktop-fallback:mistral",
            },
            str(env.get("MISTRAL_MODEL") or "mistral-small-latest"),
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
    soul: Optional[str] = None,
    surface: str = "desktop",
    platform: str = "",
    session_key: str = "",
    user_id: str = "local-user",
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
    from jarvis_cli.soul_registry import (
        build_soul_system_context,
        classify_prompt_soul,
        team_souls_by_id,
    )
    from jarvis_cli.tools_config import _get_platform_tools
    from agent.runtime import AIAgent

    cfg = load_config()
    selected_soul = classify_prompt_soul(clean_prompt)
    if soul:
        by_id = team_souls_by_id()
        selected_soul = by_id.get(str(soul).strip().lower(), selected_soul)
    team_context = build_soul_system_context(selected_soul)
    active_soul = str(selected_soul.get("id") or "jarvis").lower()
    delegate_souls = [
        str(item)
        for item in selected_soul.get("delegates", [])
        if str(item).strip() and str(item).strip().lower() != active_soul
    ][:12]
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
        cloud_runtime = (
            None
            if effective_provider or explicit_base_url_from_alias
            else _desktop_cloud_runtime_from_env()
        )
        if cloud_runtime is not None:
            runtime, effective_model = cloud_runtime
        else:
            runtime = resolve_runtime_provider(
                requested=effective_provider,
                target_model=effective_model or None,
                explicit_base_url=explicit_base_url_from_alias,
            )
            base_url = str(runtime.get("base_url") or "")
            if (
                _is_loopback_openai_endpoint(base_url)
                and not _endpoint_has_chat_completions(base_url, effective_model)
            ):
                cloud_runtime = _desktop_cloud_runtime_from_env()
                if cloud_runtime is not None:
                    runtime, effective_model = cloud_runtime

    toolsets_list = _normalize_toolsets(toolsets)
    if toolsets_list is None:
        tool_policy = _desktop_tool_policy()
        if tool_policy == "off" or (
            tool_policy == "smart" and not _desktop_prompt_needs_tools(clean_prompt)
        ):
            toolsets_list = []
        else:
            toolsets_list = sorted(_get_platform_tools(cfg, "desktop"))
            if not toolsets_list:
                toolsets_list = sorted(_get_platform_tools(cfg, "cli"))

    fallback = cfg.get("fallback_providers") or cfg.get("fallback_model") or []
    if isinstance(fallback, dict):
        fallback = [fallback] if fallback.get("provider") and fallback.get("model") else []

    desktop_max_tokens = int(os.getenv("JARVIS_DESKTOP_MAX_TOKENS", "512") or "512")
    desktop_system_prompt = (
        team_context
        + "\n\n"
        "Desktop voice/chat contract: answer the user's latest words directly. "
        "Do not repeat the transcript, do not expose routing mechanics, and keep short voice replies natural."
    )

    if _direct_desktop_chat_available(runtime, toolsets_list, effective_model):
        started = time.perf_counter()
        try:
            response, input_tokens, output_tokens = _run_direct_desktop_chat(
                prompt=clean_prompt,
                runtime=runtime,
                model=effective_model,
                system_prompt=desktop_system_prompt,
                on_delta=on_delta,
                max_tokens=desktop_max_tokens,
            )
            latency_ms = int((time.perf_counter() - started) * 1000)
            if input_tokens <= 0:
                input_tokens = _estimated_tokens(clean_prompt) + _estimated_tokens(desktop_system_prompt)
            if output_tokens <= 0:
                output_tokens = _estimated_tokens(response)
            provider_name = str(runtime.get("provider") or effective_provider or "")
            _record_desktop_tokens(
                jarvis_home,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                model=effective_model,
                provider=provider_name,
                active_soul=active_soul,
                delegate_souls=delegate_souls,
                surface=surface,
                platform=platform,
                session_key=session_key,
                user_id=user_id,
            )
            session_id = _record_desktop_session_turn(
                jarvis_home,
                prompt=clean_prompt,
                response=response,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                model=effective_model,
                provider=provider_name,
                active_soul=active_soul,
                delegate_souls=delegate_souls,
                surface=surface,
                platform=platform,
                session_key=session_key,
                user_id=user_id,
            )
            try:
                from jarvis_cli.team_runtime import record_team_activity

                record_team_activity(
                    jarvis_home,
                    active_soul=active_soul,
                    surface=surface,
                    prompt=clean_prompt,
                    delegate_souls=delegate_souls,
                    model=effective_model,
                    provider=provider_name,
                    session_id=session_id or "",
                    platform=platform,
                )
            except Exception as exc:
                logging.debug("Desktop team activity persistence failed: %s", exc)
            return DesktopChatResult(
                response=response,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                model=effective_model,
                provider=provider_name,
                latency_ms=latency_ms,
                active_soul=active_soul,
                delegate_souls=delegate_souls,
            )
        except Exception as exc:
            logging.debug("Direct desktop chat failed; falling back to AIAgent: %s", exc)

    agent = AIAgent(
        api_key=runtime.get("api_key"),
        base_url=runtime.get("base_url"),
        provider=runtime.get("provider"),
        api_mode=runtime.get("api_mode"),
        model=effective_model,
        max_tokens=desktop_max_tokens,
        max_iterations=int(os.getenv("JARVIS_DESKTOP_MAX_ITERATIONS", "8") or "8"),
        tool_delay=float(os.getenv("JARVIS_DESKTOP_TOOL_DELAY_SECONDS", "0") or "0"),
        enabled_toolsets=toolsets_list,
        quiet_mode=True,
        ephemeral_system_prompt=desktop_system_prompt,
        platform="desktop",
        skip_context_files=(
            os.getenv("JARVIS_DESKTOP_SKIP_CONTEXT_FILES", "1").strip().lower()
            not in {"0", "false", "no", "off"}
        ),
        load_soul_identity=(
            os.getenv("JARVIS_DESKTOP_LOAD_SOUL_IDENTITY", "0").strip().lower()
            in {"1", "true", "yes", "on"}
        ),
        session_db=_create_session_db(),
        credential_pool=runtime.get("credential_pool"),
        fallback_model=fallback or None,
        reasoning_config={"enabled": False} if _is_local_qwen_runtime(runtime, effective_model) else None,
        request_overrides=_desktop_request_overrides(runtime, effective_model),
        clarify_callback=lambda question, choices=None: (
            "[desktop mode: make the most reasonable assumption and continue.]"
        ),
    )
    agent.suppress_status_output = True
    agent.stream_delta_callback = None
    agent.tool_gen_callback = None

    started = time.perf_counter()
    model_prompt = _desktop_model_prompt(clean_prompt, runtime, effective_model)
    with open(os.devnull, "w", encoding="utf-8") as devnull:
        with redirect_stdout(devnull), redirect_stderr(devnull):
            response = agent.chat(model_prompt, stream_callback=on_delta) or ""
    latency_ms = int((time.perf_counter() - started) * 1000)

    input_tokens = int(getattr(agent, "session_input_tokens", 0) or 0)
    output_tokens = int(getattr(agent, "session_output_tokens", 0) or 0)
    if input_tokens <= 0:
        input_tokens = _estimated_tokens(clean_prompt)
    if output_tokens <= 0:
        output_tokens = _estimated_tokens(response)
    model_name = str(getattr(agent, "model", None) or effective_model or "")
    provider_name = str(runtime.get("provider") or effective_provider or "")

    _record_desktop_tokens(
        jarvis_home,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        model=model_name,
        provider=provider_name,
        active_soul=active_soul,
        delegate_souls=delegate_souls,
        surface=surface,
        platform=platform,
        session_key=session_key,
        user_id=user_id,
    )
    session_id = _record_desktop_session_turn(
        jarvis_home,
        prompt=clean_prompt,
        response=response,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        model=model_name,
        provider=provider_name,
        active_soul=active_soul,
        delegate_souls=delegate_souls,
        surface=surface,
        platform=platform,
        session_key=session_key,
        user_id=user_id,
    )
    try:
        from jarvis_cli.team_runtime import record_team_activity

        record_team_activity(
            jarvis_home,
            active_soul=active_soul,
            surface=surface,
            prompt=clean_prompt,
            delegate_souls=delegate_souls,
            model=model_name,
            provider=provider_name,
            session_id=session_id or "",
            platform=platform,
        )
    except Exception as exc:
        logging.debug("Desktop team activity persistence failed: %s", exc)
    return DesktopChatResult(
        response=response,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        model=model_name,
        provider=provider_name,
        latency_ms=latency_ms,
        active_soul=active_soul,
        delegate_souls=delegate_souls,
    )
