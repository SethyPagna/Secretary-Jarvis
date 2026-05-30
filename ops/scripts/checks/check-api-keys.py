#!/usr/bin/env python3
"""Check JARVIS API key wiring without printing secret values."""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.request


def discover_token(base: str) -> str:
    with urllib.request.urlopen(base.rstrip("/"), timeout=15) as response:
        html = response.read().decode("utf-8", errors="replace")
    match = re.search(r"__JARVIS_SESSION_TOKEN__\s*=\s*['\"]([^'\"]+)['\"]", html)
    return match.group(1) if match else ""


def request_json(base: str, path: str, token: str = "") -> dict:
    headers = {"Accept": "application/json"}
    if token:
        headers["X-Jarvis-Session-Token"] = token
    req = urllib.request.Request(f"{base.rstrip('/')}{path}", headers=headers)
    with urllib.request.urlopen(req, timeout=90) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://127.0.0.1:8765")
    parser.add_argument("--live", action="store_true")
    args = parser.parse_args()

    path = "/api/integrations/status?live=true" if args.live else "/api/integrations/status"
    data = request_json(args.base, path, discover_token(args.base))
    print(f"env_path={data.get('env_path')}")
    configured = data.get("configured_optional_keys") or []
    print(f"configured_optional_keys={', '.join(configured) if configured else '(none)'}")

    failures: list[str] = []
    services = data.get("services") or {}
    for name, item in services.items():
        configured_text = "configured" if item.get("configured") else "missing"
        source = item.get("source") or "-"
        redacted = item.get("redacted") or "-"
        live = item.get("live")
        if live is None:
            live_text = "not checked"
        else:
            live_text = f"{'ok' if live.get('ok') else 'failed'}"
            if live.get("status_code") is not None:
                live_text += f" http={live.get('status_code')}"
            if live.get("latency_ms") is not None:
                live_text += f" {live.get('latency_ms')}ms"
            if not live.get("ok"):
                failures.append(name)
        print(f"{name}: {configured_text} source={source} key={redacted} live={live_text}")

    if failures:
        print(f"failed_live_checks={', '.join(failures)}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except urllib.error.URLError as exc:
        print(f"backend not reachable: {exc}", file=sys.stderr)
        raise SystemExit(2)
