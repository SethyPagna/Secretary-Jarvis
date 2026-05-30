# JARVIS Ops

Operational files live here: packaging specs, desktop build scripts, smoke checks,
and runtime helper processes used by the packaged app.

- `scripts/` contains internal build, verification, icon, wheelhouse, renderer
  smoke, and WhatsApp bridge helpers.
- `packaging/` contains PyInstaller and packaging constraints.

Public installer entrypoints stay in the root `scripts/` folder because release
docs and raw GitHub install URLs point there.
