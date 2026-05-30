"""Graceful shutdown helpers for the JARVIS desktop backend."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterable


CleanupCallback = tuple[str, Callable[[], Any]]


def _utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _safe_session_id(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", value.strip()).strip("-")
    return cleaned[:96] or "shutdown"


def _default_session_id(timestamp: str) -> str:
    return _safe_session_id(f"shutdown-{timestamp.replace(':', '').replace('.', '-')}")


def _default_cleanup_callbacks() -> list[CleanupCallback]:
    callbacks: list[CleanupCallback] = []

    def _mcp_shutdown():
        from tools.mcp_tool import shutdown_mcp_servers

        shutdown_mcp_servers()
        return {"closed": True}

    def _lsp_shutdown():
        from agent.lsp import shutdown_service

        shutdown_service()
        return {"closed": True}

    def _auxiliary_shutdown():
        from agent.auxiliary_client import shutdown_cached_clients

        shutdown_cached_clients()
        return {"closed": True}

    def _local_runtime_shutdown():
        from jarvis_cli.local_runtime import stop_local_runtime

        return stop_local_runtime()

    callbacks.extend(
        [
            ("local-runtime", _local_runtime_shutdown),
            ("mcp-servers", _mcp_shutdown),
            ("lsp-service", _lsp_shutdown),
            ("auxiliary-clients", _auxiliary_shutdown),
        ]
    )
    return callbacks


def _run_cleanup_callbacks(callbacks: Iterable[CleanupCallback]) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for name, callback in callbacks:
        try:
            detail = callback()
            results.append({"name": name, "ok": True, "detail": detail})
        except Exception as exc:
            results.append({"name": name, "ok": False, "error": str(exc)})
    return results


def perform_graceful_shutdown(
    jarvis_home: Path | str,
    *,
    session_id: str | None = None,
    now: Callable[[], str] | None = None,
    cleanup_callbacks: Iterable[CleanupCallback] | None = None,
) -> dict[str, Any]:
    """Persist a shutdown snapshot and run best-effort backend cleanup."""
    home = Path(jarvis_home)
    timestamp = now() if now else _utc_timestamp()
    session_id = _safe_session_id(session_id) if session_id else _default_session_id(timestamp)

    sessions_dir = home / "sessions"
    for directory in (
        sessions_dir,
        home / "memories",
        home / "skills",
        home / "workflows",
        home / "logs",
        home / "gateway",
    ):
        directory.mkdir(parents=True, exist_ok=True)

    cleanup = _run_cleanup_callbacks(
        _default_cleanup_callbacks() if cleanup_callbacks is None else cleanup_callbacks
    )

    payload = {
        "status": "saved",
        "session_id": session_id,
        "shutdown_at": timestamp,
        "cleanup": cleanup,
    }
    session_path = sessions_dir / f"{session_id}.shutdown.json"
    session_path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")

    clean_marker = home / ".clean_shutdown"
    clean_marker.write_text(timestamp + "\n", encoding="utf-8")

    return {
        "status": "saved",
        "session_id": session_id,
        "shutdown_at": timestamp,
        "saved_paths": [str(session_path), str(clean_marker)],
        "cleanup": cleanup,
    }
