"""Small appdirs compatibility shim for the packaged desktop backend.

PyInstaller's ``pkg_resources`` runtime hook can import ``appdirs`` before the
JARVIS backend entrypoint runs. Some Windows Python installs do not include the
external appdirs wheel, so this source-bundled shim provides the common helpers
that setuptools/pkg_resources expects without adding another startup download.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path


def _home() -> Path:
    return Path.home()


def user_data_dir(
    appname: str | None = None,
    appauthor: str | None = None,
    version: str | None = None,
    roaming: bool = False,
    multipath: bool = False,
) -> str:
    if sys.platform == "win32":
        root = os.environ.get("APPDATA" if roaming else "LOCALAPPDATA") or str(_home() / "AppData" / "Local")
        path = Path(root)
        if appauthor:
            path /= appauthor
    elif sys.platform == "darwin":
        path = _home() / "Library" / "Application Support"
    else:
        root = os.environ.get("XDG_DATA_HOME") or str(_home() / ".local" / "share")
        path = Path(root)

    if appname:
        path /= appname
    if version:
        path /= version
    return str(path)


def user_config_dir(
    appname: str | None = None,
    appauthor: str | None = None,
    version: str | None = None,
    roaming: bool = False,
    multipath: bool = False,
) -> str:
    if sys.platform == "win32":
        return user_data_dir(appname, appauthor, version, roaming, multipath)
    if sys.platform == "darwin":
        path = _home() / "Library" / "Preferences"
    else:
        path = Path(os.environ.get("XDG_CONFIG_HOME") or str(_home() / ".config"))
    if appname:
        path /= appname
    if version:
        path /= version
    return str(path)


def user_cache_dir(
    appname: str | None = None,
    appauthor: str | None = None,
    version: str | None = None,
    opinion: bool = True,
) -> str:
    if sys.platform == "win32":
        root = os.environ.get("LOCALAPPDATA") or str(_home() / "AppData" / "Local")
        path = Path(root)
        if appauthor:
            path /= appauthor
        if appname:
            path /= appname
        if opinion:
            path /= "Cache"
    elif sys.platform == "darwin":
        path = _home() / "Library" / "Caches"
        if appname:
            path /= appname
    else:
        path = Path(os.environ.get("XDG_CACHE_HOME") or str(_home() / ".cache"))
        if appname:
            path /= appname
    if version:
        path /= version
    return str(path)


def user_log_dir(
    appname: str | None = None,
    appauthor: str | None = None,
    version: str | None = None,
    opinion: bool = True,
) -> str:
    path = Path(user_cache_dir(appname, appauthor, version, opinion))
    if opinion and sys.platform == "darwin":
        path = _home() / "Library" / "Logs"
        if appname:
            path /= appname
    elif opinion and sys.platform != "win32":
        path /= "log"
    return str(path)


def site_data_dir(
    appname: str | None = None,
    appauthor: str | None = None,
    version: str | None = None,
    multipath: bool = False,
) -> str:
    if sys.platform == "win32":
        path = Path(os.environ.get("PROGRAMDATA") or "C:/ProgramData")
        if appauthor:
            path /= appauthor
    elif sys.platform == "darwin":
        path = Path("/Library/Application Support")
    else:
        path = Path("/usr/local/share")
    if appname:
        path /= appname
    if version:
        path /= version
    return str(path)


def site_config_dir(
    appname: str | None = None,
    appauthor: str | None = None,
    version: str | None = None,
    multipath: bool = False,
) -> str:
    return site_data_dir(appname, appauthor, version, multipath)
