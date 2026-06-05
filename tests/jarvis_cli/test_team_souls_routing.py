import tempfile
import unittest
from pathlib import Path

from jarvis_cli.runtime_stats import collect_runtime_stats
from jarvis_cli.soul_registry import (
    build_soul_routed_prompt,
    build_soul_system_context,
    classify_prompt_soul,
)


class TeamSoulsRoutingTests(unittest.TestCase):
    def test_classifies_prompt_to_specialist_from_manifest_keywords(self) -> None:
        route = classify_prompt_soul("Please debug the TypeScript build and patch the failing tests.")

        self.assertEqual(route["id"], "friday")
        self.assertEqual(route["role"], "software_engineering")
        self.assertIn("jarvis", route["delegates"])

    def test_routed_prompt_injects_specialist_context_without_losing_request(self) -> None:
        route = classify_prompt_soul("Package the exe and validate the installer.")
        prompt = build_soul_routed_prompt("Package the exe and validate the installer.", route)

        self.assertIn("Active soul: FORGE", prompt)
        self.assertIn("User request:\nPackage the exe and validate the installer.", prompt)
        self.assertIn("Operate like a coordinated team", prompt)

    def test_system_context_can_route_gateway_without_polluting_user_message(self) -> None:
        route = classify_prompt_soul("Send this through Telegram and monitor replies.")
        context = build_soul_system_context(route)

        self.assertIn("JARVIS team routing context:", context)
        self.assertIn("Active soul:", context)
        self.assertIn("Available collaborators:", context)
        self.assertIn("Operate like a coordinated team", context)
        self.assertNotIn("User request:", context)

    def test_gateway_runner_applies_team_context_as_ephemeral_system_prompt(self) -> None:
        source = (
            Path(__file__).resolve().parents[2] / "src" / "gateway" / "run.py"
        ).read_text(encoding="utf-8")

        self.assertIn("def _build_team_routing_context", source)
        self.assertIn("build_soul_system_context", source)
        self.assertIn("record_team_activity", source)
        self.assertIn("team_context, selected_team_soul = self._build_team_routing_context(message)", source)
        self.assertIn("combined_ephemeral = (combined_ephemeral + \"\\n\\n\" + team_context).strip()", source)
        self.assertIn("ephemeral_system_prompt=team_context or None", source)

    def test_runtime_stats_reads_persisted_active_soul_from_desktop_turn(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            home = Path(temp_dir)
            (home / "stats.json").write_text(
                """
                {
                  "tokens_total_lifetime": 44,
                  "desktop_current_tokens": {
                    "input": 20,
                    "output": 24,
                    "active_soul": "forge",
                    "delegate_souls": ["jarvis", "friday"]
                  }
                }
                """,
                encoding="utf-8",
            )

            stats = collect_runtime_stats(
                home,
                psutil_module=None,
                started_at=10.0,
                now=lambda: 12.0,
            )

        self.assertEqual(stats["active_soul"], "forge")
        self.assertEqual(stats["delegate_souls"][:2], ["jarvis", "friday"])
