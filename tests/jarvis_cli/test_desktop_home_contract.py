import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WEB_ROOT = ROOT / "desktop" / "web"
SRC_ROOT = ROOT / "src"


class DesktopHomeContractTests(unittest.TestCase):
    def test_app_routes_to_unified_home_and_desktop_nav(self) -> None:
        source = (WEB_ROOT / "src" / "App.tsx").read_text(encoding="utf-8")

        self.assertIn('const HomePage = lazy(() => import("@/pages/HomePage"))', source)
        self.assertIn("<Suspense", source)
        self.assertIn('"/": HomePage', source)
        self.assertIn('path: "/"', source)
        self.assertIn('label: "Home"', source)
        self.assertIn('label: "Souls"', source)
        self.assertIn('label: "Workflow"', source)
        self.assertNotIn("RootRedirect", source)

    def test_title_bar_uses_electron_preload_bridge(self) -> None:
        source = (WEB_ROOT / "src" / "components" / "DesktopTitleBar.tsx").read_text(
            encoding="utf-8",
        )

        self.assertIn("window.jarvisDesktop?.windowControl", source)
        self.assertIn("getBackendStatus", source)
        self.assertIn("minimize", source)
        self.assertIn("toggle-maximize", source)
        self.assertIn("close", source)

    def test_title_bar_notification_button_opens_drawer(self) -> None:
        source = (WEB_ROOT / "src" / "components" / "DesktopTitleBar.tsx").read_text(
            encoding="utf-8",
        )

        self.assertIn("notificationsOpen", source)
        self.assertIn("setNotificationsOpen((value) => !value)", source)
        self.assertIn('aria-expanded={notificationsOpen}', source)
        self.assertIn('id="jarvis-notification-drawer"', source)
        self.assertIn("Notification centre", source)

    def test_home_page_unifies_orb_stats_terminal_and_voice(self) -> None:
        source = (WEB_ROOT / "src" / "pages" / "HomePage.tsx").read_text(
            encoding="utf-8",
        )

        self.assertIn("<JarvisOrb", source)
        self.assertIn("<StatsPanel", source)
        self.assertIn("Voice", source)
        self.assertIn("Steering", source)
        self.assertIn("Terminal / Chat Input", source)
        self.assertIn("api.getRuntimeReadiness", source)
        self.assertIn("api.getRuntimeSmokeTest", source)

    def test_home_quick_actions_are_stateful_not_placeholders(self) -> None:
        source = (WEB_ROOT / "src" / "pages" / "HomePage.tsx").read_text(
            encoding="utf-8",
        )

        self.assertIn("fileInputRef", source)
        self.assertIn("handleAttachmentChange", source)
        self.assertIn("fileInputRef.current?.click()", source)
        self.assertIn('aria-label="Attach files"', source)
        self.assertNotIn("quickTaskOpen", source)
        self.assertNotIn("handleQuickTaskSubmit", source)
        self.assertIn("toolsOpen", source)
        self.assertIn("statsVisible", source)
        self.assertIn("setStatsVisible((value) => !value)", source)
        self.assertNotIn('<QuickAction label="Attach" icon={Paperclip} />', source)
        self.assertNotIn('<QuickAction label="Tools" icon={Settings2} />', source)
        self.assertNotIn('<QuickAction label="Stats" icon={Gauge} />', source)

    def test_home_terminal_uses_desktop_native_command_endpoint(self) -> None:
        source = (WEB_ROOT / "src" / "pages" / "HomePage.tsx").read_text(
            encoding="utf-8",
        )
        api_source = (WEB_ROOT / "src" / "lib" / "api.ts").read_text(
            encoding="utf-8",
        )
        server_source = (SRC_ROOT / "jarvis_cli" / "web_server.py").read_text(
            encoding="utf-8",
        )

        self.assertNotIn('import ChatPage from "@/pages/ChatPage"', source)
        self.assertNotIn("<ChatPage", source)
        self.assertIn("api.runTerminalCommand", source)
        self.assertIn('"/api/terminal/run"', api_source)
        self.assertIn('@app.post("/api/terminal/run")', server_source)
        self.assertNotIn("useNavigate", source)
        self.assertNotIn("PTY handoff is queued", source)

    def test_api_client_exposes_runtime_endpoints_for_home(self) -> None:
        source = (WEB_ROOT / "src" / "lib" / "api.ts").read_text(encoding="utf-8")

        self.assertIn("getRuntimeStats", source)
        self.assertIn('"/api/stats"', source)
        self.assertIn("getRuntimeReadiness", source)
        self.assertIn('"/api/runtime/readiness"', source)
        self.assertIn("getRuntimeSmokeTest", source)
        self.assertIn('"/api/runtime/smoke-test"', source)

    def test_home_voice_records_transcribes_and_dispatches_to_live_terminal(self) -> None:
        source = (WEB_ROOT / "src" / "pages" / "HomePage.tsx").read_text(
            encoding="utf-8",
        )

        self.assertIn("new MediaRecorder", source)
        self.assertIn("voiceChunksRef", source)
        self.assertIn("api.transcribeVoice", source)
        self.assertNotIn("setTerminalInput(transcript)", source)
        self.assertIn('runDesktopAgentTurn(transcript, "voice")', source)
        self.assertNotIn("text: transcript", source)
        self.assertIn("JARVIS is hearing you", source)
        self.assertIn("Voice is live", source)
        self.assertIn("I did not catch that. Listening again.", source)
        self.assertIn("const VOICE_SPEECH_THRESHOLD = 0.035", source)
        self.assertIn("const VOICE_MAX_NO_SPEECH_MS = 30_000", source)
        self.assertIn("requestInitialPermission", source)
        self.assertIn('permission.state === "granted"', source)
        self.assertNotIn('permission.state !== "granted"', source)
        self.assertNotIn("await navigator.mediaDevices?.getUserMedia({ audio: true });\n      setListening(true);", source)

    def test_home_voice_output_synthesizes_live_assistant_output(self) -> None:
        home_source = (WEB_ROOT / "src" / "pages" / "HomePage.tsx").read_text(
            encoding="utf-8",
        )

        self.assertIn("api.synthesizeSpeech", home_source)
        self.assertIn("queueVoiceDelta", home_source)
        self.assertIn("audioPlayerRef", home_source)
        self.assertIn("api.streamDesktopChat", home_source)
        self.assertNotIn("awaitingVoiceResponseRef", home_source)

    def test_home_uses_desktop_agent_stream_for_plain_language(self) -> None:
        home_source = (WEB_ROOT / "src" / "pages" / "HomePage.tsx").read_text(
            encoding="utf-8",
        )
        api_source = (WEB_ROOT / "src" / "lib" / "api.ts").read_text(
            encoding="utf-8",
        )
        server_source = (SRC_ROOT / "jarvis_cli" / "web_server.py").read_text(
            encoding="utf-8",
        )

        self.assertIn("isExplicitShellCommand", home_source)
        self.assertIn("api.streamDesktopChat", home_source)
        self.assertIn("/api/desktop/chat/stream", api_source)
        self.assertIn('@app.post("/api/desktop/chat/stream")', server_source)
        self.assertIn("run_desktop_chat_turn", server_source)

    def test_api_client_exposes_voice_stt_and_tts_endpoints(self) -> None:
        source = (WEB_ROOT / "src" / "lib" / "api.ts").read_text(encoding="utf-8")

        self.assertIn("transcribeVoice", source)
        self.assertIn('"/api/voice/transcribe"', source)
        self.assertIn("synthesizeSpeech", source)
        self.assertIn('"/api/voice/synthesize"', source)
        self.assertIn("VoiceTranscriptionResponse", source)
        self.assertIn("VoiceSynthesisResponse", source)

    def test_web_server_exposes_raw_voice_transcription_and_synthesis(self) -> None:
        source = (SRC_ROOT / "jarvis_cli" / "web_server.py").read_text(encoding="utf-8")

        self.assertIn('@app.post("/api/voice/transcribe")', source)
        self.assertIn("await request.body()", source)
        self.assertIn("transcribe_desktop_audio", source)
        self.assertIn('@app.post("/api/voice/synthesize")', source)
        self.assertIn("synthesize_desktop_speech", source)

    def test_orb_and_home_use_unframed_cosmic_scene(self) -> None:
        orb_source = (WEB_ROOT / "src" / "components" / "JarvisOrb.tsx").read_text(
            encoding="utf-8",
        )
        home_source = (WEB_ROOT / "src" / "pages" / "HomePage.tsx").read_text(
            encoding="utf-8",
        )

        self.assertIn("function StarField", orb_source)
        self.assertIn("function NebulaVeil", orb_source)
        self.assertIn("function OrbitRings", orb_source)
        self.assertIn("vertexColors", orb_source)
        self.assertIn("#b86cff", orb_source)
        self.assertIn("overflow-visible", orb_source)
        self.assertNotIn("rounded-md border", orb_source)
        self.assertNotIn("border border-cyan", orb_source)
        self.assertIn("jarvis-cosmic-field", home_source)
        self.assertIn("radial-gradient(circle at 18% 20%", home_source)
        self.assertIn("voiceEnergy", orb_source)
        self.assertIn("tokens/s", home_source)
        self.assertNotIn("lifetime tokens", home_source)
        self.assertNotIn("Input tokens", (WEB_ROOT / "src" / "components" / "StatsPanel.tsx").read_text(encoding="utf-8"))
        self.assertNotIn("Output tokens", (WEB_ROOT / "src" / "components" / "StatsPanel.tsx").read_text(encoding="utf-8"))
        self.assertIn("grid-cols-[minmax(0,1fr)_minmax(0,1fr)]", (WEB_ROOT / "src" / "components" / "StatsPanel.tsx").read_text(encoding="utf-8"))
        self.assertIn("h-[clamp(190px,30dvh,340px)]", home_source)
        self.assertNotIn("rounded-md border border-cyan-200/10 bg-[#080e14]/72", home_source)


if __name__ == "__main__":
    unittest.main()
