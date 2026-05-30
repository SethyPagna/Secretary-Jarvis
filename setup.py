from __future__ import annotations

from collections import defaultdict
from pathlib import Path

from setuptools import setup


REPO_ROOT = Path(__file__).parent.resolve()


def _data_file_tree(
    root_name: str,
    install_root: str | None = None,
) -> list[tuple[str, list[str]]]:
    root = REPO_ROOT / root_name
    target_root = Path(install_root or root_name)
    grouped: defaultdict[str, list[str]] = defaultdict(list)
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        source_rel = path.relative_to(root)
        target_rel = target_root / source_rel
        grouped[str(target_rel.parent)].append(str(path.relative_to(REPO_ROOT)))
    return sorted(grouped.items())


setup(
    data_files=[
        *_data_file_tree("capabilities/skills", "skills"),
        *_data_file_tree("capabilities/optional-skills", "optional-skills"),
    ]
)
