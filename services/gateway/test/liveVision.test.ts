import { describe, expect, it } from "vitest";
import type { PolicyDecision } from "@jarvis/core";
import { createLiveVisionRequest } from "../src/liveVision.js";

describe("live vision request records", () => {
  it("creates approval-gated screen records without capture", () => {
    const record = createLiveVisionRequest({
      id: "vision-request-1",
      actionId: "action-1",
      mode: "screen",
      target: "active screen",
      prompt: "What is this error?",
      createdAt: "2026-05-16T00:00:00.000Z",
      evaluate: (action): PolicyDecision => ({
        actionId: action.id,
        decision: "requires_approval",
        risk: "approval-required",
        reasons: ["sensor-capture is configured as an approval-gated action."],
      }),
    });

    expect(record.captured).toBe(false);
    expect(record.retention).toBe("not-retained");
    expect(record.action.connectorId).toBe("screen");
    expect(record.decision.decision).toBe("requires_approval");
    expect(record.insight.status).toBe("requires-approval");
    expect(record.insight.observations[0]).toContain("No pixels");
  });

  it("keeps selected-image analysis approval-gated without sensor connector denial", () => {
    const record = createLiveVisionRequest({
      id: "vision-request-2",
      actionId: "action-2",
      mode: "image",
      target: "C:\\Users\\user\\Downloads\\sample.png",
      createdAt: "2026-05-16T00:00:00.000Z",
      evaluate: (action): PolicyDecision => ({
        actionId: action.id,
        decision: "requires_approval",
        risk: "approval-required",
        reasons: ["selected image analysis is approval-gated."],
      }),
    });

    expect(record.action.connectorId).toBeUndefined();
    expect(record.action.dataTouched).toContain("selected image pixels");
    expect(record.insight.source).toContain("sample.png");
  });
});
