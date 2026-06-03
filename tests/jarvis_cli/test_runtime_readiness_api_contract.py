import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SRC_ROOT = ROOT / "src"


class RuntimeReadinessApiContractTests(unittest.TestCase):
    def test_web_server_exposes_runtime_readiness_endpoint(self) -> None:
        source = (SRC_ROOT / "jarvis_cli" / "web_server.py").read_text(encoding="utf-8")

        self.assertIn('@app.get("/api/runtime/readiness")', source)
        self.assertIn("build_runtime_readiness", source)
        self.assertIn("load_env()", source)
        self.assertIn("_runtime_readiness_snapshot", source)

    def test_web_server_exposes_lightweight_desktop_ready_endpoint(self) -> None:
        source = (SRC_ROOT / "jarvis_cli" / "web_server.py").read_text(encoding="utf-8")

        self.assertIn('@app.get("/api/desktop/ready")', source)
        self.assertIn('"/api/desktop/ready"', source)
        self.assertIn('"status": "ready"', source)
        self.assertIn("_PROCESS_STARTED_AT", source)
        self.assertIn('"pid": os.getpid()', source)
        self.assertIn('"parent_pid": os.environ.get("JARVIS_DESKTOP_PARENT_PID", "")', source)
        self.assertIn('"desktop_shutdown_token_bound": bool(_DESKTOP_SHUTDOWN_TOKEN)', source)
        self.assertIn('"desktop_shutdown_token_valid": _has_valid_desktop_shutdown_token(request)', source)

    def test_web_server_exposes_non_blocking_desktop_warmup(self) -> None:
        source = (SRC_ROOT / "jarvis_cli" / "web_server.py").read_text(encoding="utf-8")

        self.assertIn('@app.post("/api/runtime/warmup")', source)
        self.assertIn('@app.get("/api/runtime/warmup")', source)
        self.assertIn("start_desktop_runtime_warmup", source)
        self.assertIn('name="jarvis-desktop-runtime-warmup"', source)
        self.assertIn("_local_model_payload(force_refresh=True)", source)
        self.assertIn("warm_desktop_voice_models", source)
        self.assertIn('_set_desktop_warmup_step("voice", "running"', source)
        self.assertIn('"voice": warmup_payload.get("voice") or {}', source)
        self.assertIn("_DESKTOP_TOKEN_API_PATHS", source)

    def test_web_server_exposes_desktop_bootstrap_endpoint(self) -> None:
        source = (SRC_ROOT / "jarvis_cli" / "web_server.py").read_text(encoding="utf-8")

        self.assertIn('@app.get("/api/desktop/bootstrap")', source)
        self.assertIn('"/api/desktop/bootstrap"', source)
        self.assertIn('"readiness": readiness', source)
        self.assertIn('"cache": "startup-manifest"', source)
        self.assertIn('"cached"', source)
        self.assertIn("_readiness_has_displayable_stt(readiness)", source)
        self.assertIn('stt.get("ready")', source)
        self.assertIn('stt.get("model")', source)

    def test_desktop_readiness_paths_allow_loopback_without_leaking_config(self) -> None:
        source = (SRC_ROOT / "jarvis_cli" / "web_server.py").read_text(encoding="utf-8")

        self.assertIn("_is_loopback_api_client", source)
        self.assertIn("_LOOPBACK_API_CLIENTS", source)
        self.assertIn("path in _DESKTOP_TOKEN_API_PATHS and _is_loopback_api_client(request)", source)
        self.assertIn('"/api/runtime/readiness"', source)
        self.assertIn('"/api/desktop/bootstrap"', source)
        self.assertIn('"/api/config/defaults"', source)


if __name__ == "__main__":
    unittest.main()
