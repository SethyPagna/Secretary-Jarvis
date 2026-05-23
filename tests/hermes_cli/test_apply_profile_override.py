"""Regression tests for _apply_profile_override JARVIS_HOME guard (issue #22502).

When JARVIS_HOME is set to the jarvis root (e.g. systemd hardcodes
JARVIS_HOME=/root/.jarvis), _apply_profile_override must still read
active_profile and update JARVIS_HOME to the profile directory.

When JARVIS_HOME is already a profile directory (.../profiles/<name>),
_apply_profile_override must trust it and return without re-reading
active_profile (child-process inheritance contract).
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest


def _run_apply_profile_override(
    tmp_path, monkeypatch, *, hermes_home: str | None, active_profile: str | None,
    argv: list[str] | None = None,
):
    """Run _apply_profile_override in isolation.

    Returns the value of os.environ["JARVIS_HOME"] after the call,
    or None if unset.
    """
    hermes_root = tmp_path / ".jarvis"
    hermes_root.mkdir(parents=True, exist_ok=True)

    if active_profile is not None:
        (hermes_root / "active_profile").write_text(active_profile)

    if active_profile and active_profile != "default":
        (hermes_root / "profiles" / active_profile).mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    if hermes_home is not None:
        monkeypatch.setenv("JARVIS_HOME", hermes_home)
    else:
        monkeypatch.delenv("JARVIS_HOME", raising=False)

    monkeypatch.setattr(sys, "argv", argv or ["jarvis", "gateway", "start"])

    from jarvis_cli.main import _apply_profile_override
    _apply_profile_override()

    return os.environ.get("JARVIS_HOME")


class TestApplyProfileOverrideHermesHomeGuard:
    """Regression guard for issue #22502.

    Verifies that JARVIS_HOME pointing to the jarvis root does NOT suppress
    the active_profile check, while JARVIS_HOME already pointing to a
    profile directory IS trusted as-is.
    """

    def test_hermes_home_at_root_with_active_profile_is_redirected(
        self, tmp_path, monkeypatch
    ):
        """JARVIS_HOME=/root/.jarvis + active_profile=coder must redirect
        JARVIS_HOME to .../profiles/coder.

        Bug scenario from #22502: systemd sets JARVIS_HOME to the jarvis root
        and the user switches to a profile via `jarvis profile use`.
        Before the fix, the guard returned early and active_profile was ignored.
        """
        hermes_root = tmp_path / ".jarvis"
        hermes_root.mkdir(parents=True, exist_ok=True)

        result = _run_apply_profile_override(
            tmp_path,
            monkeypatch,
            hermes_home=str(hermes_root),
            active_profile="coder",
        )

        assert result is not None, "JARVIS_HOME must be set after profile redirect"
        assert "profiles" in result, (
            f"Expected JARVIS_HOME to point into profiles/ dir, got: {result!r}"
        )
        assert result.endswith("coder"), (
            f"Expected JARVIS_HOME to end with 'coder', got: {result!r}"
        )

    def test_hermes_home_already_profile_dir_is_trusted(self, tmp_path, monkeypatch):
        """JARVIS_HOME=.../profiles/coder must not be overridden even when
        active_profile says something different.

        Preserves the child-process inheritance contract: a subprocess spawned
        with JARVIS_HOME already set to a specific profile must stay in that
        profile.
        """
        hermes_root = tmp_path / ".jarvis"
        profile_dir = hermes_root / "profiles" / "coder"
        profile_dir.mkdir(parents=True, exist_ok=True)

        (hermes_root / "active_profile").write_text("other")

        monkeypatch.setattr(Path, "home", lambda: tmp_path)
        monkeypatch.setenv("JARVIS_HOME", str(profile_dir))
        monkeypatch.setattr(sys, "argv", ["jarvis", "gateway", "start"])

        from jarvis_cli.main import _apply_profile_override
        _apply_profile_override()

        assert os.environ.get("JARVIS_HOME") == str(profile_dir), (
            "JARVIS_HOME must remain unchanged when already pointing to a profile dir"
        )

    def test_hermes_home_unset_reads_active_profile(self, tmp_path, monkeypatch):
        """Classic case: JARVIS_HOME unset + active_profile=coder must set
        JARVIS_HOME to the profile directory (existing behaviour must not regress).
        """
        result = _run_apply_profile_override(
            tmp_path,
            monkeypatch,
            hermes_home=None,
            active_profile="coder",
        )

        assert result is not None
        assert "coder" in result

    def test_hermes_home_unset_default_profile_no_redirect(self, tmp_path, monkeypatch):
        """active_profile=default must not redirect JARVIS_HOME."""
        hermes_root = tmp_path / ".jarvis"
        hermes_root.mkdir(parents=True, exist_ok=True)

        monkeypatch.setattr(Path, "home", lambda: tmp_path)
        monkeypatch.delenv("JARVIS_HOME", raising=False)
        monkeypatch.setattr(sys, "argv", ["jarvis", "gateway", "start"])
        (hermes_root / "active_profile").write_text("default")

        from jarvis_cli.main import _apply_profile_override
        _apply_profile_override()

        assert os.environ.get("JARVIS_HOME") is None
