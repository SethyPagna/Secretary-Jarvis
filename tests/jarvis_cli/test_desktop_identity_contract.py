import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]

VISIBLE_PRODUCT_FILES = [
    ROOT / "README.md",
    ROOT / "pyproject.toml",
    ROOT / "docs" / "JARVIS_MASTER_BLUEPRINT.md",
    ROOT / "jarvis_cli" / "data" / "default_SOUL.md",
    ROOT / "jarvis_cli" / "default_soul.py",
    ROOT / "skills" / "autonomous-ai-agents" / "jarvis-agent" / "SKILL.md",
]

BANNED_LEGACY_BRAND_TEXT = [
    "Nous Research",
    "NousResearch",
    "nousresearch",
    "nousresearch.com",
    "Hermes Agent",
    "HermesCLI",
    "HermesClaw",
    "hermes-agent",
]


class DesktopIdentityContractTests(unittest.TestCase):
    def test_visible_product_files_use_only_jarvis_identity(self) -> None:
        for path in VISIBLE_PRODUCT_FILES:
            with self.subTest(path=path.relative_to(ROOT)):
                self.assertTrue(path.exists(), f"{path} must exist")
                text = path.read_text(encoding="utf-8")
                for banned in BANNED_LEGACY_BRAND_TEXT:
                    self.assertNotIn(banned, text)

    def test_autonomous_agent_skill_is_rebranded_to_jarvis(self) -> None:
        legacy_path = ROOT / "skills" / "autonomous-ai-agents" / "hermes-agent" / "SKILL.md"
        current_path = ROOT / "skills" / "autonomous-ai-agents" / "jarvis-agent" / "SKILL.md"

        self.assertFalse(legacy_path.exists())
        self.assertTrue(current_path.exists())

        text = current_path.read_text(encoding="utf-8")
        self.assertIn("name: jarvis-agent", text)
        self.assertIn("JARVIS desktop agent", text)
        self.assertIn("local-first", text)
        self.assertNotIn("runs in your terminal", text)

    def test_detailed_soul_templates_exist_for_core_modes(self) -> None:
        soul_dir = ROOT / "jarvis_cli" / "data" / "souls"
        expected = {
            "default_SOUL.md",
            "coding_SOUL.md",
            "creative_SOUL.md",
            "research_SOUL.md",
            "work_SOUL.md",
        }

        self.assertTrue(soul_dir.is_dir())
        self.assertEqual(expected, {path.name for path in soul_dir.glob("*_SOUL.md")})

        for filename in sorted(expected):
            path = soul_dir / filename
            text = path.read_text(encoding="utf-8")
            with self.subTest(filename=filename):
                self.assertIn("# JARVIS", text)
                self.assertIn("## Identity", text)
                self.assertIn("## Operating Style", text)
                self.assertIn("## Voice Profile", text)
                self.assertIn("## Boundaries", text)
                self.assertGreaterEqual(len(text), 900)
                for banned in BANNED_LEGACY_BRAND_TEXT:
                    self.assertNotIn(banned, text)

    def test_skill_markdown_uses_jarvis_project_branding(self) -> None:
        skill_markdown = [
            *ROOT.glob("skills/**/*.md"),
            *ROOT.glob("optional-skills/**/*.md"),
        ]

        self.assertGreater(len(skill_markdown), 0)
        for path in skill_markdown:
            text = path.read_text(encoding="utf-8", errors="ignore")
            with self.subTest(path=path.relative_to(ROOT)):
                for banned in BANNED_LEGACY_BRAND_TEXT:
                    self.assertNotIn(banned, text)


if __name__ == "__main__":
    unittest.main()
