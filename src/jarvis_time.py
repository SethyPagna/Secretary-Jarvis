"""Compatibility clock module for JARVIS runtime prompts.

Some inherited agent internals import ``jarvis_time`` as a top-level module.
The actual implementation lives in ``jarvis_cli.time_utils``; this shim keeps
desktop, gateway, cron, and packaged runtime imports on the same code path.
"""

from __future__ import annotations

from jarvis_cli.time_utils import get_timezone, now

__all__ = ["get_timezone", "now", "reset_cache"]


def reset_cache() -> None:
    """Reset the cached timezone resolution in ``jarvis_cli.time_utils``."""
    from jarvis_cli import time_utils

    time_utils._cached_tz = None
    time_utils._cached_tz_name = None
    time_utils._cache_resolved = False
