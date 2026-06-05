"""Persistent desktop workflow canvas storage and dry-run execution."""

from __future__ import annotations

from dataclasses import dataclass
import json
import logging
import re
import time
from pathlib import Path
from typing import Any, Mapping

from jarvis_cli.soul_registry import classify_prompt_soul


WORKFLOW_SCHEMA_VERSION = 1
DEFAULT_WORKFLOW_ID = "desktop-canvas"
_WORKFLOW_ID_RE = re.compile(r"[^a-zA-Z0-9_.-]+")
_LOG = logging.getLogger(__name__)


@dataclass(frozen=True)
class WorkflowCanvasRun:
    workflow_id: str
    active_soul: dict[str, Any]
    team_state: dict[str, Any]
    executed_nodes: list[dict[str, str]]
    message: str


def workflow_root(jarvis_home: Path) -> Path:
    return jarvis_home / "workflows"


def workflow_path(jarvis_home: Path, workflow_id: str = DEFAULT_WORKFLOW_ID) -> Path:
    return workflow_root(jarvis_home) / f"{normalize_workflow_id(workflow_id)}.json"


def normalize_workflow_id(workflow_id: str) -> str:
    normalized = _WORKFLOW_ID_RE.sub("-", (workflow_id or DEFAULT_WORKFLOW_ID).strip()).strip(".-")
    return normalized or DEFAULT_WORKFLOW_ID


def default_canvas() -> dict[str, Any]:
    now = time.time()
    return {
        "id": DEFAULT_WORKFLOW_ID,
        "schema_version": WORKFLOW_SCHEMA_VERSION,
        "nodes": [
            {
                "id": "trigger",
                "label": "Trigger",
                "title": "Voice, chat, WhatsApp, Telegram, schedule",
                "tone": "cyan",
            },
            {
                "id": "router",
                "label": "JARVIS Router",
                "title": "Chooses model, soul, memory, and tools",
                "tone": "violet",
            },
            {
                "id": "decision",
                "label": "Decision",
                "title": "Approvals, branches, retries, safety",
                "tone": "emerald",
            },
            {
                "id": "output",
                "label": "Output",
                "title": "Voice, text, files, platform replies",
                "tone": "amber",
            },
        ],
        "selectedNodeId": "router",
        "zoom": 1,
        "updated_at": now,
        "last_run": None,
    }


def load_workflow_canvas(jarvis_home: Path, workflow_id: str = DEFAULT_WORKFLOW_ID) -> dict[str, Any]:
    path = workflow_path(jarvis_home, workflow_id)
    if not path.exists():
        canvas = default_canvas()
        canvas["id"] = normalize_workflow_id(workflow_id)
        return canvas

    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        canvas = default_canvas()
        canvas["id"] = normalize_workflow_id(workflow_id)
        return canvas

    return normalize_canvas(raw, normalize_workflow_id(workflow_id))


def save_workflow_canvas(
    jarvis_home: Path,
    workflow_id: str,
    canvas: Mapping[str, Any],
) -> dict[str, Any]:
    normalized_id = normalize_workflow_id(workflow_id)
    normalized = normalize_canvas(canvas, normalized_id)
    normalized["updated_at"] = time.time()
    path = workflow_path(jarvis_home, normalized_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(normalized, indent=2, sort_keys=True), encoding="utf-8")
    tmp.replace(path)
    return normalized


def run_workflow_canvas(
    jarvis_home: Path,
    workflow_id: str = DEFAULT_WORKFLOW_ID,
    canvas: Mapping[str, Any] | None = None,
) -> WorkflowCanvasRun:
    active_canvas = normalize_canvas(canvas or load_workflow_canvas(jarvis_home, workflow_id), workflow_id)
    nodes = list(active_canvas.get("nodes") or [])
    task_text = " ".join(
        f"{node.get('label', '')} {node.get('title', '')}"
        for node in nodes
        if isinstance(node, Mapping)
    )
    soul = classify_prompt_soul(task_text)
    executed_nodes = []
    for node in nodes:
        if not isinstance(node, Mapping):
            continue
        label = str(node.get("label") or "Node")
        executed_nodes.append(
            {
                "id": str(node.get("id") or ""),
                "label": label,
                "status": _workflow_node_status(label),
            }
        )
    message = (
        f"Workflow '{normalize_workflow_id(workflow_id)}' ran "
        f"{len(executed_nodes)} nodes through {soul['name']}."
    )
    team_state: dict[str, Any] = {}
    try:
        from jarvis_cli.team_runtime import record_team_activity

        team_state = record_team_activity(
            jarvis_home,
            active_soul=str(soul.get("id") or "jarvis"),
            surface="workflow",
            prompt=task_text,
            delegate_souls=[
                str(item)
                for item in soul.get("delegates", [])
                if str(item).strip()
            ],
            workflow_id=normalize_workflow_id(workflow_id),
        )
    except Exception as exc:
        _LOG.debug("Workflow team activity persistence failed: %s", exc)
    return WorkflowCanvasRun(
        workflow_id=normalize_workflow_id(workflow_id),
        active_soul=soul,
        team_state=team_state,
        executed_nodes=executed_nodes,
        message=message,
    )


def record_workflow_run(
    jarvis_home: Path,
    workflow_id: str,
    canvas: Mapping[str, Any],
    run: WorkflowCanvasRun,
) -> dict[str, Any]:
    next_canvas = normalize_canvas(canvas, workflow_id)
    next_canvas["last_run"] = {
        "active_soul": run.active_soul,
        "executed_nodes": run.executed_nodes,
        "message": run.message,
        "ran_at": time.time(),
    }
    return save_workflow_canvas(jarvis_home, workflow_id, next_canvas)


def normalize_canvas(canvas: Mapping[str, Any], workflow_id: str = DEFAULT_WORKFLOW_ID) -> dict[str, Any]:
    fallback = default_canvas()
    nodes = canvas.get("nodes")
    normalized_nodes = [
        node
        for node in (_normalize_node(item) for item in nodes if isinstance(nodes, list))
        if node is not None
    ] if isinstance(nodes, list) else []
    if not normalized_nodes:
        normalized_nodes = list(fallback["nodes"])

    selected = canvas.get("selectedNodeId")
    if not isinstance(selected, str) or not any(node["id"] == selected for node in normalized_nodes):
        selected = normalized_nodes[0]["id"]

    zoom = canvas.get("zoom")
    if not isinstance(zoom, (int, float)):
        zoom = fallback["zoom"]
    zoom = max(0.6, min(1.5, round(float(zoom), 2)))

    return {
        "id": normalize_workflow_id(str(canvas.get("id") or workflow_id)),
        "schema_version": WORKFLOW_SCHEMA_VERSION,
        "nodes": normalized_nodes,
        "selectedNodeId": selected,
        "zoom": zoom,
        "updated_at": float(canvas.get("updated_at") or time.time()),
        "last_run": canvas.get("last_run") if isinstance(canvas.get("last_run"), Mapping) else None,
    }


def _normalize_node(node: Any) -> dict[str, str] | None:
    if not isinstance(node, Mapping):
        return None
    node_id = str(node.get("id") or "").strip()
    label = str(node.get("label") or "").strip()
    title = str(node.get("title") or "").strip()
    tone = str(node.get("tone") or "cyan").strip()
    if not node_id or not label or not title:
        return None
    if tone not in {"cyan", "violet", "emerald", "amber"}:
        tone = "cyan"
    return {
        "id": node_id[:80],
        "label": label[:80],
        "title": title[:280],
        "tone": tone,
    }


def _workflow_node_status(label: str) -> str:
    text = str(label or "").strip().lower()
    if any(marker in text for marker in ("approval", "permission", "confirm")):
        return "awaiting_approval"
    if any(marker in text for marker in ("trigger", "voice", "telegram", "whatsapp", "schedule")):
        return "triggered"
    if any(marker in text for marker in ("llm", "router", "soul", "skill", "tts", "http", "file", "output", "reply")):
        return "executed"
    return "validated"
