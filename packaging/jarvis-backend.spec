# -*- mode: python ; coding: utf-8 -*-

from pathlib import Path


repo_root = Path(SPECPATH).parent
entrypoint = repo_root / "jarvis_cli" / "desktop_entry.py"
data_files = [
    (str(repo_root / "jarvis_cli" / "data" / "default_SOUL.md"), "jarvis_cli/data"),
    (str(repo_root / "jarvis_cli" / "data" / "souls"), "jarvis_cli/data/souls"),
]
web_dist = repo_root / "jarvis_cli" / "web_dist"
if web_dist.exists():
    data_files.append((str(web_dist), "jarvis_cli/web_dist"))

a = Analysis(
    [str(entrypoint)],
    pathex=[str(repo_root)],
    binaries=[],
    datas=data_files,
    hiddenimports=[
        "fastapi",
        "pydantic",
        "psutil",
        "sqlite3",
        "uvicorn",
        "uvicorn.logging",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets.auto",
        "websockets",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="jarvis-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="jarvis-backend",
)
