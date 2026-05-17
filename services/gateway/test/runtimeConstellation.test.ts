import { describe, expect, it } from "vitest";
import type { ModelAssetManifest, NeededFeatureDownload, VisionRuntimeReadiness, VoiceRuntimeReadiness } from "@jarvis/core";
import { buildRuntimeConstellation } from "../src/runtimeConstellation.js";

describe("runtime constellation", () => {
  it("condenses readiness into compact nodes", () => {
    const constellation = buildRuntimeConstellation({
      readyModels: [
        { id: "m1", label: "M1", modelRef: "m1", catalog: "ready", expectedPath: "m1", exists: true, status: "complete", fileCount: 3, sizeBytes: 12, hasConfig: true, hasTokenizer: true, hasProcessor: false, weightFileCount: 1, indexFileCount: 0, requiredFilesMissing: [], notes: [] },
        { id: "m2", label: "M2", modelRef: "m2", catalog: "ready", expectedPath: "m2", exists: true, status: "complete", fileCount: 3, sizeBytes: 12, hasConfig: true, hasTokenizer: true, hasProcessor: false, weightFileCount: 1, indexFileCount: 0, requiredFilesMissing: [], notes: [] },
      ] satisfies ModelAssetManifest[],
      futureScalingModels: [],
      voice: voiceReadiness({ sttReady: true, ttsReady: true, sampleCount: 4, missingRequired: 0 }),
      vision: visionReadiness({ localVisionAssets: 2, ocrReady: true, objectDetectionReady: false, approvalGatedSensors: 2, missingFeatureDependencies: 1 }),
      neededFeatureDownloads: [
        { id: "piper", category: "voice", label: "Piper", purpose: "tts", expectedPath: "tools/piper", installHint: "install", status: "needed", plugsInto: [] },
        { id: "maps", category: "maps", label: "Maps", purpose: "maps", expectedPath: "data/maps", installHint: "install", status: "optional", plugsInto: [] },
      ] satisfies NeededFeatureDownload[],
      privacyMode: "strict-local",
      updatedAt: "2026-05-16T00:00:00.000Z",
    });

    expect(constellation.nodes).toHaveLength(5);
    expect(constellation.nodes.find((node) => node.id === "constellation-models")?.value).toBe("2/2");
    expect(constellation.nodes.find((node) => node.id === "constellation-privacy")?.status).toBe("locked");
    expect(constellation.nodes.find((node) => node.id === "constellation-setup")?.value).toBe("1 needed");
    expect(constellation.summary.ready).toBe(3);
    expect(constellation.summary.locked).toBe(1);
  });
});

function voiceReadiness(summary: VoiceRuntimeReadiness["summary"]): VoiceRuntimeReadiness {
  return {
    primaryStt: { id: "stt", label: "STT", kind: "stt", status: "ready", installed: true, notes: [] },
    tts: [],
    ttsPreferredEngine: "voice-sample",
    fallbackStt: [],
    vad: { id: "vad", label: "VAD", kind: "vad", status: "staged", installed: false, notes: [] },
    wakeWord: { id: "wake", label: "Wake", kind: "wake-word", status: "missing", installed: false, notes: [] },
    wakeState: "push-to-talk",
    identitySamples: [],
    summary,
    privacy: { micCaptureActive: false, speakingActive: false, note: "test" },
  };
}

function visionReadiness(summary: VisionRuntimeReadiness["summary"]): VisionRuntimeReadiness {
  return {
    modelAssets: [],
    ocr: { id: "ocr", label: "OCR", kind: "ocr", status: "ready", installed: true, notes: [] },
    objectDetection: { id: "yolo", label: "YOLO", kind: "object-detection", status: "missing-dependency", installed: false, notes: [] },
    packages: [],
    screenCapture: { id: "screen", label: "Screen", kind: "screen-capture", status: "locked", installed: false, notes: [] },
    camera: { id: "camera", label: "Camera", kind: "camera", status: "locked", installed: false, notes: [] },
    summary,
    privacy: { screenCaptureActive: false, cameraCaptureActive: false, note: "test" },
  };
}
