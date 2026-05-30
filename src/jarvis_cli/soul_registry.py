"""Specialist soul registry for JARVIS delegation."""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
from typing import Iterable


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
    return sum(1 for keyword in keywords if keyword and keyword in text)
