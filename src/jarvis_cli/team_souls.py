"""JARVIS team soul manifest and lightweight routing helpers."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Mapping


SOULS_DIR = Path(__file__).parent / "data" / "souls"
MANIFEST_PATH = SOULS_DIR / "soul_manifest.json"


def load_team_souls_manifest() -> dict[str, Any]:
    """Load the bundled JARVIS team soul manifest."""
    try:
        manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    except Exception:
        manifest = {}
    if not isinstance(manifest, dict):
        manifest = {}

    souls = manifest.get("souls")
    if not isinstance(souls, list):
        souls = []

    normalized: list[dict[str, Any]] = []
    for soul in souls:
        if not isinstance(soul, Mapping):
            continue
        soul_id = str(soul.get("id") or "").strip().lower()
        if not soul_id:
            continue
        normalized.append(
            {
                "id": soul_id,
                "name": str(soul.get("name") or soul_id.upper()),
                "role": str(soul.get("role") or "specialist"),
                "template": str(soul.get("template") or ""),
                "when_to_use": str(soul.get("when_to_use") or ""),
                "responsibilities": [
                    str(item)
                    for item in soul.get("responsibilities", [])
                    if str(item).strip()
                ]
                if isinstance(soul.get("responsibilities"), list)
                else [],
                "keywords": [
                    str(item).strip().lower()
                    for item in soul.get("keywords", [])
                    if str(item).strip()
                ]
                if isinstance(soul.get("keywords"), list)
                else [],
                "delegates": [
                    str(item).strip().lower()
                    for item in soul.get("delegates", [])
                    if str(item).strip()
                ]
                if isinstance(soul.get("delegates"), list)
                else [],
            }
        )

    if not normalized:
        for soul_file in sorted(SOULS_DIR.glob("*_SOUL.md")):
            soul_id = soul_file.stem.replace("_SOUL", "").lower()
            normalized.append(
                {
                    "id": soul_id,
                    "name": soul_id.upper(),
                    "role": "specialist",
                    "template": str(soul_file),
                    "when_to_use": "Specialist JARVIS team soul.",
                    "responsibilities": [],
                    "keywords": [],
                    "delegates": [],
                }
            )

    primary = str(manifest.get("primary") or "jarvis").strip().lower() or "jarvis"
    if not any(soul["id"] == primary for soul in normalized):
        normalized.insert(
            0,
            {
                "id": primary,
                "name": primary.upper(),
                "role": "personal_assistant",
                "template": "",
                "when_to_use": "Use for general coordination.",
                "responsibilities": [],
                "keywords": [],
                "delegates": [],
            },
        )
    return {"primary": primary, "souls": normalized}


def team_souls_by_id(manifest: Mapping[str, Any] | None = None) -> dict[str, dict[str, Any]]:
    payload = dict(manifest or load_team_souls_manifest())
    return {
        str(soul.get("id") or "").lower(): dict(soul)
        for soul in payload.get("souls", [])
        if isinstance(soul, Mapping) and soul.get("id")
    }


def classify_prompt_soul(prompt: str, manifest: Mapping[str, Any] | None = None) -> dict[str, Any]:
    """Pick the best JARVIS team soul for a prompt using manifest keywords."""
    payload = dict(manifest or load_team_souls_manifest())
    souls = team_souls_by_id(payload)
    primary = str(payload.get("primary") or "jarvis").lower()
    clean_prompt = (prompt or "").lower()
    words = set(re.findall(r"[a-z0-9_.+#-]+", clean_prompt))

    best_id = primary
    best_score = 0
    for soul_id, soul in souls.items():
        if soul_id == primary:
            continue
        score = 0
        for keyword in soul.get("keywords", []):
            key = str(keyword).lower().strip()
            if not key:
                continue
            if key in words:
                score += 4
            elif " " in key and key in clean_prompt:
                score += 5
            elif len(key) >= 4 and key in clean_prompt:
                score += 1
        if score > best_score:
            best_id = soul_id
            best_score = score

    soul = souls.get(best_id) or souls.get(primary) or {"id": primary, "name": primary.upper()}
    delegates = [
        soul_id
        for soul_id in souls
        if soul_id != str(soul.get("id") or primary).lower()
    ][:12]
    return {
        "id": str(soul.get("id") or primary).lower(),
        "name": str(soul.get("name") or str(soul.get("id") or primary).upper()),
        "role": str(soul.get("role") or "specialist"),
        "when_to_use": str(soul.get("when_to_use") or ""),
        "responsibilities": list(soul.get("responsibilities") or []),
        "delegates": delegates,
    }


def build_soul_routed_prompt(prompt: str, soul: Mapping[str, Any]) -> str:
    """Attach concise team-routing context to a desktop model turn."""
    soul_id = str(soul.get("id") or "jarvis")
    name = str(soul.get("name") or soul_id.upper())
    role = str(soul.get("role") or "specialist").replace("_", " ")
    when_to_use = str(soul.get("when_to_use") or "").strip()
    responsibilities = [
        str(item).strip()
        for item in soul.get("responsibilities", [])
        if str(item).strip()
    ][:4]
    responsibility_text = "\n".join(f"- {item}" for item in responsibilities)
    return (
        "JARVIS team routing context:\n"
        f"Active soul: {name} ({role}).\n"
        f"When to use: {when_to_use or 'Handle the current user request.'}\n"
        f"Responsibilities:\n{responsibility_text or '- Respond clearly and complete the task.'}\n"
        "Answer as JARVIS coordinating this specialist. Do not mention routing unless it helps the user.\n\n"
        f"User request:\n{prompt}"
    )
