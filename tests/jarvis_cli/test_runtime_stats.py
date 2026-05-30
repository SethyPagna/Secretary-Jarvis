import tempfile
import unittest
import json
from pathlib import Path
from types import SimpleNamespace

from jarvis_cli.runtime_stats import collect_runtime_stats


class FakeProcess:
    def cpu_percent(self, interval=None):
        return 7.25

    def memory_info(self):
        return SimpleNamespace(rss=321 * 1024 * 1024)


class FakePsutil:
    def Process(self, pid):
        self.pid = pid
        return FakeProcess()

    def cpu_percent(self, interval=None):
        return 18.5

    def virtual_memory(self):
        return SimpleNamespace(used=4096 * 1024 * 1024, total=16384 * 1024 * 1024)

    def boot_time(self):
        return 1_700_000_000

    def sensors_temperatures(self):
        return {
            "coretemp": [
                SimpleNamespace(label="Package id 0", current=52.4),
            ],
        }


class RuntimeStatsTests(unittest.TestCase):
    def test_collect_runtime_stats_normalizes_process_system_and_tokens(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            home = Path(temp_dir)
            (home / "stats.json").write_text(
                '{"tokens_total_lifetime": 123456}',
                encoding="utf-8",
            )

            stats = collect_runtime_stats(
                home,
                token_counter={"input": 120, "output": 34},
                gateway_status={"connections": 3},
                active_skills=9,
                psutil_module=FakePsutil(),
                process_id=777,
                started_at=1000.0,
                now=lambda: 1065.0,
            )

        self.assertEqual(stats["type"], "stats")
        self.assertEqual(stats["cpu_percent"], 18.5)
        self.assertEqual(stats["process_cpu_percent"], 7.25)
        self.assertEqual(stats["ram_used_mb"], 4096)
        self.assertEqual(stats["ram_total_mb"], 16384)
        self.assertEqual(stats["process_ram_mb"], 321)
        self.assertEqual(stats["cpu_temp_c"], 52.4)
        self.assertEqual(stats["tokens_input"], 120)
        self.assertEqual(stats["tokens_output"], 34)
        self.assertEqual(stats["tokens_per_second"], 0.0)
        self.assertEqual(stats["tokens_total_lifetime"], 123456)
        self.assertEqual(stats["active_skills"], 9)
        self.assertEqual(stats["gateway_connections"], 3)
        self.assertGreaterEqual(stats["souls_total"], 1)
        self.assertEqual(stats["souls_online"], stats["souls_total"])
        self.assertEqual(stats["active_soul"], "jarvis")
        self.assertIn("hardware_status", stats)
        self.assertEqual(stats["uptime_seconds"], 65)

    def test_collect_runtime_stats_degrades_without_psutil(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            stats = collect_runtime_stats(
                Path(temp_dir),
                psutil_module=None,
                started_at=10.0,
                now=lambda: 12.0,
            )

        self.assertEqual(stats["cpu_percent"], None)
        self.assertEqual(stats["ram_used_mb"], None)
        self.assertEqual(stats["tokens_total_lifetime"], 0)
        self.assertIn("psutil is not available", stats["warnings"])

    def test_collect_runtime_stats_reads_desktop_current_tokens(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            home = Path(temp_dir)
            (home / "stats.json").write_text(
                '{"tokens_total_lifetime": 99, "desktop_current_tokens": {"input": 12, "output": 8}}',
                encoding="utf-8",
            )

            stats = collect_runtime_stats(
                home,
                psutil_module=None,
                started_at=10.0,
                now=lambda: 12.0,
            )

        self.assertEqual(stats["tokens_input"], 12)
        self.assertEqual(stats["tokens_output"], 8)
        self.assertEqual(stats["tokens_total_lifetime"], 99)

    def test_collect_runtime_stats_reports_live_token_throughput(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            home = Path(temp_dir)

            first = collect_runtime_stats(
                home,
                token_counter={"input": 10, "output": 5},
                psutil_module=None,
                started_at=0.0,
                now=lambda: 100.0,
            )
            second = collect_runtime_stats(
                home,
                token_counter={"input": 40, "output": 25},
                psutil_module=None,
                started_at=0.0,
                now=lambda: 105.0,
            )

        self.assertEqual(first["tokens_per_second"], 0.0)
        self.assertEqual(second["tokens_per_second"], 10.0)

    def test_desktop_chat_records_current_and_lifetime_tokens(self) -> None:
        from jarvis_cli.desktop_chat import _record_desktop_tokens

        with tempfile.TemporaryDirectory() as temp_dir:
            home = Path(temp_dir)
            (home / "stats.json").write_text(
                json.dumps({"tokens_total_lifetime": 30}),
                encoding="utf-8",
            )

            _record_desktop_tokens(
                home,
                input_tokens=4,
                output_tokens=6,
                model="qwen-local",
                provider="llama.cpp",
            )

            payload = json.loads((home / "stats.json").read_text(encoding="utf-8"))

        self.assertEqual(payload["tokens_total_lifetime"], 40)
        self.assertEqual(payload["desktop_current_tokens"]["input"], 4)
        self.assertEqual(payload["desktop_current_tokens"]["output"], 6)
        self.assertEqual(payload["desktop_current_tokens"]["model"], "qwen-local")
        self.assertEqual(payload["desktop_current_tokens"]["provider"], "llama.cpp")


if __name__ == "__main__":
    unittest.main()
