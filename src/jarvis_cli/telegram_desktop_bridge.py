"""Desktop-owned Telegram bridge for the packaged JARVIS app.

The full gateway remains available for advanced deployments, but the desktop
app needs a small always-on Bot API bridge so Telegram works when the user only
launches JARVIS.exe. This module deliberately uses the standard library so the
packaged backend does not depend on an extra Telegram runtime.
"""

from __future__ import annotations

import json
import logging
import os
import subprocess
import threading
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Mapping

from jarvis_cli.config import load_env

_log = logging.getLogger(__name__)
_thread: threading.Thread | None = None
_stop_event = threading.Event()
_status_lock = threading.Lock()
_offset = 0
_status: dict[str, Any] = {
    "configured": False,
    "running": False,
    "connected": False,
    "state": "stopped",
    "username": "",
    "last_error": "",
    "last_message_at": None,
    "messages_handled": 0,
    "updates_seen": 0,
}


def _merged_env() -> dict[str, str]:
    values = dict(os.environ)
    values.update(load_env())
    return {str(k): str(v) for k, v in values.items() if v is not None}


def _token(env: Mapping[str, str] | None = None) -> str:
    values = env or _merged_env()
    return (
        values.get("TELEGRAM_BOT_TOKEN")
        or values.get("JARVIS_TELEGRAM_TOKEN")
        or values.get("JARVIS_TELEGRAM_BOT_TOKEN")
        or ""
    ).strip()


def _allowed_users(env: Mapping[str, str] | None = None) -> set[str]:
    values = env or _merged_env()
    raw = values.get("TELEGRAM_ALLOWED_USERS") or values.get("JARVIS_TELEGRAM_ALLOWED_USERS") or ""
    return {part.strip() for part in raw.replace(";", ",").split(",") if part.strip()}


def _api(token: str, method: str, payload: Mapping[str, Any] | None = None, timeout: float = 20.0) -> dict[str, Any]:
    url = f"https://api.telegram.org/bot{token}/{method}"
    data = None
    if payload is not None:
        data = urllib.parse.urlencode({key: value for key, value in payload.items() if value is not None}).encode()
    request = urllib.request.Request(url, data=data, method="POST" if data is not None else "GET")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read().decode("utf-8", errors="replace")
    except Exception:
        # Some locked-down Windows installs block Python sockets while the
        # system curl.exe remains allowed. Keep Telegram usable in the packaged
        # desktop app instead of leaving the bridge permanently "Off".
        curl_exe = "curl.exe"
        system_curl = Path(os.getenv("SystemRoot", r"C:\Windows")) / "System32" / "curl.exe"
        if system_curl.exists():
            curl_exe = str(system_curl)
        command = [curl_exe, "-sS", "--max-time", str(max(1, int(timeout))), url]
        if data is not None:
            command.extend(["--data", data.decode("utf-8", errors="replace")])
        completed = subprocess.run(command, check=False, capture_output=True, text=True, timeout=timeout + 5)
        if completed.returncode != 0:
            raise RuntimeError(completed.stderr.strip() or completed.stdout.strip() or "Telegram request failed")
        body = completed.stdout
    parsed = json.loads(body)
    return parsed if isinstance(parsed, dict) else {"ok": False, "description": "Unexpected Telegram response"}


def _set_status(**updates: Any) -> None:
    with _status_lock:
        _status.update(updates)


def telegram_bridge_status() -> dict[str, Any]:
    env = _merged_env()
    token = _token(env)
    with _status_lock:
        needs_probe = bool(token) and bool(_status.get("running")) and not bool(_status.get("connected"))
    if needs_probe:
        try:
            me = _api(token, "getMe", timeout=4.0)
            if me.get("ok"):
                username = str((me.get("result") or {}).get("username") or "")
                _set_status(connected=True, state="running", username=username, last_error="")
            else:
                _set_status(connected=False, state="error", last_error=str(me.get("description") or "getMe failed"))
        except Exception as exc:
            _set_status(connected=False, state="error", last_error=f"Telegram getMe failed: {exc}")
    with _status_lock:
        payload = dict(_status)
    payload["configured"] = bool(token)
    payload["allowed_users_configured"] = bool(_allowed_users(env))
    payload["error"] = payload.get("last_error") or ""
    return payload


def _send_message(token: str, chat_id: int | str, text: str) -> None:
    chunks = [text[index : index + 3900] for index in range(0, len(text), 3900)] or ["Done."]
    for chunk in chunks:
        _api(token, "sendMessage", {"chat_id": chat_id, "text": chunk}, timeout=15.0)


def _handle_text_message(token: str, jarvis_home: Path, message: Mapping[str, Any]) -> None:
    chat = message.get("chat") if isinstance(message.get("chat"), Mapping) else {}
    sender = message.get("from") if isinstance(message.get("from"), Mapping) else {}
    chat_id = chat.get("id")
    user_id = str(sender.get("id") or "")
    text = str(message.get("text") or "").strip()
    if not chat_id or not text:
        return

    allowed = _allowed_users()
    if allowed and user_id not in allowed:
        _send_message(token, chat_id, "JARVIS is online, but this Telegram user is not allowed yet.")
        return

    if text.lower().startswith("/start"):
        _send_message(token, chat_id, "JARVIS is online. Send a message and I will answer here.")
        return

    from jarvis_cli.desktop_chat import run_desktop_chat_turn

    result = run_desktop_chat_turn(text, jarvis_home=jarvis_home)
    _send_message(token, chat_id, result.response.strip() or "I did not receive a usable response.")
    _set_status(last_message_at=time.time(), messages_handled=int(_status.get("messages_handled") or 0) + 1)


def _poll_loop(token: str, jarvis_home: Path) -> None:
    global _offset
    try:
        me = _api(token, "getMe", timeout=12.0)
        if me.get("ok"):
            username = str((me.get("result") or {}).get("username") or "")
            _set_status(connected=True, state="running", username=username, last_error="")
        else:
            _set_status(connected=False, state="error", last_error=str(me.get("description") or "getMe failed"))
    except Exception as exc:
        _set_status(connected=False, state="error", last_error=f"Telegram getMe failed: {exc}")

    while not _stop_event.is_set():
        try:
            response = _api(
                token,
                "getUpdates",
                {"timeout": 25, "offset": _offset, "allowed_updates": json.dumps(["message"])},
                timeout=35.0,
            )
            if not response.get("ok"):
                _set_status(state="error", connected=False, last_error=str(response.get("description") or "getUpdates failed"))
                _stop_event.wait(5)
                continue
            _set_status(state="running", connected=True, last_error="")
            updates = response.get("result") if isinstance(response.get("result"), list) else []
            if updates:
                _set_status(updates_seen=int(_status.get("updates_seen") or 0) + len(updates))
            for update in updates:
                if not isinstance(update, Mapping):
                    continue
                try:
                    _offset = max(_offset, int(update.get("update_id") or 0) + 1)
                except (TypeError, ValueError):
                    pass
                message = update.get("message")
                if isinstance(message, Mapping):
                    _handle_text_message(token, jarvis_home, message)
        except Exception as exc:
            _log.warning("Telegram desktop bridge poll failed: %s", exc)
            _set_status(state="error", connected=False, last_error=str(exc))
            _stop_event.wait(5)

    _set_status(running=False, connected=False, state="stopped")


def start_telegram_bridge(jarvis_home: str | Path) -> dict[str, Any]:
    global _thread
    env = _merged_env()
    token = _token(env)
    if not token:
        _set_status(configured=False, running=False, connected=False, state="not_configured", last_error="TELEGRAM_BOT_TOKEN is not configured.")
        return telegram_bridge_status()
    if _thread and _thread.is_alive():
        return telegram_bridge_status()

    _stop_event.clear()
    _set_status(configured=True, running=True, connected=False, state="starting", last_error="")
    _thread = threading.Thread(
        target=_poll_loop,
        args=(token, Path(jarvis_home)),
        name="jarvis-telegram-desktop-bridge",
        daemon=True,
    )
    _thread.start()
    return telegram_bridge_status()


def stop_telegram_bridge(timeout: float = 4.0) -> dict[str, Any]:
    _stop_event.set()
    thread = _thread
    if thread and thread.is_alive():
        thread.join(timeout=timeout)
    _set_status(running=False, connected=False, state="stopped")
    return telegram_bridge_status()
