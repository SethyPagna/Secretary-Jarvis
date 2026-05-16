import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildVisionRuntimeReadiness } from "../src/visionReadiness.js";

describe("vision runtime readiness", () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), "jarvis-vision-readiness-"));
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("reports local vision assets, OCR, YOLO, and approval-gated sensors without capture", () => {
    const hfRoot = join(tempRoot, "hf");
    const qwenPath = join(hfRoot, "Qwen__Qwen3.5-9B");
    const llavaPath = join(hfRoot, "llava");
    const yoloRoot = join(tempRoot, "models", "vision", "yolo");
    const ocrRoot = join(tempRoot, "tools", "ocr");
    mkdirSync(qwenPath, { recursive: true });
    mkdirSync(llavaPath, { recursive: true });
    mkdirSync(yoloRoot, { recursive: true });
    mkdirSync(ocrRoot, { recursive: true });
    writeFileSync(join(qwenPath, "config.json"), "{}");
    writeFileSync(join(qwenPath, "tokenizer.json"), "{}");
    writeFileSync(join(qwenPath, "model.safetensors"), "tiny");
    writeFileSync(join(llavaPath, "config.json"), "{}");
    writeFileSync(join(yoloRoot, "yolov8n.pt"), "tiny");
    writeFileSync(join(ocrRoot, "README.txt"), "ocr");

    const readiness = buildVisionRuntimeReadiness({
      hfSnapshotRoot: hfRoot,
      llavaPath,
      yoloRoot,
      ocrRoot,
      screenEnabled: true,
      cameraEnabled: false,
      runCommand: (command) => ({ ok: command === "tesseract", output: "tesseract 5" }),
      pythonPackageAvailable: (name) => ["PIL", "cv2", "pytesseract", "ultralytics"].includes(name),
    });

    expect(readiness.summary.localVisionAssets).toBeGreaterThanOrEqual(2);
    expect(readiness.ocr.status).toBe("ready");
    expect(readiness.objectDetection.status).toBe("ready");
    expect(readiness.screenCapture.status).toBe("requires-approval");
    expect(readiness.camera.status).toBe("locked");
    expect(readiness.privacy.screenCaptureActive).toBe(false);
    expect(readiness.privacy.cameraCaptureActive).toBe(false);
  });

  it("keeps missing feature dependencies separate from locked sensors", () => {
    const readiness = buildVisionRuntimeReadiness({
      hfSnapshotRoot: join(tempRoot, "empty-hf"),
      llavaPath: join(tempRoot, "empty-hf", "llava"),
      yoloRoot: join(tempRoot, "missing-yolo"),
      ocrRoot: join(tempRoot, "missing-ocr"),
      screenEnabled: false,
      cameraEnabled: false,
      runCommand: () => ({ ok: false, output: "missing" }),
      pythonPackageAvailable: () => false,
    });

    expect(readiness.summary.localVisionAssets).toBe(0);
    expect(readiness.ocr.status).toBe("missing-dependency");
    expect(readiness.objectDetection.status).toBe("missing-dependency");
    expect(readiness.modelAssets.find((probe) => probe.id === "vision-llava")?.status).toBe("missing-dependency");
    expect(readiness.summary.missingFeatureDependencies).toBe(3);
    expect(readiness.summary.approvalGatedSensors).toBe(2);
  });
});
