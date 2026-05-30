from __future__ import annotations

import shutil
import sys
from pathlib import Path


def main() -> int:
    repo_root = Path(__file__).resolve().parents[2]
    destination = repo_root / "runtime" / "llama.cpp"
    executable = shutil.which("llama-server")
    if not executable:
        destination.mkdir(parents=True, exist_ok=True)
        (destination / "README.txt").write_text(
            "llama-server was not found on PATH during packaging. "
            "Install llama.cpp or set JARVIS_LLAMA_SERVER_PATH.\n",
            encoding="utf-8",
        )
        print("llama-server not found; packaged app will use API fallback until llama.cpp is configured.")
        return 0

    source_dir = Path(executable).resolve().parent
    if destination.exists():
        shutil.rmtree(destination)
    destination.mkdir(parents=True, exist_ok=True)

    patterns = (
        "llama-server.exe",
        "llama.dll",
        "llama-common.dll",
        "ggml*.dll",
        "mtmd.dll",
        "libomp*.dll",
    )
    copied = []
    for pattern in patterns:
        for source in source_dir.glob(pattern):
            target = destination / source.name
            shutil.copyfile(source, target)
            copied.append(target.name)

    if not (destination / "llama-server.exe").is_file():
        raise RuntimeError(f"Failed to stage llama-server.exe from {source_dir}.")

    print(f"Staged llama.cpp runtime from {source_dir} to {destination} ({len(copied)} files)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
