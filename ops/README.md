# JARVIS Ops

Operational files live here: packaging specs, desktop build scripts, smoke checks,
and runtime helper processes used by the packaged app.

- `scripts/` contains internal build, verification, icon, wheelhouse, renderer
  smoke, voice/model diagnostics, maintenance, and WhatsApp bridge helpers.
- `packaging/` contains PyInstaller and packaging constraints.
- `acp_registry/` contains Agent Client Protocol registry metadata used by
  release automation.

Public installer entrypoints stay in the root `scripts/` folder because release
docs and raw GitHub install URLs point there.
