import unittest


class SoulRegistryTests(unittest.TestCase):
    def test_registry_loads_primary_and_delegate_souls(self) -> None:
        from jarvis_cli.soul_registry import load_soul_registry

        registry = load_soul_registry()

        self.assertEqual(registry.primary.id, "jarvis")
        self.assertEqual(registry.primary.role, "personal_assistant")
        self.assertIn("friday", registry.primary.delegates)
        self.assertIn("argus", registry.primary.delegates)
        self.assertGreaterEqual(len(registry.delegates), 7)

    def test_router_selects_specialist_from_task_text(self) -> None:
        from jarvis_cli.soul_registry import choose_delegate_for_task, load_soul_registry

        registry = load_soul_registry()

        self.assertEqual(choose_delegate_for_task("review this code and patch the failing tests", registry).id, "friday")
        self.assertEqual(choose_delegate_for_task("watch the logs, check security, and flag suspicious access", registry).id, "argus")
        self.assertEqual(choose_delegate_for_task("summarize my day and answer a general question", registry).id, "jarvis")


if __name__ == "__main__":
    unittest.main()
