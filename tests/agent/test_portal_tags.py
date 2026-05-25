"""Tests for agent.portal_tags — JARVIS Managed request tag contract."""

from __future__ import annotations


def test_jarvis_client_tag_includes_current_version():
    """The client tag must reflect jarvis_cli.__version__ verbatim."""
    from jarvis_cli import __version__
    from agent.portal_tags import jarvis_client_tag

    assert jarvis_client_tag() == f"client=jarvis-client-v{__version__}"


def test_jarvis_client_tag_format():
    """The client tag has the exact shape JARVIS Managed expects."""
    from agent.portal_tags import jarvis_client_tag

    tag = jarvis_client_tag()
    assert tag.startswith("client=jarvis-client-v")
    # No spaces, no commas — single tag value
    assert " " not in tag
    assert "," not in tag


def test_jarvis_managed_portal_tags_contains_product_and_client():
    """Every JARVIS Managed request gets BOTH the product tag and the version tag."""
    from agent.portal_tags import jarvis_client_tag, jarvis_managed_portal_tags

    tags = jarvis_managed_portal_tags()
    assert "product=jarvis-agent" in tags
    assert jarvis_client_tag() in tags
    assert len(tags) == 2


def test_jarvis_managed_portal_tags_returns_fresh_list():
    """Callers mutate the returned list; we must not share state across calls."""
    from agent.portal_tags import jarvis_managed_portal_tags

    a = jarvis_managed_portal_tags()
    a.append("client=test-mutation")
    b = jarvis_managed_portal_tags()
    assert "client=test-mutation" not in b


def test_auxiliary_client_jarvis_managed_extra_body_uses_helper():
    """auxiliary_client.JARVIS_MANAGED_EXTRA_BODY must match the canonical helper output."""
    from agent.auxiliary_client import JARVIS_MANAGED_EXTRA_BODY
    from agent.portal_tags import jarvis_managed_portal_tags

    assert JARVIS_MANAGED_EXTRA_BODY == {"tags": jarvis_managed_portal_tags()}


def test_jarvis_managed_provider_profile_uses_helper():
    """The JARVIS Managed provider profile (main agent loop) must use the canonical tags."""
    from agent.portal_tags import jarvis_managed_portal_tags
    from providers import get_provider_profile

    profile = get_provider_profile("jarvis_managed")
    assert profile is not None
    body = profile.build_extra_body()
    assert body["tags"] == jarvis_managed_portal_tags()
