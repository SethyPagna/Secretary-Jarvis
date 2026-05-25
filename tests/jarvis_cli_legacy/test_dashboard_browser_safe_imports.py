"""Static dashboard tests for browser-safe @jarvis_managed-research/ui imports."""
from pathlib import Path


WEB_SRC = Path(__file__).resolve().parents[2] / "web" / "src"


def test_dashboard_does_not_import_jarvis_managed_ui_root_barrel():
    offenders = []
    for ext in ("*.tsx", "*.ts"):
        for path in WEB_SRC.rglob(ext):
            content = path.read_text(encoding="utf-8")
            if 'from "@jarvis_managed-research/ui"' in content or "from '@jarvis_managed-research/ui'" in content:
                offenders.append(str(path.relative_to(WEB_SRC)))

    assert offenders == []
