# JARVIS Startup Growth Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make JARVIS open quickly while real AI, STT, TTS, souls, skills, and memory services warm in the background and reuse verified local state across launches.

**Architecture:** The desktop shell renders a blurred loading surface immediately, then shows Home while the backend performs idempotent warmup. The backend persists a startup manifest under `~/.jarvis/startup/` containing the last verified model map, runtime plan, skills count, souls manifest, and memory/context file metadata so the next launch can start from real cached facts and refresh asynchronously.

**Tech Stack:** Electron, React/Vite/TypeScript, FastAPI/Python, llama.cpp, faster-whisper, Kokoro/System TTS, JSON manifest persistence.

---

## Current Progress

- [x] Blurred startup shell appears before backend readiness.
- [x] Home route is eager-loaded so the first useful screen is not delayed by a lazy chunk.
- [x] Electron calls backend warmup after `/api/status`.
- [x] Backend warmup starts local runtime, model readiness, stats, souls, skills, and voice warmup.
- [x] Persist a startup manifest so fresh launches can reuse verified model/soul/memory facts before a full rescan.
- [x] Expose manifest status through `/api/runtime/warmup`.
- [x] Use the manifest as the first source for `/api/models/list` when roots have not changed.
- [x] Add tests proving manifest reuse, stale invalidation, and warmup persistence.
- [x] Show the blurred desktop shell before backend readiness polling, then load the live renderer from the backend once it can inject the session token.
- [x] Skip duplicate packaged backend preflight by default, with `JARVIS_FORCE_BACKEND_PREFLIGHT=1` available for diagnostics.
- [x] Use a lightweight `/api/desktop/ready` probe for Electron startup so gateway/session/status scans do not block the first live renderer load.

## Permanent Startup Strategy

1. **Immediate UI:** Electron loads the local blurred shell first, then swaps to the renderer as soon as files are available.
2. **Fast cached facts:** Backend returns the last persisted model list and runtime summary when root directories match the manifest.
3. **Background refresh:** Warmup refreshes model roots, souls, memory metadata, skills, stats, and voice readiness on a daemon thread.
4. **Real readiness only:** UI can display cached/refreshing/live states separately; no fake GPU temperature, no fake model readiness.
5. **Growth loop:** Memory and souls are treated as living local files. Warmup records their changed timestamps and sizes so JARVIS can detect growth and refresh context without making startup feel clunky.

## Task 2: Unblock First Paint From Backend Warmup

**Files:**
- Modify: `desktop/electron/main.js`
- Test: `tests/jarvis_cli/test_electron_shell_contract.py`

- [x] **Step 1: Paint first**

Show the blurred startup shell immediately after window creation. The live renderer still loads from the backend after readiness so the dashboard receives the server-injected session token and `/api/*` calls remain real.

- [x] **Step 2: Avoid duplicate packaged preflight**

Keep backend preflight for development and diagnostics, but skip it in packaged builds where the backend was already verified during build/smoke. Operators can force it with `JARVIS_FORCE_BACKEND_PREFLIGHT=1` or skip it in development with `JARVIS_SKIP_BACKEND_PREFLIGHT=1`.

- [x] **Step 3: Verify**

Run:

```powershell
py -3.11 -m unittest tests.jarvis_cli.test_electron_shell_contract tests.jarvis_cli.test_desktop_packaging_contract
npm.cmd run desktop:check
```

Expected: the Electron shell contract confirms shell-before-backend-wait ordering, renderer-after-backend-token ordering, and production checks pass.

## Task 3: Replace Heavy Startup Status Polling

**Files:**
- Modify: `src/jarvis_cli/web_server.py`
- Modify: `desktop/electron/main.js`
- Test: `tests/jarvis_cli/test_runtime_readiness_api_contract.py`
- Test: `tests/jarvis_cli/test_electron_shell_contract.py`

- [x] **Step 1: Add a real lightweight backend probe**

Expose `/api/desktop/ready` as a public read-only endpoint that confirms FastAPI is bound, reports version and uptime, and avoids gateway/session/config scans.

- [x] **Step 2: Use the lightweight probe from Electron**

Update `waitForBackend()` and `probeExistingBackend()` to call `/api/desktop/ready` instead of `/api/status`. The dashboard still uses `/api/status` after it is live, so displayed system data remains real.

- [x] **Step 3: Verify**

Run:

```powershell
py -3.11 -m unittest tests.jarvis_cli.test_electron_shell_contract tests.jarvis_cli.test_runtime_readiness_api_contract
npm.cmd run desktop:check
```

Expected: contracts prove the lightweight probe exists and Electron uses it for startup, while production readiness still passes.

## Task 1: Persist Startup Manifest

**Files:**
- Create: `src/jarvis_cli/desktop_startup_manifest.py`
- Modify: `src/jarvis_cli/web_server.py`
- Test: `tests/jarvis_cli/test_desktop_startup_manifest.py`

- [x] **Step 1: Add manifest helpers**

Create a module with `load_startup_manifest`, `write_startup_manifest`, `roots_match_manifest`, and `collect_memory_context_snapshot`.

- [x] **Step 2: Reuse cached model payload**

Update `_local_model_payload()` to read persisted `model_payload` when candidate roots still match the saved root mtimes.

- [x] **Step 3: Persist refreshed warmup**

Update `_run_desktop_runtime_warmup()` to write model payload, runtime plan, skills snapshot, souls manifest, memory snapshot, and warmup errors.

- [x] **Step 4: Surface manifest status**

Return `manifest` metadata from `/api/runtime/warmup` so UI and smoke tests can distinguish cold, cached, and refreshed startup.

- [x] **Step 5: Verify**

Run:

```powershell
py -3.11 -m unittest tests.jarvis_cli.test_desktop_startup_manifest tests.jarvis_cli.test_runtime_readiness_api_contract tests.jarvis_cli.test_electron_shell_contract
npm.cmd run desktop:check
```

Expected: all tests pass and `desktop:check` reports production readiness.
