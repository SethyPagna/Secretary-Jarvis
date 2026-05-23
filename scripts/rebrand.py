import os
import re
import sys
from pathlib import Path


REPLACEMENTS = [
    (r"\bHermes Agent\b", "JARVIS"),
    (r"\bHermesAgent\b", "JarvisAgent"),
    (r"\bhermes-agent\b", "jarvis-agent"),
    (r"\bhermes_cli\b", "jarvis_cli"),
    (r"\bhermes_constants\b", "jarvis_constants"),
    (r"\bhermes_bootstrap\b", "jarvis_bootstrap"),
    (r"\bhermes_logging\b", "jarvis_logging"),
    (r"\bhermes_state\b", "jarvis_state"),
    (r"\bhermes_time\b", "jarvis_time"),
    (r"\bget_hermes_home\b", "get_jarvis_home"),
    (r"\bset_hermes_home_override\b", "set_jarvis_home_override"),
    (r"\breset_hermes_home_override\b", "reset_jarvis_home_override"),
    (r"\bget_hermes_home_override\b", "get_jarvis_home_override"),
    (r"\bget_default_hermes_root\b", "get_default_jarvis_root"),
    (r"\bdisplay_hermes_home\b", "display_jarvis_home"),
    (r"\bget_hermes_dir\b", "get_jarvis_dir"),
    (r"\bload_hermes_dotenv\b", "load_jarvis_dotenv"),
    (r"\bHermes\b", "Jarvis"),
    (r"\bhermes\b", "jarvis"),
    (r"\bHERMES\b", "JARVIS"),
    (r"\bHERMES_", "JARVIS_"),
]

EXCLUDE_DIRS = {
    ".git",
    "__pycache__",
    "node_modules",
    ".venv",
    "venv",
    "dist",
    "build",
    ".mypy_cache",
    ".pytest_cache",
}
EXTENSIONS = {
    ".py",
    ".md",
    ".yaml",
    ".yml",
    ".toml",
    ".sh",
    ".ps1",
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".css",
    ".html",
    ".json",
    ".txt",
    ".ini",
    ".service",
    ".example",
}


def rebrand_text(text: str) -> str:
    for pattern, replacement in REPLACEMENTS:
        text = re.sub(pattern, replacement, text)
    return text


def should_rebrand(path: Path) -> bool:
    return path.suffix in EXTENSIONS or path.name in {
        "Dockerfile",
        "MANIFEST.in",
        ".env.example",
        ".dockerignore",
        ".gitignore",
    }


def rebrand_file(path: Path) -> bool:
    try:
        content = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return False

    updated = rebrand_text(content)
    if updated == content:
        return False

    path.write_text(updated, encoding="utf-8", newline="")
    print(f"Rebranded: {path}")
    return True


def walk_and_rebrand(root: Path) -> int:
    changed = 0
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
        for filename in filenames:
            path = Path(dirpath) / filename
            if should_rebrand(path) and rebrand_file(path):
                changed += 1
    return changed


if __name__ == "__main__":
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    changed = walk_and_rebrand(root)
    print(f"Updated {changed} files")
