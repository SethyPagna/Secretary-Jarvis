from __future__ import annotations

import json


def test_telegram_bridge_remembers_seen_chat(tmp_path, monkeypatch):
    from jarvis_cli import telegram_desktop_bridge as bridge

    monkeypatch.setenv("JARVIS_HOME", str(tmp_path))
    monkeypatch.setenv("JARVIS_TELEGRAM_TOKEN", "token")
    monkeypatch.setattr(bridge, "_api", lambda *args, **kwargs: {"ok": True, "result": {"url": "", "pending_update_count": 0}})
    monkeypatch.setattr(bridge, "_send_message", lambda *args, **kwargs: None)

    message = {
        "chat": {"id": 12345, "type": "private", "first_name": "Seth"},
        "from": {"id": 67890, "first_name": "Seth"},
        "text": "/start",
    }

    bridge._handle_text_message("token", tmp_path, message)

    state_path = tmp_path / "gateway" / "telegram_desktop_state.json"
    state = json.loads(state_path.read_text(encoding="utf-8"))
    assert state["last_chat_id"] == 12345
    assert state["last_chat_label"] == "Seth"

    status = bridge.telegram_bridge_status(tmp_path)
    assert status["last_chat_id"] == 12345
    assert status["last_chat_label"] == "Seth"
    assert status["pending_updates"] == 0


def test_telegram_bridge_status_keeps_webhook_diagnostics(tmp_path, monkeypatch):
    from jarvis_cli import telegram_desktop_bridge as bridge

    monkeypatch.setenv("JARVIS_HOME", str(tmp_path))
    monkeypatch.setattr(bridge, "_token", lambda env=None: "token")
    monkeypatch.setattr(
        bridge,
        "_api",
        lambda token, method, payload=None, timeout=20.0: {
            "ok": True,
            "result": {"url": "https://example.test/hook", "pending_update_count": 4},
        },
    )

    status = bridge.telegram_bridge_status(tmp_path)

    assert status["configured"] is True
    assert status["webhook_url"] == "https://example.test/hook"
    assert status["pending_updates"] == 4
