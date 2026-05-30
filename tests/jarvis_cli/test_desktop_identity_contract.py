import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]

VISIBLE_PRODUCT_FILES = [
    ROOT / "README.md",
    ROOT / "pyproject.toml",
    ROOT / "docs" / "JARVIS_MASTER_BLUEPRINT.md",
    ROOT / "docs" / "jarvis" / "index.md",
    ROOT / "ops" / "acp_registry" / "agent.json",
    ROOT / "scripts" / "install.cmd",
    ROOT / "scripts" / "install.ps1",
    ROOT / "scripts" / "install.sh",
    ROOT / "scripts" / "jarvis-gateway",
    ROOT / "docs" / "plans" / "jarvis-already-has-routines.md",
    ROOT / "jarvis_cli" / "data" / "default_SOUL.md",
    ROOT / "jarvis_cli" / "default_soul.py",
    ROOT / "jarvis_cli" / "data" / "souls" / "soul_manifest.json",
    ROOT / "skills" / "autonomous-ai-agents" / "jarvis-agent" / "SKILL.md",
]

_OLD_PREFIX = "Her" + "mes"
_OLD_ORG = "No" + "us"

BANNED_LEGACY_BRAND_TEXT = [
    _OLD_PREFIX,
    _OLD_PREFIX.upper(),
    _OLD_PREFIX.lower(),
    _OLD_ORG,
    _OLD_ORG.upper(),
    (_OLD_ORG + "research").lower(),
    f"{_OLD_PREFIX.lower()}-agent",
    f"{_OLD_PREFIX}CLI",
    f"{_OLD_PREFIX}Claw",
    f"{_OLD_PREFIX.lower()}.local",
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
        legacy_path = ROOT / "skills" / "autonomous-ai-agents" / f"{_OLD_PREFIX.lower()}-agent" / "SKILL.md"
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
        expected_core = {
            "default_SOUL.md",
            "coding_SOUL.md",
            "creative_SOUL.md",
            "research_SOUL.md",
            "work_SOUL.md",
        }
        expected_delegates = {
            "jarvis_SOUL.md",
            "friday_SOUL.md",
            "argus_SOUL.md",
            "forge_SOUL.md",
            "oracle_SOUL.md",
            "atlas_SOUL.md",
            "muse_SOUL.md",
            "sentinel_SOUL.md",
        }
        expected = expected_core | expected_delegates

        self.assertTrue(soul_dir.is_dir())
        self.assertTrue(expected.issubset({path.name for path in soul_dir.glob("*_SOUL.md")}))

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

    def test_soul_manifest_declares_jarvis_as_delegating_assistant(self) -> None:
        manifest_path = ROOT / "jarvis_cli" / "data" / "souls" / "soul_manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

        self.assertEqual(manifest["primary"], "jarvis")
        souls = {soul["id"]: soul for soul in manifest["souls"]}
        self.assertEqual(souls["jarvis"]["role"], "personal_assistant")
        self.assertIn("delegate", " ".join(souls["jarvis"]["responsibilities"]).lower())
        self.assertIn("friday", souls["jarvis"]["delegates"])
        self.assertIn("argus", souls["jarvis"]["delegates"])
        for required in {"friday", "argus", "forge", "oracle", "atlas", "muse", "sentinel"}:
            with self.subTest(required=required):
                self.assertIn(required, souls)
                self.assertTrue((ROOT / souls[required]["template"]).exists())
                self.assertGreaterEqual(len(souls[required]["when_to_use"]), 24)

    def test_jarvis_docs_pack_imports_all_required_sections(self) -> None:
        docs_dir = ROOT / "docs" / "jarvis"
        expected = {
            "index.md",
            "architecture.md",
            "context-files.md",
            "environment-variables.md",
            "mcp-integration.md",
            "memory.md",
            "scheduling.md",
            "security.md",
            "skills-hub.md",
            "social-media-and-platforms.md",
            "tools-and-toolsets.md",
        }

        self.assertTrue(docs_dir.is_dir())
        self.assertTrue(expected.issubset({path.name for path in docs_dir.glob("*.md")}))
        for filename in sorted(expected):
            path = docs_dir / filename
            text = path.read_text(encoding="utf-8")
            with self.subTest(filename=filename):
                self.assertIn("JARVIS", text)
                self.assertGreaterEqual(len(text), 1200)
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
