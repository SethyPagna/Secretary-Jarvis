import { describe, expect, it } from "vitest";
import type { NeededFeatureDownload } from "@jarvis/core";
import { buildFeaturePluginSlotManifest } from "../src/featurePluginSlots.js";

describe("feature plugin slot manifest", () => {
  const downloads: NeededFeatureDownload[] = [
    download("feature-piper", "voice", "needed", "C:/jarvis/tools/piper"),
    download("feature-yolo", "vision", "needed", "C:/jarvis/models/yolo"),
    download("feature-map-data", "maps", "optional", "C:/jarvis/data/maps"),
  ];

  it("separates ready, partial, missing, and optional plug-in slots", () => {
    const manifest = buildFeaturePluginSlotManifest({
      downloads,
      generatedAt: "2026-05-16T00:00:00.000Z",
      pathExists: (path) => path.includes("piper") || path.includes("yolo"),
      listFiles: (path) =>
        path.includes("piper")
          ? ["C:/jarvis/tools/piper/piper.exe", "C:/jarvis/tools/piper/voices/jarvis.onnx", "C:/jarvis/tools/piper/voices/jarvis.json"]
          : [],
    });

    expect(manifest.summary).toEqual({ ready: 1, partial: 1, missing: 0, optional: 1 });
    expect(manifest.slots.find((slot) => slot.id === "feature-piper")?.validationHint).toContain("piper.exe");
    expect(manifest.slots.find((slot) => slot.id === "feature-piper")?.checks.every((check) => check.passed)).toBe(true);
    expect(manifest.slots.find((slot) => slot.id === "feature-yolo")?.status).toBe("partial");
    expect(manifest.slots.find((slot) => slot.id === "feature-map-data")?.status).toBe("optional");
    expect(manifest.note).toContain("does not download");
  });
});

function download(
  id: string,
  category: NeededFeatureDownload["category"],
  status: NeededFeatureDownload["status"],
  expectedPath: string,
): NeededFeatureDownload {
  return {
    id,
    category,
    label: id,
    purpose: "test",
    expectedPath,
    installHint: "test hint",
    status,
    plugsInto: ["test"],
  };
}
