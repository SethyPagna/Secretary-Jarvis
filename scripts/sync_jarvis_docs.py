"""Build the desktop-first JARVIS documentation pack from local source docs."""

from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = ROOT / "website" / "docs"
TARGET_ROOT = ROOT / "docs" / "jarvis"

DOC_SECTIONS: dict[str, list[str]] = {
    "index.md": [
        "getting-started/quickstart.md",
        "user-guide/features/overview.md",
    ],
    "social-media-and-platforms.md": [
        "user-guide/messaging/index.md",
        "user-guide/messaging/telegram.md",
        "user-guide/messaging/discord.md",
        "user-guide/messaging/whatsapp.md",
        "user-guide/messaging/slack.md",
        "user-guide/messaging/signal.md",
        "user-guide/messaging/email.md",
        "user-guide/skills/bundled/social-media/social-media-xurl.md",
    ],
    "skills-hub.md": [
        "user-guide/features/skills.md",
        "guides/work-with-skills.md",
        "developer-guide/creating-skills.md",
        "reference/skills-catalog.md",
        "reference/optional-skills-catalog.md",
    ],
    "mcp-integration.md": [
        "user-guide/features/mcp.md",
        "guides/use-mcp-with-hermes.md",
        "reference/mcp-config-reference.md",
    ],
    "security.md": [
        "user-guide/security.md",
        "user-guide/features/credential-pools.md",
        "user-guide/features/code-execution.md",
        "user-guide/features/browser.md",
    ],
    "tools-and-toolsets.md": [
        "user-guide/features/tools.md",
        "user-guide/features/tool-gateway.md",
        "reference/tools-reference.md",
        "reference/toolsets-reference.md",
        "developer-guide/adding-tools.md",
    ],
    "memory.md": [
        "user-guide/features/memory.md",
        "user-guide/features/memory-providers.md",
        "developer-guide/memory-provider-plugin.md",
        "developer-guide/session-storage.md",
    ],
    "scheduling.md": [
        "user-guide/features/cron.md",
        "guides/automate-with-cron.md",
        "guides/cron-troubleshooting.md",
        "developer-guide/cron-internals.md",
    ],
    "context-files.md": [
        "user-guide/features/context-files.md",
        "user-guide/features/context-references.md",
        "developer-guide/prompt-assembly.md",
        "developer-guide/context-compression-and-caching.md",
    ],
    "architecture.md": [
        "developer-guide/architecture.md",
        "developer-guide/agent-loop.md",
        "developer-guide/gateway-internals.md",
        "developer-guide/tools-runtime.md",
    ],
    "environment-variables.md": [
        "reference/environment-variables.md",
    ],
}

REPLACEMENTS: tuple[tuple[str, str], ...] = (
    ("Nous Research", "JARVIS Project"),
    ("NousResearch", "JARVISProject"),
    ("nousresearch.com", "jarvis.local"),
    ("nousresearch", "jarvisproject"),
    ("Hermes Agent", "JARVIS"),
    ("HermesCLI", "JarvisDesktopRuntime"),
    ("Hermes", "JARVIS"),
    ("HERMES", "JARVIS"),
    ("hermes-agent", "jarvis-agent"),
    ("hermes", "jarvis"),
)


def rebrand_text(text: str) -> str:
    for old, new in REPLACEMENTS:
        text = text.replace(old, new)
    text = text.replace("jarvis-agent.jarvis.local/docs", "local JARVIS docs")
    text = re.sub(
        r"https://github\.com/JARVISProject/jarvis-agent",
        "https://github.com/SethyPagna/Secretary-Jarvis",
        text,
    )
    text = re.sub(
        r"https://github\.com/NousResearch/jarvis-agent",
        "https://github.com/SethyPagna/Secretary-Jarvis",
        text,
    )
    return text


def read_source(relative: str) -> str:
    path = SOURCE_ROOT / relative
    if not path.exists():
        raise FileNotFoundError(f"Missing source doc: {relative}")
    return rebrand_text(path.read_text(encoding="utf-8"))


def section_title(filename: str) -> str:
    return filename.removesuffix(".md").replace("-", " ").title()


def build_section(filename: str, sources: list[str]) -> str:
    title = "JARVIS Documentation Pack" if filename == "index.md" else section_title(filename)
    parts = [
        f"# {title}",
        "",
        "> Imported from the local source documentation and rewritten for the JARVIS desktop-first app. Run commands from the integrated Home terminal unless a section explicitly refers to packaging or automation.",
        "",
    ]

    if filename == "index.md":
        parts.extend(
            [
                "## Included Sections",
                "",
                *[f"- [{section_title(name)}](./{name})" for name in DOC_SECTIONS if name != "index.md"],
                "",
            ],
        )

    for source in sources:
        source_label = rebrand_text(source)
        parts.extend(
            [
                f"## Source: `{source_label}`",
                "",
                read_source(source).strip(),
                "",
            ],
        )

    return "\n".join(parts).strip() + "\n"


def sync_docs() -> list[Path]:
    TARGET_ROOT.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for filename, sources in DOC_SECTIONS.items():
        target = TARGET_ROOT / filename
        target.write_text(build_section(filename, sources), encoding="utf-8")
        written.append(target)
    return written


if __name__ == "__main__":
    for path in sync_docs():
        print(path.relative_to(ROOT))
