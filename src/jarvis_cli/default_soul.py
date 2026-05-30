"""Default SOUL.md template seeded into JARVIS_HOME on first run."""

from pathlib import Path


def _load_default_soul() -> str:
    soul_path = Path(__file__).with_name("data") / "default_SOUL.md"
    try:
        return soul_path.read_text(encoding="utf-8")
    except OSError:
        return (
            "You are JARVIS, a desktop-first AI agent focused on useful, "
            "verified assistance across models, voice, workflows, tools, and "
            "memory. Be concise, transparent about blockers, and careful with "
            "permissions and user data."
        )


DEFAULT_SOUL_MD = _load_default_soul()
