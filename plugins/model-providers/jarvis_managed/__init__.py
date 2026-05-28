"""JARVIS Managed provider profile."""

from typing import Any

from agent.portal_tags import jarvis_managed_portal_tags
from providers import register_provider
from providers.base import ProviderProfile


class JarvisManagedProfile(ProviderProfile):
    """JARVIS Managed — product tags, reasoning with JARVIS Managed-specific omission."""

    def build_extra_body(
        self, *, session_id: str | None = None, **context
    ) -> dict[str, Any]:
        return {"tags": jarvis_managed_portal_tags()}

    def build_api_kwargs_extras(
        self,
        *,
        reasoning_config: dict | None = None,
        supports_reasoning: bool = False,
        **context,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        """JARVIS Managed: passes full reasoning_config, but OMITS when disabled."""
        extra_body = {}
        if supports_reasoning:
            if reasoning_config is not None:
                rc = dict(reasoning_config)
                if rc.get("enabled") is False:
                    pass  # JARVIS Managed omits reasoning when disabled
                else:
                    extra_body["reasoning"] = rc
            else:
                extra_body["reasoning"] = {"enabled": True, "effort": "medium"}
        return extra_body, {}


jarvis_managed = JarvisManagedProfile(
    name="jarvis_managed",
    aliases=("jarvis_managed-portal", "jarvisproject"),
    env_vars=("JARVIS_MANAGED_API_KEY",),
    display_name="JARVIS Project",
    description="JARVIS Project — Jarvis model family",
    signup_url="https://jarvis.local/",
    fallback_models=(
        "jarvis-3-405b",
        "jarvis-3-70b",
    ),
    base_url="https://inference.jarvis.local/v1",
    auth_type="oauth_device_code",
)

register_provider(jarvis_managed)
