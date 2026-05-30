# JARVIS Ops

Operational files live here: packaging specs, desktop build scripts, smoke checks,
and runtime helper processes used by the packaged app.

- `scripts/build/` contains desktop packaging, icon, wheelhouse, and runtime
  staging helpers.
- `scripts/checks/` contains production, dependency, voice, renderer, API-key,
  and WhatsApp bridge smoke checks.
- `scripts/ci/` contains CI-only lint and isolated test runners.
- `scripts/catalog/` contains model and skill catalog refresh tools.
- `scripts/release/` contains release and contributor audit automation.
- `scripts/maintenance/` contains one-off local maintenance and migration tools.
- `packaging/` contains PyInstaller and packaging constraints.
- `config/acp_registry/` contains Agent Client Protocol registry metadata used by
  release automation.

Public installer, gateway, and test-runner entrypoints stay in the root
`scripts/` folder because release docs, raw GitHub install URLs, and
contributor workflows point there.
