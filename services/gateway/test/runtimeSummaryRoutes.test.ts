import { describe, expect, it } from "vitest";
import type { RuntimeConstellation, RuntimeServicesStatus, RuntimeSmokeStatus } from "@jarvis/core";
import { tryHandleRuntimeSummaryRoute } from "../src/routes/runtimeSummaryRoutes.js";
import type { JarvisStore } from "../src/store.js";

describe("runtime summary routes", () => {
  it("handles read-only runtime constellation, smoke, and service summaries", async () => {
    const sent: Array<{ statusCode: number; body: unknown }> = [];
    const constellation: RuntimeConstellation = {
      id: "runtime-constellation",
      localOnly: true,
      updatedAt: "2026-05-16T00:00:00.000Z",
      nodes: [],
      summary: { ready: 0, staged: 0, attention: 0, locked: 0 },
      note: "test",
    };
    const smoke: RuntimeSmokeStatus = {
      ok: true,
      status: "passed",
      summaryPath: "data/smoke/runtime-smoke-latest.json",
      createdAt: "2026-05-16T00:00:00.000Z",
      checks: [],
      message: "passed",
    };
    const services: RuntimeServicesStatus = {
      localOnly: true,
      checkedAt: "2026-05-16T00:00:00.000Z",
      services: [],
      summary: { online: 0, degraded: 0, offline: 0, unknown: 0 },
      note: "read only",
    };

    const params = {
      method: "GET",
      now: () => "2026-05-16T00:00:00.000Z",
      sendJson: (statusCode: number, body: unknown) => sent.push({ statusCode, body }),
      runtimeConstellation: () => constellation,
      runtimeSmokeStatus: () => smoke,
      runtimeServicesStatus: () => Promise.resolve(services),
      packagingReadiness: () => ({
        generatedAt: "2026-05-16T00:00:00.000Z",
        root: "C:/jarvis",
        electron: {
          ready: true,
          packageJson: "C:/jarvis/apps/hud/package.json",
          mainEntry: "C:/jarvis/apps/hud/electron/main.ts",
          rendererBuild: "C:/jarvis/apps/hud/dist/index.html",
          mainBuild: "C:/jarvis/apps/hud/dist-electron/main.js",
          releaseFolder: "C:/jarvis/apps/hud/release",
          commands: ["npm.cmd run dist:hud"],
          note: "ready",
        },
        tauriFallback: {
          ready: false,
          configPath: "C:/jarvis/apps/desktop/src-tauri/tauri.conf.json",
          commands: ["npm.cmd run dev:tauri"],
          note: "fallback",
        },
        startup: {
          startScript: "C:/jarvis/scripts/start-jarvis.ps1",
          stopScript: "C:/jarvis/scripts/stop-jarvis.ps1",
          registerScript: "C:/jarvis/scripts/register-startup-task.ps1",
          checkOnlyCommand: "powershell -File scripts\\register-startup-task.ps1 -CheckOnly",
          standardRegisterCommand: "powershell -File scripts\\register-startup-task.ps1",
          elevatedRegisterCommand: "powershell -File scripts\\register-startup-task.ps1 -Elevated",
          note: "read only",
        },
        backgroundRuntime: {
          pidFolder: "C:/jarvis/data/runtime",
          logFolder: "C:/jarvis/data/logs",
          expectedProcesses: ["electron.exe"],
          wakeMethods: [{ id: "orb-click", label: "Orb click", status: "ready", detail: "ready" }],
        },
        summary: {
          electronShellReady: true,
          tauriFallbackReady: false,
          startupScriptsReady: true,
          productionCommandsReady: true,
        },
        recommendations: ["Use check-only startup commands first."],
      }),
      processVisibilityStatus: () => ({
        generatedAt: "2026-05-16T00:00:00.000Z",
        runtimeRoot: "data/runtime",
        services: [],
        summary: { tracked: 5, pidFilesPresent: 1, alive: 1, visibleInTaskManager: 1 },
        note: "read only",
      }),
      startupRegistrationPlans: () => ({
        generatedAt: "2026-05-16T00:00:00.000Z",
        root: "C:/jarvis",
        plans: [],
        note: "Dry-run registration plans only.",
      }),
      wakeRuntimeActivation: () => ({
        generatedAt: "2026-05-16T00:00:00.000Z",
        root: "C:/jarvis",
        localOnly: true,
        wake: {
          methods: [],
          summary: { ready: 2, staged: 1, approvalGated: 1 },
          privacyNote: "mic locked",
        },
        voice: {
          primaryStt: "ready",
          vad: "staged",
          wakeWord: "missing",
          ttsReady: true,
          sampleCount: 4,
          note: "manual voice ready",
        },
        ollama: {
          status: "found-off-path",
          command: "ollama",
          detectedPath: "C:/Ollama/ollama.exe",
          endpoint: "http://127.0.0.1:11434",
          repairCommands: ["Add Ollama to PATH"],
          note: "found",
        },
        adapters: [],
        safeActions: [],
        summary: {
          reliableWakeMethods: 2,
          stagedWakeMethods: 1,
          ollamaUsable: true,
          localModelAdaptersReady: 1,
        },
        recommendations: ["Use tray/orb wake."],
      }),
      store: emptyStore(),
      approvals: [],
    };

    expect(await tryHandleRuntimeSummaryRoute({ ...params, pathname: "/api/runtime/constellation" })).toBe(true);
    expect(await tryHandleRuntimeSummaryRoute({ ...params, pathname: "/api/runtime/smoke-status" })).toBe(true);
    expect(await tryHandleRuntimeSummaryRoute({ ...params, pathname: "/api/runtime/services" })).toBe(true);
    expect(await tryHandleRuntimeSummaryRoute({ ...params, pathname: "/api/runtime/process-visibility" })).toBe(true);
    expect(await tryHandleRuntimeSummaryRoute({ ...params, pathname: "/api/runtime/packaging-readiness" })).toBe(true);
    expect(await tryHandleRuntimeSummaryRoute({ ...params, pathname: "/api/runtime/activation-readiness" })).toBe(true);
    expect(await tryHandleRuntimeSummaryRoute({ ...params, pathname: "/api/runtime/startup-registration-plans" })).toBe(true);
    expect(await tryHandleRuntimeSummaryRoute({ ...params, method: "POST", pathname: "/api/runtime/services" })).toBe(false);

    expect(sent.map((entry) => entry.statusCode)).toEqual([200, 200, 200, 200, 200, 200, 200]);
    expect(JSON.stringify(sent[0]?.body)).toContain("runtime-constellation");
    expect(JSON.stringify(sent[1]?.body)).toContain("passed");
    expect(JSON.stringify(sent[2]?.body)).toContain("read only");
    expect(JSON.stringify(sent[3]?.body)).toContain("visibleInTaskManager");
    expect(JSON.stringify(sent[4]?.body)).toContain("electronShellReady");
    expect(JSON.stringify(sent[5]?.body)).toContain("ollamaUsable");
    expect(JSON.stringify(sent[6]?.body)).toContain("Dry-run registration");
  });
});

function emptyStore(): JarvisStore {
  return {
    listTasks: () => [],
    listQueue: () => [],
    listTimelineEvents: () => [],
    listWorkflowRuns: () => [],
  } as unknown as JarvisStore;
}
