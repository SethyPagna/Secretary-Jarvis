import { describe, expect, it } from "vitest";
import { evaluateActionPolicy, neededFeatureDownloads, seededStatus } from "../src/index.js";

describe("vision guardrails", () => {
  it("keeps screen and camera perception approval-gated by default", () => {
    expect(seededStatus.visionInsights?.[0]).toMatchObject({
      mode: "screen",
      status: "requires-approval",
    });
    expect(seededStatus.devices?.find((device) => device.id === "device-camera")).toMatchObject({
      status: "locked",
      approvalRequired: true,
    });
    expect(seededStatus.connectors.find((connector) => connector.id === "camera")).toMatchObject({
      enabled: false,
      approvalRequired: ["sensor-capture"],
    });
    expect(seededStatus.connectors.find((connector) => connector.id === "screen")).toMatchObject({
      enabled: false,
      approvalRequired: ["sensor-capture"],
    });
  });

  it("requires approval for screen capture even when the local connector exists", () => {
    const decision = evaluateActionPolicy({
      action: {
        id: "screen-capture-test",
        title: "Capture screen once",
        category: "sensor-capture",
        target: "current screen",
        reason: "Explain an error on screen.",
        connectorId: "screen",
        dataTouched: ["screen pixels", "OCR text", "active app context"],
      },
      privacyMode: "strict-local",
      allowedConnectors: ["screen"],
    });

    expect(decision.decision).toBe("requires_approval");
    expect(decision.risk).toBe("approval-required");
  });

  it("keeps webcam identity locked until explicit owner approval", () => {
    expect(seededStatus.identityReadiness?.faceRecognition).toMatchObject({
      status: "requires-approval",
      cameraStatus: "locked",
    });
    expect(seededStatus.identityReadiness?.privacyLocks).toEqual(
      expect.arrayContaining(["camera", "biometric-retention"]),
    );
  });

  it("lists missing local vision feature dependencies without moving them into future scaling", () => {
    const visionDownloads = neededFeatureDownloads.filter((download) => download.category === "vision");

    expect(visionDownloads.map((download) => download.id)).toEqual(
      expect.arrayContaining(["feature-llava", "feature-yolo", "feature-ocr"]),
    );
    expect(visionDownloads.every((download) => /vision|ocr|screen|camera|object/i.test(download.purpose))).toBe(true);
  });
});
