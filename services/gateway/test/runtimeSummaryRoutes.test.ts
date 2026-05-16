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
      processVisibilityStatus: () => ({
        generatedAt: "2026-05-16T00:00:00.000Z",
        runtimeRoot: "data/runtime",
        services: [],
        summary: { tracked: 5, pidFilesPresent: 1, alive: 1, visibleInTaskManager: 1 },
        note: "read only",
      }),
      store: emptyStore(),
      approvals: [],
    };

    expect(await tryHandleRuntimeSummaryRoute({ ...params, pathname: "/api/runtime/constellation" })).toBe(true);
    expect(await tryHandleRuntimeSummaryRoute({ ...params, pathname: "/api/runtime/smoke-status" })).toBe(true);
    expect(await tryHandleRuntimeSummaryRoute({ ...params, pathname: "/api/runtime/services" })).toBe(true);
    expect(await tryHandleRuntimeSummaryRoute({ ...params, pathname: "/api/runtime/process-visibility" })).toBe(true);
    expect(await tryHandleRuntimeSummaryRoute({ ...params, method: "POST", pathname: "/api/runtime/services" })).toBe(false);

    expect(sent.map((entry) => entry.statusCode)).toEqual([200, 200, 200, 200]);
    expect(JSON.stringify(sent[0]?.body)).toContain("runtime-constellation");
    expect(JSON.stringify(sent[1]?.body)).toContain("passed");
    expect(JSON.stringify(sent[2]?.body)).toContain("read only");
    expect(JSON.stringify(sent[3]?.body)).toContain("visibleInTaskManager");
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
