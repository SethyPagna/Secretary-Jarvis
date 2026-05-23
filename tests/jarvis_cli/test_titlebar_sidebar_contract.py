import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class TitlebarSidebarContractTests(unittest.TestCase):
    def test_title_bar_receives_sidebar_collapsed_state(self) -> None:
        title_bar = (ROOT / "web" / "src" / "components" / "DesktopTitleBar.tsx").read_text(
            encoding="utf-8",
        )

        self.assertIn("sidebarCollapsed", title_bar)
        self.assertIn("Minimize sidebar", title_bar)
        self.assertIn("Restore sidebar", title_bar)

    def test_app_collapses_desktop_sidebar_to_icon_rail(self) -> None:
        app = (ROOT / "web" / "src" / "App.tsx").read_text(encoding="utf-8")

        self.assertIn("const [sidebarCollapsed, setSidebarCollapsed] = useState(false)", app)
        self.assertIn("setSidebarCollapsed((collapsed) => !collapsed)", app)
        self.assertIn("sidebarCollapsed ? \"lg:w-16\" : \"lg:w-64\"", app)
        self.assertIn("sidebarCollapsed && \"lg:justify-center", app)
        self.assertIn("sidebarCollapsed ? \"lg:hidden\" : \"\"", app)


if __name__ == "__main__":
    unittest.main()
