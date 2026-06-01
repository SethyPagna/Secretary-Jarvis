"""Persistent startup manifest for the packaged JARVIS desktop app.

The manifest is deliberately small JSON. It lets a fresh backend process reuse
the last verified local model/soul/memory map immediately, then refresh it in
the background during runtime warmup.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any, Iterable, Mapping

SCHEMA_VERSION = 1
MANIFEST_RELATIVE_PATH = Path("startup") / "startup-manifest.json"
MEMORY_CONTEXT_FILES = (
    "SOUL.md",
    "MEMORY.md",
    "USER.md",
    "JARVIS.md",
    "AGENTS.md",
)


def startup_manifest_path(jarvis_home: Path) -> Path:
    return jarvis_home / MANIFEST_RELATIVE_PATH


def _stat_path(path: Path) -> dict[str, Any]:
    try:
        stat = path.stat()
    except OSError:
        return {
            "path": str(path),
            "exists": False,
            "mtime_ns": 0,
            "size": 0,
        }
    return {
        "path": str(path),
        "exists": True,
        "mtime_ns": int(getattr(stat, "st_mtime_ns", int(stat.st_mtime * 1_000_000_000))),
        "size": int(stat.st_size),
    }


def root_fingerprint(roots: Iterable[Path]) -> list[dict[str, Any]]:
    return [_stat_path(Path(root).expanduser()) for root in roots]


def load_startup_manifest(jarvis_home: Path) -> dict[str, Any]:
    path = startup_manifest_path(jarvis_home)
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(payload, dict) or payload.get("schema_version") != SCHEMA_VERSION:
        return {}
    return payload


def write_startup_manifest(jarvis_home: Path, payload: Mapping[str, Any]) -> dict[str, Any]:
    path = startup_manifest_path(jarvis_home)
    path.parent.mkdir(parents=True, exist_ok=True)
    manifest = {
        "schema_version": SCHEMA_VERSION,
        "written_at": time.time(),
        **dict(payload),
    }
    temp_path = path.with_name(f"{path.name}.{os.getpid()}.tmp")
    temp_path.write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8")
    os.replace(temp_path, path)
    return manifest


def roots_match_manifest(manifest: Mapping[str, Any], roots: Iterable[Path]) -> bool:
    saved = manifest.get("model_roots_fingerprint")
    current = root_fingerprint(roots)
    return isinstance(saved, list) and saved == current


def collect_memory_context_snapshot(jarvis_home: Path, cwd: Path | None = None) -> dict[str, Any]:
    """Return local memory/context file metadata for growth detection.

    The snapshot records file metadata and first markdown heading only. It does
    not duplicate full memory contents into the manifest.
    """
    roots = [jarvis_home]
    if cwd is not None:
        roots.append(cwd)

    seen: set[str] = set()
    files: list[dict[str, Any]] = []
    for root in roots:
        for name in MEMORY_CONTEXT_FILES:
            path = (root / name).expanduser()
            key = str(path.resolve(strict=False)).lower()
            if key in seen:
                continue
            seen.add(key)
            item = _stat_path(path)
            item["name"] = name
            item["title"] = _read_first_heading(path) if item["exists"] else ""
            files.append(item)

    changed = [item for item in files if item.get("exists")]
    return {
        "files": files,
        "available": len(changed),
        "total_bytes": sum(int(item.get("size") or 0) for item in changed),
        "latest_mtime_ns": max((int(item.get("mtime_ns") or 0) for item in changed), default=0),
    }


def manifest_summary(manifest: Mapping[str, Any]) -> dict[str, Any]:
    model_payload = manifest.get("model_payload") if isinstance(manifest.get("model_payload"), Mapping) else {}
    memory = manifest.get("memory_context") if isinstance(manifest.get("memory_context"), Mapping) else {}
    return {
        "available": bool(manifest),
        "written_at": float(manifest.get("written_at") or 0.0) if manifest else 0.0,
        "models": len(model_payload.get("models") or []),
        "memory_files": int(memory.get("available") or 0),
        "source": str(manifest.get("source") or "startup-manifest") if manifest else "",
    }


def _read_first_heading(path: Path) -> str:
    try:
        with path.open("r", encoding="utf-8", errors="replace") as handle:
            for line in handle:
                stripped = line.strip()
                if stripped:
                    return stripped.lstrip("#").strip()[:120]
    except OSError:
        return ""
    return ""
