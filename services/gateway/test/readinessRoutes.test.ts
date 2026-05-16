import { describe, expect, it } from "vitest";
import { seededStatus } from "@jarvis/core";
import { tryHandleReadinessRoute } from "../src/routes/readinessRoutes.js";

describe("readiness routes", () => {
  it("handles health and architecture routes through the extracted router", () => {
    const sent: Array<{ statusCode: number; body: unknown }> = [];
    const baseParams = {
      status: seededStatus,
      voiceAssetRoot: "C:/voice",
      root: process.cwd(),
      now: () => "2026-05-16T00:00:00.000Z",
      sendJson: (statusCode: number, body: unknown) => sent.push({ statusCode, body }),
    };

    expect(tryHandleReadinessRoute({ ...baseParams, method: "GET", pathname: "/api/health" })).toBe(true);
    expect(tryHandleReadinessRoute({ ...baseParams, method: "GET", pathname: "/api/architecture/map" })).toBe(true);
    expect(tryHandleReadinessRoute({ ...baseParams, method: "POST", pathname: "/api/health" })).toBe(false);

    expect(sent[0]).toMatchObject({
      statusCode: 200,
      body: { ok: true, privacyMode: "strict-local", localOnly: true },
    });
    expect(sent[1]?.statusCode).toBe(200);
    expect(JSON.stringify(sent[1]?.body)).toContain("architecture");
  });
});
