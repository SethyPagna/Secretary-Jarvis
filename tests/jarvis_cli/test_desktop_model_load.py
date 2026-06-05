from pathlib import Path

from jarvis_cli import web_server


def test_load_local_gguf_uses_autoconfig_endpoint(monkeypatch, tmp_path):
    model_path = tmp_path / "qwen3.5-9b-q4_k_m.gguf"
    model_path.write_bytes(b"gguf")
    saved = {}

    monkeypatch.setattr(
        web_server,
        "_local_model_payload",
        lambda: {
            "models": [
                {
                    "id": "qwen3.5-9b-q4_k_m",
                    "name": "qwen3.5-9b-q4_k_m",
                    "kind": "llm",
                    "path": str(model_path),
                    "primary_file": str(model_path),
                }
            ]
        },
    )
    monkeypatch.setattr(web_server, "load_config", lambda: {"providers": {}})
    monkeypatch.setattr(web_server, "save_config", lambda cfg: saved.update(cfg))
    monkeypatch.setenv("JARVIS_ACTIVE_GGUF_MODEL_PATH", "")
    monkeypatch.setattr(
        "jarvis_cli.runtime_autoconfig.build_runtime_autoconfig_plan",
        lambda _cfg: {"llm": {"endpoint": "http://127.0.0.1:8081/v1"}},
    )

    result = web_server.load_local_model(Path(model_path).stem)

    assert result["ok"] is True
    assert saved["model"]["provider"] == "llama_cpp_local"
    assert saved["providers"]["llama_cpp_local"]["base_url"] == "http://127.0.0.1:8081/v1"
