import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MODELS_PAGE = ROOT / "desktop" / "web" / "src" / "pages" / "ModelsPage.tsx"


class DesktopModelsContractTests(unittest.TestCase):
    def test_model_assignment_menu_stays_compact_and_bounded(self) -> None:
        source = MODELS_PAGE.read_text(encoding="utf-8")

        self.assertIn('className="relative min-w-0 shrink-0"', source)
        self.assertIn("whitespace-nowrap", source)
        self.assertIn("w-[min(15rem,calc(100vw-3rem))]", source)
        self.assertIn("max-w-[calc(100vw-3rem)]", source)
        self.assertIn("flex w-full min-w-0 items-center justify-between gap-3", source)
        self.assertIn('<span className="truncate">All auxiliary tasks</span>', source)
        self.assertIn('<span className="truncate">{t.label}</span>', source)


if __name__ == "__main__":
    unittest.main()
