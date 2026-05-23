import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


class DesktopHomeContractTests(unittest.TestCase):
    def test_app_routes_to_unified_home_and_desktop_nav(self) -> None:
        source = (ROOT / "web" / "src" / "App.tsx").read_text(encoding="utf-8")

        self.assertIn('import HomePage from "@/pages/HomePage"', source)
        self.assertIn('"/": HomePage', source)
        self.assertIn('path: "/"', source)
        self.assertIn('label: "Home"', source)
        self.assertIn('label: "Souls"', source)
        self.assertIn('label: "Workflow"', source)
        self.assertNotIn("RootRedirect", source)

    def test_title_bar_uses_electron_preload_bridge(self) -> None:
        source = (ROOT / "web" / "src" / "components" / "DesktopTitleBar.tsx").read_text(
            encoding="utf-8",
        )

        self.assertIn("window.jarvisDesktop?.windowControl", source)
        self.assertIn("getBackendStatus", source)
        self.assertIn("minimize", source)
        self.assertIn("toggle-maximize", source)
        self.assertIn("close", source)

    def test_home_page_unifies_orb_stats_terminal_and_voice(self) -> None:
        source = (ROOT / "web" / "src" / "pages" / "HomePage.tsx").read_text(
            encoding="utf-8",
        )

        self.assertIn("<JarvisOrb", source)
        self.assertIn("<StatsPanel", source)
        self.assertIn("Voice", source)
        self.assertIn("Quick Task", source)
        self.assertIn("Terminal / Chat Input", source)
        self.assertIn("api.getRuntimeReadiness", source)
        self.assertIn("api.getRuntimeSmokeTest", source)

    def test_home_terminal_embeds_live_chat_pty(self) -> None:
        source = (ROOT / "web" / "src" / "pages" / "HomePage.tsx").read_text(
            encoding="utf-8",
        )

        self.assertIn('import ChatPage from "@/pages/ChatPage"', source)
        self.assertIn("<ChatPage", source)
        self.assertIn("showSidebar={false}", source)
        self.assertIn("showPlugins={false}", source)
        self.assertIn("initialInput={terminalLaunch?.command ?? null}", source)
        self.assertIn("initialInputKey={terminalLaunch?.id ?? null}", source)
        self.assertNotIn("useNavigate", source)
        self.assertNotIn("PTY handoff is queued", source)

    def test_chat_page_accepts_home_prefill_over_pty(self) -> None:
        source = (ROOT / "web" / "src" / "pages" / "ChatPage.tsx").read_text(
            encoding="utf-8",
        )

        self.assertIn("initialInput?: string | null", source)
        self.assertIn("initialInputKey?: number | string | null", source)
        self.assertIn("showSidebar?: boolean", source)
        self.assertIn("showPlugins?: boolean", source)
        self.assertIn("keepAliveWhenInactive?: boolean", source)
        self.assertIn('const routePrefillParam = searchParams.get("prefill");', source)
        self.assertIn("const prefillParam = initialInput ?? routePrefillParam;", source)
        self.assertIn("if (!isActive && !keepAliveWhenInactive) return;", source)
        self.assertIn("const initialInput =", source)
        self.assertIn("ws.send(initialInput)", source)
        self.assertIn('next.delete("prefill")', source)
        self.assertIn("window.history.replaceState", source)

    def test_api_client_exposes_runtime_endpoints_for_home(self) -> None:
        source = (ROOT / "web" / "src" / "lib" / "api.ts").read_text(encoding="utf-8")

        self.assertIn("getRuntimeStats", source)
        self.assertIn('"/api/stats"', source)
        self.assertIn("getRuntimeReadiness", source)
        self.assertIn('"/api/runtime/readiness"', source)
        self.assertIn("getRuntimeSmokeTest", source)
        self.assertIn('"/api/runtime/smoke-test"', source)


if __name__ == "__main__":
    unittest.main()
