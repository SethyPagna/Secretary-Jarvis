"""Shared runtime state for the JARVIS manager and specialist souls."""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Mapping

from jarvis_cli.soul_registry import load_team_souls_manifest
from jarvis_cli.utils import atomic_replace


TEAM_STATE_VERSION = 1


def team_state_path(jarvis_home: Path) -> Path:
    return jarvis_home / "team" / "state.json"


def load_team_activity(jarvis_home: Path) -> dict[str, Any]:
    try:
        payload = json.loads(team_state_path(jarvis_home).read_text(encoding="utf-8"))
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def record_team_activity(
    jarvis_home: Path,
    *,
    active_soul: str,
    surface: str,
    prompt: str = "",
    delegate_souls: list[str] | tuple[str, ...] | None = None,
    model: str = "",
    provider: str = "",
    session_id: str = "",
    workflow_id: str = "",
    platform: str = "",
) -> dict[str, Any]:
    """Persist the latest JARVIS team route for dashboard-wide status."""
    manifest = load_team_souls_manifest()
    now = time.time()
    active = _normalize_id(active_soul) or str(manifest.get("primary") or "jarvis")
    previous = load_team_activity(jarvis_home)
    previous_souls = previous.get("souls") if isinstance(previous.get("souls"), dict) else {}
    souls: dict[str, dict[str, Any]] = {}

    for soul in manifest.get("souls", []):
        if not isinstance(soul, Mapping):
            continue
        soul_id = _normalize_id(soul.get("id"))
        if not soul_id:
            continue
        prior = previous_souls.get(soul_id) if isinstance(previous_souls, dict) else {}
        ready = _template_ready(soul)
        last_active_at = prior.get("last_active_at") if isinstance(prior, Mapping) else None
        last_surface = prior.get("last_surface") if isinstance(prior, Mapping) else None
        if soul_id == active:
            last_active_at = now
            last_surface = surface
        souls[soul_id] = {
            "id": soul_id,
            "ready": ready,
            "online": ready,
            "last_active_at": last_active_at,
            "last_surface": last_surface,
        }

    delegates = [_normalize_id(item) for item in (delegate_souls or [])]
    delegates = [item for item in delegates if item and item != active]
    payload = {
        "version": TEAM_STATE_VERSION,
        "updated_at": now,
        "primary": manifest.get("primary", "jarvis"),
        "active_soul": active,
        "delegate_souls": delegates[:12],
        "surface": str(surface or "").strip().lower(),
        "prompt_preview": _preview(prompt),
        "model": str(model or ""),
        "provider": str(provider or ""),
        "session_id": str(session_id or ""),
        "workflow_id": str(workflow_id or ""),
        "platform": str(platform or ""),
        "souls": souls,
    }
    path = team_state_path(jarvis_home)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    atomic_replace(tmp, path)
    return payload


def enrich_team_souls_manifest(
    jarvis_home: Path,
    manifest: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Return the manifest plus live status fields consumed by the desktop UI."""
    source = dict(manifest or load_team_souls_manifest())
    activity = load_team_activity(jarvis_home)
    activity_souls = activity.get("souls") if isinstance(activity.get("souls"), dict) else {}
    active_soul = _normalize_id(activity.get("active_soul")) or str(source.get("primary") or "jarvis")
    enriched_souls: list[dict[str, Any]] = []

    for soul in source.get("souls", []):
        if not isinstance(soul, Mapping):
            continue
        soul_id = _normalize_id(soul.get("id"))
        if not soul_id:
            continue
        runtime = activity_souls.get(soul_id) if isinstance(activity_souls, dict) else {}
        ready = _template_ready(soul)
        online = bool(runtime.get("online")) if isinstance(runtime, Mapping) else ready
        enriched_souls.append(
            {
                **dict(soul),
                "id": soul_id,
                "ready": ready,
                "online": online and ready,
                "active": soul_id == active_soul,
                "last_active_at": runtime.get("last_active_at") if isinstance(runtime, Mapping) else None,
                "last_surface": runtime.get("last_surface") if isinstance(runtime, Mapping) else None,
            }
        )

    return {
        "primary": source.get("primary", "jarvis"),
        "active_soul": active_soul,
        "delegate_souls": [
            item
            for item in (_normalize_id(value) for value in activity.get("delegate_souls", []))
            if item
        ][:12],
        "last_route": {
            "active_soul": active_soul,
            "surface": activity.get("surface") or "",
            "prompt_preview": activity.get("prompt_preview") or "",
            "model": activity.get("model") or "",
            "provider": activity.get("provider") or "",
            "session_id": activity.get("session_id") or "",
            "workflow_id": activity.get("workflow_id") or "",
            "platform": activity.get("platform") or "",
            "updated_at": activity.get("updated_at") or None,
        },
        "souls": enriched_souls,
    }


def _normalize_id(value: object) -> str:
    return str(value or "").strip().lower()


def _preview(text: str, limit: int = 160) -> str:
    compact = " ".join(str(text or "").split())
    if len(compact) <= limit:
        return compact
    return compact[: limit - 1].rstrip() + "..."


def _template_ready(soul: Mapping[str, Any]) -> bool:
    template = str(soul.get("template") or "")
    if not template:
        return False
    return any(path.exists() for path in _candidate_template_paths(template))


def _candidate_template_paths(template: str) -> tuple[Path, ...]:
    candidate = Path(template)
    if candidate.is_absolute():
        return (candidate,)
    module_dir = Path(__file__).resolve().parent
    repo_root = module_dir.parents[1]
    return (
        repo_root / template,
        module_dir / "data" / "souls" / candidate.name,
    )
