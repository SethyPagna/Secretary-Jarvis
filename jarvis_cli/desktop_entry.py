"""Desktop backend entrypoint for the packaged JARVIS app."""

from __future__ import annotations

import argparse
from collections.abc import Sequence


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
    return parser


def main(argv: Sequence[str] | None = None) -> None:
    args = build_parser().parse_args(argv)

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
