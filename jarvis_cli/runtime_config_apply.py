"""Helpers for safely applying runtime autoconfiguration patches."""

from __future__ import annotations

import copy
import json
from typing import Any, Mapping


def merge_runtime_config(
    current: Mapping[str, Any],
    patch: Mapping[str, Any],
) -> dict[str, Any]:
    """Recursively merge a runtime config patch without mutating inputs."""
    merged = copy.deepcopy(dict(current))

    def _merge(target: dict[str, Any], source: Mapping[str, Any]) -> None:
        for key, value in source.items():
            if (
                isinstance(value, Mapping)
                and isinstance(target.get(key), dict)
            ):
                _merge(target[key], value)
            else:
                target[key] = copy.deepcopy(value)

    _merge(merged, patch)
    json.dumps(merged, default=str)
    return merged


def changed_top_level_keys(
    before: Mapping[str, Any],
    after: Mapping[str, Any],
) -> list[str]:
    keys = sorted(set(before.keys()) | set(after.keys()))
    return [key for key in keys if before.get(key) != after.get(key)]
