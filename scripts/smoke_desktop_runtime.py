#!/usr/bin/env python3
"""Smoke-test the packaged JARVIS desktop backend contract.

Run after the backend is listening on 127.0.0.1:8765:

    python scripts/smoke_desktop_runtime.py

The script avoids shell-specific curl quirks, but exercises the same HTTP/SSE
routes the Electron renderer uses: status, streamed chat, model list/load,
skills counts, settings update, TTS->STT voice loop, and WhatsApp mock send.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any


@dataclass
class Client:
    base: str
    token: str

    def request(self, method: str, path: str, body: Any | None = None, content_type: str = "application/json") -> bytes:
        data = None
        headers = {"X-Jarvis-Session-Token": self.token}
        if body is not None:
            if isinstance(body, bytes):
                data = body
            else:
                data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = content_type
        req = urllib.request.Request(f"{self.base}{path}", data=data, headers=headers, method=method)
        with urllib.request.urlopen(req, timeout=180) as response:
            return response.read()

    def json(self, method: str, path: str, body: Any | None = None) -> Any:
        return json.loads(self.request(method, path, body).decode("utf-8"))


def discover_token(base: str) -> str:
    with urllib.request.urlopen(base, timeout=15) as response:
        html = response.read().decode("utf-8", errors="replace")
    match = re.search(r"__JARVIS_SESSION_TOKEN__\s*=\s*['\"]([^'\"]+)['\"]", html)
    if not match:
        raise RuntimeError("Could not discover injected dashboard session token from index.html")
    return match.group(1)


def parse_sse(raw: bytes) -> dict[str, Any]:
    done: dict[str, Any] = {}
    for event_block in raw.decode("utf-8", errors="replace").split("\n\n"):
        event = "message"
        data_lines: list[str] = []
        for line in event_block.splitlines():
            if line.startswith("event:"):
                event = line.split(":", 1)[1].strip()
            elif line.startswith("data:"):
                data_lines.append(line.split(":", 1)[1].strip())
        if event == "done" and data_lines:
            done = json.loads("\n".join(data_lines))
    if not done:
        raise RuntimeError("SSE chat stream did not emit a done event")
    return done


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://127.0.0.1:8765")
    parser.add_argument("--skip-voice", action="store_true")
    args = parser.parse_args()

    client = Client(args.base.rstrip("/"), discover_token(args.base.rstrip("/")))
    checks: list[tuple[str, bool, str]] = []

    def record(name: str, ok: bool, detail: str = "") -> None:
        checks.append((name, ok, detail))
        print(f"{'PASS' if ok else 'FAIL'} {name}: {detail}")

    status = client.json("GET", "/api/status")
    record("status", bool(status.get("version")), status.get("version", ""))

    models = client.json("GET", "/api/models/list")
    local_models = models.get("models") or []
    record("models-list", isinstance(local_models, list), f"{len(local_models)} models")
    first_llm = next(
        (m for m in local_models if m.get("kind") == "llm" and str(m.get("primary_file", "")).lower().endswith(".gguf")),
        None,
    ) or next((m for m in local_models if m.get("kind") == "llm"), None)
    if first_llm:
        loaded = client.json("POST", f"/api/models/load?model={urllib.parse.quote(first_llm['id'])}")
        record("models-load", bool(loaded.get("ok")), first_llm["id"])
    else:
        record("models-load", True, "no local LLM found; skipped")

    skills = client.json("GET", "/api/skills")
    stats = client.json("GET", "/api/stats")
    record(
        "skills-count",
        isinstance(skills, list) and stats.get("listed_skills", 0) >= len(skills),
        f"listed={stats.get('listed_skills')} active={stats.get('active_skills')} assets={stats.get('total_skill_assets')}",
    )

    settings = client.json("GET", "/api/settings")
    saved = client.json("POST", "/api/settings", {"settings": settings})
    record("settings-roundtrip", bool(saved.get("ok")), "GET/POST nested settings")

    chat_raw = client.request(
        "POST",
        "/api/desktop/chat/stream",
        {"prompt": "Reply with exactly: JARVIS online."},
    )
    chat = parse_sse(chat_raw)
    record(
        "chat-sse",
        bool(chat.get("response")) and int(chat.get("input_tokens") or 0) > 0 and int(chat.get("output_tokens") or 0) > 0,
        f"{chat.get('input_tokens')} in / {chat.get('output_tokens')} out",
    )

    if not args.skip_voice:
        tts = client.json("POST", "/api/voice/synthesize", {"text": "Jarvis voice smoke test."})
        record("tts", bool(tts.get("success") and tts.get("audio_base64")), tts.get("engine", ""))
        if tts.get("success") and tts.get("audio_base64"):
            import base64

            audio = base64.b64decode(tts["audio_base64"])
            stt = json.loads(client.request("POST", "/api/voice/transcribe", audio, "audio/wav").decode("utf-8"))
            record("stt", bool(stt.get("success")), stt.get("transcript", stt.get("error", ""))[:120])

    whatsapp = client.json("POST", "/api/messaging/whatsapp/send", {"mock": True, "to": "smoke", "message": "hello"})
    record("whatsapp-mock", bool(whatsapp.get("ok")), whatsapp.get("message", ""))

    failed = [name for name, ok, _ in checks if not ok]
    if failed:
        print(f"\nFAILED: {', '.join(failed)}")
        return 1
    print("\nAll smoke checks passed.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except urllib.error.URLError as exc:
        print(f"Backend not reachable: {exc}", file=sys.stderr)
        raise SystemExit(2)
