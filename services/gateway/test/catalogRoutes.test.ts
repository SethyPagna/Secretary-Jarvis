import { describe, expect, it } from "vitest";
import { futureScalingModels, seededStatus } from "@jarvis/core";
import { tryHandleCatalogRoute } from "../src/routes/catalogRoutes.js";

describe("catalog routes", () => {
  it("handles read-only model and setup catalog routes", () => {
    const sent: Array<{ statusCode: number; body: unknown }> = [];
    const params = {
      method: "GET",
      now: () => "2026-05-16T00:00:00.000Z",
      sendJson: (statusCode: number, body: unknown) => sent.push({ statusCode, body }),
      statusWithRuntimeState: () => seededStatus,
      localModelAssetManifests: () => ({
        ready: [{ id: "ready-qwen", status: "complete" }],
        futureScaling: [{ id: "future-deepseek", status: "missing" }],
      }),
      modelActivationPlans: () => [
        { status: "ready-to-use" },
        { status: "asset-ready" },
        { status: "needs-runtime" },
      ],
      hydrateFeatureDownloads: () => seededStatus.neededFeatureDownloads ?? [],
      futureScalingModels,
      detectToolStatuses: () => [{ id: "ollama", installed: true }],
    };

    expect(tryHandleCatalogRoute({ ...params, pathname: "/api/models" })).toBe(true);
    expect(tryHandleCatalogRoute({ ...params, pathname: "/api/models/activation-plans" })).toBe(true);
    expect(tryHandleCatalogRoute({ ...params, pathname: "/api/setup/action-groups" })).toBe(true);
    expect(tryHandleCatalogRoute({ ...params, pathname: "/api/models/future-scaling" })).toBe(true);
    expect(tryHandleCatalogRoute({ ...params, method: "POST", pathname: "/api/models" })).toBe(false);

    expect(sent.map((entry) => entry.statusCode)).toEqual([200, 200, 200, 200]);
    expect(JSON.stringify(sent[0]?.body)).toContain("toolStatuses");
    expect(JSON.stringify(sent[1]?.body)).toContain("readyToUse");
    expect(JSON.stringify(sent[2]?.body)).toContain("Feature");
    expect(JSON.stringify(sent[3]?.body)).toContain("optional future");
  });
});
