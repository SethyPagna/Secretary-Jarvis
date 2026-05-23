"""Desktop backend entrypoint for the packaged JARVIS app."""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import socket
import sys
from collections.abc import Sequence
from typing import Any, Callable


REQUIRED_DESKTOP_MODULES = ("fastapi", "uvicorn", "pydantic", "yaml")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="jarvis-desktop-backend",
        description="Run the JARVIS FastAPI backend for the Electron desktop shell.",
    )
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-open", action="store_true", help="Do not open a browser window.")
    parser.add_argument(
        "--allow-public",
        action="store_true",
        help="Allow binding outside loopback. Desktop packaging should leave this disabled.",
    )
    parser.add_argument(
        "--preflight",
        action="store_true",
        help="Check desktop backend dependencies and bind readiness, then exit.",
    )
    return parser


def _is_loopback_host(host: str) -> bool:
    return host in {"127.0.0.1", "localhost", "::1"}


def _port_available(host: str, port: int) -> tuple[bool, str]:
    if port == 0:
        return True, ""

    try:
        with socket.socket(socket.AF_INET6 if ":" in host else socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind((host, port))
        return True, ""
    except OSError as exc:
        return False, f"{type(exc).__name__}: {exc}"


def run_preflight(
    *,
    host: str,
    port: int,
    allow_public: bool,
    check_port: bool = True,
    find_spec: Callable[[str], Any] = importlib.util.find_spec,
) -> dict[str, Any]:
    """Return a fast, import-safe desktop backend startup diagnostic."""
    missing_modules = [
        module_name
        for module_name in REQUIRED_DESKTOP_MODULES
        if find_spec(module_name) is None
    ]
    issues: list[str] = []
    actions: list[str] = []

    if missing_modules:
        issues.append(
            "Missing desktop backend Python modules: "
            + ", ".join(missing_modules)
        )
        actions.append(f"{sys.executable} -m pip install -e .")

    if not allow_public and not _is_loopback_host(host):
        issues.append(
            f"Refusing public bind host '{host}' without --allow-public."
        )
        actions.append("Use --host 127.0.0.1 for the desktop app.")

    port_error = ""
    port_available = True
    if check_port:
        port_available, port_error = _port_available(host, port)
        if not port_available:
            issues.append(f"Port {port} on {host} is unavailable: {port_error}")
            actions.append(f"Stop the process using {host}:{port} or choose another port.")

    return {
        "ok": not issues,
        "host": host,
        "port": port,
        "allow_public": allow_public,
        "missing_modules": missing_modules,
        "port_available": port_available,
        "port_error": port_error,
        "issues": issues,
        "actions": actions,
    }


def main(argv: Sequence[str] | None = None) -> None:
    args = build_parser().parse_args(argv)

    os.environ.setdefault("JARVIS_DESKTOP_EMBEDDED", "1")
    os.environ.setdefault("JARVIS_DISABLE_LAZY_INSTALLS", "1")

    if args.preflight:
        result = run_preflight(
            host=args.host,
            port=args.port,
            allow_public=args.allow_public,
        )
        print(json.dumps(result, indent=2, sort_keys=True))
        raise SystemExit(0 if result["ok"] else 1)

    from jarvis_cli.web_server import start_server

    start_server(
        host=args.host,
        port=args.port,
        open_browser=not args.no_open,
        allow_public=args.allow_public,
        embedded_chat=True,
    )


if __name__ == "__main__":
    main()
