#!/usr/bin/env python3
"""Live JARVIS desktop system probe.

This intentionally exercises the same HTTP endpoints used by the Electron UI,
then performs a local speaker -> microphone -> STT loop when audio devices are
available. Secrets are never printed.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import wave
import winsound
from pathlib import Path
from typing import Any


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def request(
    base: str,
    path: str,
    *,
    method: str = "GET",
    token: str = "",
    body: bytes | None = None,
    content_type: str = "application/json",
    timeout: float = 60,
) -> Any:
    headers = {"Accept": "application/json"}
    if token:
        headers["X-Jarvis-Session-Token"] = token
    if body is not None:
        headers["Content-Type"] = content_type
    req = urllib.request.Request(
        f"{base.rstrip('/')}{path}",
        data=body,
        headers=headers,
        method=method,
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        raw = response.read()
    text = raw.decode("utf-8", errors="replace")
    return json.loads(text) if text.strip() else {}


def discover_token(base: str) -> str:
    with urllib.request.urlopen(base.rstrip("/"), timeout=20) as response:
        html = response.read().decode("utf-8", errors="replace")
    match = re.search(r"__JARVIS_SESSION_TOKEN__\s*=\s*['\"]([^'\"]+)['\"]", html)
    return match.group(1) if match else ""


def wait_status(base: str, process: subprocess.Popen[str], timeout: float) -> dict[str, Any]:
    deadline = time.time() + timeout
    last_error = ""
    while time.time() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"backend exited early with code {process.returncode}")
        try:
            return request(base, "/api/status", timeout=3)
        except Exception as exc:  # noqa: BLE001 - probe keeps last failure.
            last_error = str(exc)
            time.sleep(0.5)
    raise TimeoutError(f"backend did not bind at {base}: {last_error}")


def start_backend(port: int, shutdown_token: str) -> tuple[subprocess.Popen[str], Path, Path]:
    root = repo_root()
    py_launcher = "py"
    command = [
        py_launcher,
        "-3.11",
        "-m",
        "jarvis_cli.desktop_entry",
        "--host",
        "127.0.0.1",
        "--port",
        str(port),
        "--no-open",
    ]
    env = os.environ.copy()
    src = str(root / "src")
    env["PYTHONPATH"] = f"{src};{env.get('PYTHONPATH', '')}".rstrip(";")
    env["JARVIS_DESKTOP_EMBEDDED"] = "1"
    env["JARVIS_DESKTOP_SHUTDOWN_TOKEN"] = shutdown_token
    env.setdefault("JARVIS_DISABLE_LAZY_INSTALLS", "1")
    log_id = f"{int(time.time())}-{os.getpid()}"
    out_log = Path(tempfile.gettempdir()) / f"jarvis-live-{log_id}.out.log"
    err_log = Path(tempfile.gettempdir()) / f"jarvis-live-{log_id}.err.log"
    out = out_log.open("w", encoding="utf-8")
    err = err_log.open("w", encoding="utf-8")
    try:
        process = subprocess.Popen(
            command,
            cwd=root,
            env=env,
            stdout=out,
            stderr=err,
            text=True,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    finally:
        out.close()
        err.close()
    return process, out_log, err_log


def shutdown_backend(base: str, process: subprocess.Popen[str], shutdown_token: str) -> None:
    try:
        req = urllib.request.Request(
            f"{base.rstrip('/')}/api/shutdown",
            data=b"{}",
            headers={
                "Content-Type": "application/json",
                "X-Jarvis-Desktop-Shutdown-Token": shutdown_token,
            },
            method="POST",
        )
        urllib.request.urlopen(req, timeout=5).read()
    except Exception:
        pass
    try:
        process.wait(timeout=8)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def post_json(base: str, path: str, payload: dict[str, Any], token: str = "", timeout: float = 90) -> Any:
    return request(
        base,
        path,
        method="POST",
        token=token,
        body=json.dumps(payload).encode("utf-8"),
        timeout=timeout,
    )


def parse_sse_chat(base: str, prompt: str, token: str) -> dict[str, Any]:
    req = urllib.request.Request(
        f"{base.rstrip('/')}/api/desktop/chat/stream",
        data=json.dumps({"prompt": prompt}).encode("utf-8"),
        headers={
            "Accept": "text/event-stream",
            "Content-Type": "application/json",
            **({"X-Jarvis-Session-Token": token} if token else {}),
        },
        method="POST",
    )
    started = time.perf_counter()
    chunks: list[str] = []
    done: dict[str, Any] = {}
    current_event = ""
    error_payload: dict[str, Any] = {}
    with urllib.request.urlopen(req, timeout=180) as response:
        for raw in response:
            line = raw.decode("utf-8", errors="replace").strip()
            if line.startswith("event:"):
                current_event = line[6:].strip()
                continue
            if not line.startswith("data:"):
                continue
            try:
                payload = json.loads(line[5:].strip())
            except json.JSONDecodeError:
                continue
            if "text" in payload:
                chunks.append(str(payload["text"]))
            if "response" in payload:
                done = payload
                break
            if current_event == "error" or "error" in payload:
                error_payload = payload
                break
    elapsed = max(time.perf_counter() - started, 0.001)
    text = "".join(chunks) or str(done.get("response") or "")
    return {
        "ok": bool(text.strip()),
        "chars": len(text),
        "latency_ms": int(elapsed * 1000),
        "tokens_per_second": round(max(1, len(text) // 4) / elapsed, 2),
        "response_preview": text.strip()[:120],
        "error": error_payload.get("error") or "",
    }


def decode_tts_to_wav(tts: dict[str, Any], output: Path) -> Path:
    audio = base64.b64decode(str(tts.get("audio_base64") or ""))
    output.write_bytes(audio)
    return output


def play_wav(path: Path) -> bool:
    winsound.PlaySound(str(path), winsound.SND_FILENAME)
    return True


def record_microphone(path: Path, seconds: float) -> dict[str, Any]:
    import numpy as np
    import sounddevice as sd
    import soundfile as sf

    devices = list(enumerate(sd.query_devices()))
    default_input = sd.default.device[0]
    preferred: list[int] = []
    if isinstance(default_input, int) and default_input >= 0:
        preferred.append(default_input)
    # MME often fails in service/sandboxed Windows contexts. Try WASAPI,
    # DirectSound, then WDM-KS style devices as fallbacks.
    for hostapi in (2, 1, 3, 0):
        for index, device in devices:
            if int(device.get("max_input_channels") or 0) > 0 and int(device.get("hostapi") or -1) == hostapi:
                preferred.append(index)
    seen: set[int] = set()
    errors: list[str] = []
    for input_index in preferred:
        if input_index in seen:
            continue
        seen.add(input_index)
        device = sd.query_devices(input_index)
        samplerate = int(device.get("default_samplerate") or 16000)
        channels = 1
        try:
            started = time.perf_counter()
            recording = sd.rec(
                int(seconds * samplerate),
                samplerate=samplerate,
                channels=channels,
                dtype="float32",
                device=input_index,
            )
            sd.wait()
        except Exception as exc:
            errors.append(f"{input_index}:{device.get('name')}: {exc}")
            continue
        peak = float(np.max(np.abs(recording))) if recording.size else 0.0
        rms = float(np.sqrt(np.mean(np.square(recording)))) if recording.size else 0.0
        if peak <= 0.000001 and rms <= 0.000001:
            errors.append(f"{input_index}:{device.get('name')}: opened but captured silence")
            continue
        sf.write(str(path), recording, samplerate)
        return {
            "path": str(path),
            "seconds": round(time.perf_counter() - started, 2),
            "device": str(device.get("name") or input_index),
            "device_index": input_index,
            "hostapi": int(device.get("hostapi") or -1),
            "samplerate": samplerate,
            "peak": round(peak, 6),
            "rms": round(rms, 6),
            "bytes": path.stat().st_size if path.exists() else 0,
            "fallback_errors": errors[:6],
        }
    raise RuntimeError("No microphone input stream opened. Tried: " + " | ".join(errors[:8]))


def tts_speaker_mic_stt_loop(base: str, token: str, seconds: float) -> dict[str, Any]:
    phrase = "Jarvis microphone live test."
    tts = post_json(base, "/api/voice/synthesize", {"text": phrase}, token=token)
    out_dir = Path(tempfile.gettempdir()) / "jarvis-live-probe"
    out_dir.mkdir(parents=True, exist_ok=True)
    tts_wav = decode_tts_to_wav(dict(tts), out_dir / "speaker-test.wav")

    # Play once so the user can hear it, then play during recording so the mic
    # has a deterministic phrase to capture if the hardware path permits it.
    play_wav(tts_wav)
    mic_wav = out_dir / "microphone-capture.wav"

    import threading

    thread = threading.Thread(target=play_wav, args=(tts_wav,), daemon=True)
    thread.start()
    mic = record_microphone(mic_wav, seconds)
    thread.join(timeout=seconds + 3)

    transcribed = request(
        base,
        "/api/voice/transcribe",
        method="POST",
        token=token,
        body=mic_wav.read_bytes(),
        content_type="audio/wav",
        timeout=180,
    )
    return {
        "tts": {
            "success": bool(tts.get("success")),
            "provider": tts.get("provider"),
            "engine": tts.get("engine"),
            "latency_ms": tts.get("latency_ms"),
            "audio_bytes": tts.get("audio_bytes"),
            "file": str(tts_wav),
        },
        "speaker_played": True,
        "microphone": mic,
        "stt": {
            "success": bool(transcribed.get("success")),
            "provider": transcribed.get("provider"),
            "engine": transcribed.get("engine"),
            "latency_ms": transcribed.get("latency_ms"),
            "transcript": transcribed.get("transcript") or "",
            "error": transcribed.get("error") or "",
        },
    }


def telegram_live_probe(base: str, token: str, send_latest: bool) -> dict[str, Any]:
    status_before = request(base, "/api/messaging/telegram/status", token=token, timeout=30)
    started = post_json(base, "/api/messaging/telegram/start", {}, token=token, timeout=30)
    time.sleep(2)
    status_after = request(base, "/api/messaging/telegram/status", token=token, timeout=30)
    payload = {
        "configured": bool(status_after.get("configured")),
        "running": bool(status_after.get("running")),
        "connected": bool(status_after.get("connected")),
        "state": status_after.get("state"),
        "username": status_after.get("username") or started.get("username") or "",
        "updates_seen": status_after.get("updates_seen"),
        "messages_handled": status_after.get("messages_handled"),
        "error": status_after.get("error") or status_after.get("last_error") or "",
        "before_state": status_before.get("state"),
    }
    if send_latest and payload["configured"]:
        try:
            root = repo_root()
            sys.path.insert(0, str(root / "src"))
            from jarvis_cli.config import load_env
            from jarvis_cli.telegram_desktop_bridge import _api, _token

            env = {**os.environ, **load_env()}
            bot_token = _token(env)
            updates = _api(bot_token, "getUpdates", {"timeout": 1}, timeout=8)
            latest_chat = None
            for update in reversed(updates.get("result") or []):
                message = update.get("message") if isinstance(update, dict) else None
                chat = message.get("chat") if isinstance(message, dict) else None
                if isinstance(chat, dict) and chat.get("id"):
                    latest_chat = chat.get("id")
                    break
            if latest_chat:
                text = f"JARVIS live Telegram probe OK at {time.strftime('%Y-%m-%d %H:%M:%S')}."
                sent = _api(bot_token, "sendMessage", {"chat_id": latest_chat, "text": text}, timeout=15)
                payload["send_latest"] = {"ok": bool(sent.get("ok")), "chat_id_found": True}
            else:
                payload["send_latest"] = {"ok": False, "chat_id_found": False, "error": "No recent Telegram chat found."}
        except Exception as exc:  # noqa: BLE001 - diagnostic path.
            payload["send_latest"] = {"ok": False, "error": str(exc)}
    return payload


def model_probe_score(model: dict[str, Any]) -> tuple[int, int, str]:
    text = f"{model.get('id') or ''} {model.get('name') or ''} {model.get('primary_file') or ''}".lower()
    quant = 0
    for score, marker in ((120, "q4_k_m"), (115, "q4"), (110, "q5_k_m"), (95, "q5"), (40, "q8"), (5, "f16")):
        if marker in text:
            quant = score
            break
    family = 0
    for score, marker in ((50, "qwen"), (40, "gemma"), (35, "llama"), (30, "mistral")):
        if marker in text:
            family = score
            break
    size = int(model.get("size_bytes") or 0)
    # Prefer practical quantized files over the largest F16 asset for a live
    # startup probe.
    return (family + quant, -size, str(model.get("name") or ""))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="")
    parser.add_argument("--port", type=int, default=18912)
    parser.add_argument("--timeout", type=float, default=90)
    parser.add_argument("--skip-speaker-mic", action="store_true")
    parser.add_argument("--telegram-send-latest", action="store_true")
    parser.add_argument("--record-seconds", type=float, default=4.0)
    args = parser.parse_args()

    base = args.base or f"http://127.0.0.1:{args.port}"
    shutdown_token = f"live-{int(time.time())}-{os.getpid()}"
    process: subprocess.Popen[str] | None = None
    logs: tuple[Path, Path] | None = None
    report: dict[str, Any] = {"base": base, "checks": {}, "logs": {}}
    failures: list[str] = []

    try:
        if not args.base:
            process, out_log, err_log = start_backend(args.port, shutdown_token)
            logs = (out_log, err_log)
            report["logs"] = {"stdout": str(out_log), "stderr": str(err_log)}
            report["checks"]["status"] = wait_status(base, process, args.timeout)
        else:
            report["checks"]["status"] = request(base, "/api/status", timeout=10)

        token = discover_token(base)
        report["session_token_discovered"] = bool(token)

        endpoint_plan = [
            ("readiness", "/api/runtime/readiness"),
            ("stats", "/api/stats"),
            ("models", "/api/models/list"),
            ("skills", "/api/skills"),
            ("settings", "/api/settings"),
            ("integrations_live", "/api/integrations/status?live=true"),
            ("sessions", "/api/sessions?limit=3&offset=0"),
            ("workflows", "/api/workflows"),
            ("whatsapp", "/api/messaging/whatsapp/status"),
        ]
        for name, path in endpoint_plan:
            started = time.perf_counter()
            try:
                payload = request(base, path, token=token, timeout=90)
                report["checks"][name] = {
                    "ok": True,
                    "latency_ms": int((time.perf_counter() - started) * 1000),
                    "summary": summarize_payload(name, payload),
                }
            except Exception as exc:  # noqa: BLE001 - probe result.
                failures.append(name)
                report["checks"][name] = {"ok": False, "error": str(exc)}

        models = request(base, "/api/models/list", token=token, timeout=60)
        model_items = models.get("models") if isinstance(models, dict) else []
        llm_items = [m for m in model_items if isinstance(m, dict) and m.get("kind") == "llm"]
        first_llm = sorted(llm_items, key=model_probe_score, reverse=True)[0] if llm_items else None
        if first_llm:
            model_id = str(first_llm.get("id") or first_llm.get("name") or "")
            report["checks"]["model_load"] = request(
                base,
                f"/api/models/load?model={urllib.parse.quote(model_id)}",
                method="POST",
                token=token,
                body=b"{}",
                timeout=60,
            )
        else:
            failures.append("model_load")
            report["checks"]["model_load"] = {"ok": False, "error": "No local LLM model found."}

        report["checks"]["runtime_smoke"] = post_json(base, "/api/runtime/smoke-test", {}, token=token, timeout=240)
        if not bool(report["checks"]["runtime_smoke"].get("production_ready")):
            failures.append("runtime_smoke")

        report["checks"]["chat_stream"] = parse_sse_chat(base, "Say exactly: JARVIS live chat OK.", token)
        if not report["checks"]["chat_stream"]["ok"]:
            failures.append("chat_stream")

        if not args.skip_speaker_mic:
            try:
                report["checks"]["speaker_mic_stt"] = tts_speaker_mic_stt_loop(base, token, args.record_seconds)
                if not report["checks"]["speaker_mic_stt"]["stt"]["success"]:
                    failures.append("speaker_mic_stt")
            except Exception as exc:  # noqa: BLE001 - hardware probe result.
                failures.append("speaker_mic_stt")
                report["checks"]["speaker_mic_stt"] = {"ok": False, "error": str(exc)}

        report["checks"]["telegram"] = telegram_live_probe(base, token, args.telegram_send_latest)
        if report["checks"]["telegram"].get("configured") and not report["checks"]["telegram"].get("connected"):
            failures.append("telegram")

    finally:
        if process is not None:
            shutdown_backend(base, process, shutdown_token)
            report["backend_exit_code"] = process.returncode

    report["failures"] = failures
    print(json.dumps(report, indent=2, ensure_ascii=False, default=str))
    return 1 if failures else 0


def summarize_payload(name: str, payload: Any) -> Any:
    if name == "models" and isinstance(payload, dict):
        models = payload.get("models") or []
        return {"count": len(models), "first": (models[0] if models else {}).get("name") if models else ""}
    if name == "skills" and isinstance(payload, list):
        enabled = sum(1 for item in payload if isinstance(item, dict) and item.get("enabled", True))
        return {"count": len(payload), "enabled": enabled}
    if name == "settings" and isinstance(payload, dict):
        return {"groups": sorted((payload.get("settings") or payload).keys())[:12]}
    if name == "integrations_live" and isinstance(payload, dict):
        services = payload.get("services") or {}
        return {
            service: {
                "configured": bool(info.get("configured")),
                "live_ok": None if info.get("live") is None else bool(info.get("live", {}).get("ok")),
            }
            for service, info in services.items()
        }
    if name == "stats" and isinstance(payload, dict):
        return {
            "cpu": payload.get("cpu_percent"),
            "ram_mb": payload.get("ram_used_mb"),
            "gpu": payload.get("gpu_percent"),
            "tokens_per_second": payload.get("tokens_per_second"),
            "skills": payload.get("active_skills"),
            "souls": [payload.get("souls_online"), payload.get("souls_total")],
        }
    if isinstance(payload, dict):
        return {key: payload.get(key) for key in list(payload.keys())[:8]}
    return str(type(payload).__name__)


if __name__ == "__main__":
    raise SystemExit(main())
