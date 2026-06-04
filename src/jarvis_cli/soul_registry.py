"""Specialist soul registry for JARVIS delegation."""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
import re
from typing import Any, Iterable, Mapping


DATA_DIR = Path(__file__).with_name("data") / "souls"
MANIFEST_PATH = DATA_DIR / "soul_manifest.json"


@dataclass(frozen=True)
class SoulDefinition:
    id: str
    name: str
    role: str
    template: str
    when_to_use: str
    responsibilities: tuple[str, ...]
    keywords: tuple[str, ...]
    delegates: tuple[str, ...] = ()


@dataclass(frozen=True)
class SoulRegistry:
    primary: SoulDefinition
    souls: tuple[SoulDefinition, ...]

    @property
    def delegates(self) -> tuple[SoulDefinition, ...]:
        return tuple(soul for soul in self.souls if soul.id != self.primary.id)


def _definition_from_json(data: dict[str, object]) -> SoulDefinition:
    return SoulDefinition(
        id=str(data["id"]),
        name=str(data["name"]),
        role=str(data["role"]),
        template=str(data["template"]),
        when_to_use=str(data["when_to_use"]),
        responsibilities=tuple(str(item) for item in data.get("responsibilities", [])),
        keywords=tuple(str(item).lower() for item in data.get("keywords", [])),
        delegates=tuple(str(item) for item in data.get("delegates", [])),
    )


def load_soul_registry(path: Path | None = None) -> SoulRegistry:
    manifest_path = path or MANIFEST_PATH
    raw = json.loads(manifest_path.read_text(encoding="utf-8"))
    souls = tuple(_definition_from_json(item) for item in raw["souls"])
    primary_id = str(raw["primary"])
    primary = next(soul for soul in souls if soul.id == primary_id)
    return SoulRegistry(primary=primary, souls=souls)


def choose_delegate_for_task(
    task_text: str,
    registry: SoulRegistry | None = None,
) -> SoulDefinition:
    active_registry = registry or load_soul_registry()
    text = task_text.lower()
    best_soul = active_registry.primary
    best_score = 0

    for soul in active_registry.delegates:
        score = _keyword_score(text, soul.keywords)
        if score > best_score:
            best_score = score
            best_soul = soul

    return best_soul


def _keyword_score(text: str, keywords: Iterable[str]) -> int:
    words = set(re.findall(r"[a-z0-9_.+#-]+", text))
    score = 0
    for keyword in keywords:
        key = str(keyword).lower().strip()
        if not key:
            continue
        if key in words:
            score += 4
        elif " " in key and key in text:
            score += 5
        elif len(key) >= 4 and key in text:
            score += 1
    return score


def load_team_souls_manifest() -> dict[str, Any]:
    """Return the JARVIS team soul manifest as normalized dictionaries."""
    try:
        registry = load_soul_registry()
    except Exception:
        souls = []
        for soul_file in sorted(DATA_DIR.glob("*_SOUL.md")):
            soul_id = soul_file.stem.replace("_SOUL", "").lower()
            souls.append(
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
        return {"primary": "jarvis", "souls": souls}

    return {
        "primary": registry.primary.id,
        "souls": [
            {
                "id": soul.id,
                "name": soul.name,
                "role": soul.role,
                "template": soul.template,
                "when_to_use": soul.when_to_use,
                "responsibilities": list(soul.responsibilities),
                "keywords": list(soul.keywords),
                "delegates": list(soul.delegates),
            }
            for soul in registry.souls
        ],
    }


def team_souls_by_id(registry: SoulRegistry | None = None) -> dict[str, dict[str, Any]]:
    active_registry = registry or load_soul_registry()
    return {
        soul.id: {
            "id": soul.id,
            "name": soul.name,
            "role": soul.role,
            "template": soul.template,
            "when_to_use": soul.when_to_use,
            "responsibilities": list(soul.responsibilities),
            "keywords": list(soul.keywords),
            "delegates": list(soul.delegates),
        }
        for soul in active_registry.souls
    }


def classify_prompt_soul(task_text: str, registry: SoulRegistry | None = None) -> dict[str, Any]:
    """Pick the best JARVIS team soul for a desktop/gateway/workflow task."""
    active_registry = registry or load_soul_registry()
    selected = choose_delegate_for_task(task_text, active_registry)
    delegates = [soul.id for soul in active_registry.souls if soul.id != selected.id][:12]
    return {
        "id": selected.id,
        "name": selected.name,
        "role": selected.role,
        "when_to_use": selected.when_to_use,
        "responsibilities": list(selected.responsibilities),
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
