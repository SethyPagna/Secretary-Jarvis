import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { readyModelAssets, type ReadyModelAsset, type VisionRuntimeProbe, type VisionRuntimeReadiness } from "@jarvis/core";
import { inspectReadyModelAsset } from "./modelManifest.js";

const PROJECT_PARENT = "C:\\Users\\user\\Downloads\\Secretary Jarvis";
const HF_SNAPSHOT_ROOT = `${PROJECT_PARENT}\\models\\huggingface\\snapshots`;
const LLAVA_PATH = `${HF_SNAPSHOT_ROOT}\\llava`;
const YOLO_ROOT = `${PROJECT_PARENT}\\models\\vision\\yolo`;
const OCR_ROOT = `${PROJECT_PARENT}\\tools\\ocr`;

export interface VisionReadinessOptions {
  hfSnapshotRoot?: string;
  llavaPath?: string;
  yoloRoot?: string;
  ocrRoot?: string;
  readyAssets?: ReadyModelAsset[];
  screenEnabled?: boolean;
  cameraEnabled?: boolean;
  pathExists?: (path: string) => boolean;
  listFiles?: (path: string) => string[];
  runCommand?: (command: string, args: string[]) => { ok: boolean; output: string };
  pythonPackageAvailable?: (packageName: string) => boolean;
}

export function buildVisionRuntimeReadiness(options: VisionReadinessOptions = {}): VisionRuntimeReadiness {
  const pathExists = options.pathExists ?? existsSync;
  const listFiles = options.listFiles ?? safeListFiles;
  const runCommand = options.runCommand ?? commandOk;
  const pythonPackageAvailable = options.pythonPackageAvailable ?? pythonPackageProbe;
  const hfRoot = options.hfSnapshotRoot ?? HF_SNAPSHOT_ROOT;
  const llavaPath = options.llavaPath ?? LLAVA_PATH;
  const yoloRoot = options.yoloRoot ?? YOLO_ROOT;
  const ocrRoot = options.ocrRoot ?? OCR_ROOT;
  const visionAssetIds = new Set(["ready-qwen35-9b", "ready-qwen36-27b", "ready-gemma4-e4b-it", "ready-gemma4-26b-a4b-it"]);
  const localReadyAssets = (options.readyAssets ?? readyModelAssets)
    .filter((asset) => visionAssetIds.has(asset.id))
    .map((asset) => ({
      ...asset,
      localPath: rewriteSnapshotRoot(asset.localPath, hfRoot),
    }));

  const modelAssets: VisionRuntimeProbe[] = [
    ...localReadyAssets.map((asset) => modelAssetProbe(asset)),
    llavaProbe(llavaPath, pathExists, listFiles),
  ];

  const tesseract = runCommand("tesseract", ["--version"]);
  const pytesseract = pythonPackageAvailable("pytesseract");
  const ocrFiles = listFiles(ocrRoot);
  const ocrInstalled = tesseract.ok || pytesseract || ocrFiles.length > 0;
  const ocr: VisionRuntimeProbe = {
    id: "ocr-local",
    label: "Local OCR",
    kind: "ocr",
    status: tesseract.ok || pytesseract ? "ready" : ocrInstalled ? "staged" : "missing-dependency",
    installed: ocrInstalled,
    path: ocrRoot,
    runtime: tesseract.ok ? "tesseract" : pytesseract ? "pytesseract" : "staged-local-ocr",
    notes: [
      tesseract.ok || pytesseract
        ? "OCR runtime is available locally."
        : ocrInstalled
          ? "OCR files are present; install/verify the command or Python package before live OCR."
          : "OCR dependency is missing from tools/ocr and PATH.",
    ],
  };

  const yoloFiles = listFiles(yoloRoot).filter((fileName) => /\.(pt|onnx|engine)$/i.test(fileName));
  const ultralytics = pythonPackageAvailable("ultralytics");
  const opencv = pythonPackageAvailable("cv2");
  const objectDetection: VisionRuntimeProbe = {
    id: "object-yolo",
    label: "YOLO object detection",
    kind: "object-detection",
    status: ultralytics && yoloFiles.length > 0 ? "ready" : yoloFiles.length > 0 ? "staged" : "missing-dependency",
    installed: yoloFiles.length > 0,
    path: yoloRoot,
    runtime: "ultralytics-yolo",
    notes: [
      ultralytics && yoloFiles.length > 0
        ? `${yoloFiles.length} local YOLO weight file(s) detected.`
        : yoloFiles.length > 0
          ? "YOLO weights are present; install/verify ultralytics before object detection."
          : "YOLO weights are missing from models/vision/yolo.",
    ],
  };

  const packages: VisionRuntimeProbe[] = [
    packageProbe("pkg-pillow", "Pillow image metadata", "PIL", pythonPackageAvailable("PIL")),
    packageProbe("pkg-opencv", "OpenCV frame utilities", "cv2", opencv),
    packageProbe("pkg-ultralytics", "Ultralytics YOLO runtime", "ultralytics", ultralytics),
  ];

  const screenCapture = sensorProbe("screen-capture", "Screen capture", "screen-capture", options.screenEnabled);
  const camera = sensorProbe("camera-capture", "Camera / webcam", "camera", options.cameraEnabled);
  const localVisionAssets = modelAssets.filter((probe) => probe.status === "ready" || probe.status === "ready-asset").length;
  const missingFeatureDependencies = [ocr, objectDetection, ...modelAssets.filter((probe) => probe.id === "vision-llava")].filter(
    (probe) => probe.status === "missing-dependency",
  ).length;

  return {
    modelAssets,
    ocr,
    objectDetection,
    packages,
    screenCapture,
    camera,
    summary: {
      localVisionAssets,
      ocrReady: ocr.status === "ready",
      objectDetectionReady: objectDetection.status === "ready",
      approvalGatedSensors: [screenCapture, camera].filter((probe) => probe.status === "requires-approval" || probe.status === "locked").length,
      missingFeatureDependencies,
    },
    privacy: {
      screenCaptureActive: false,
      cameraCaptureActive: false,
      note: "Vision probes inspect files and dependency availability only; they do not capture screen pixels or camera frames.",
    },
  };
}

function modelAssetProbe(asset: ReadyModelAsset): VisionRuntimeProbe {
  const manifest = inspectReadyModelAsset(asset);
  return {
    id: `vision-${asset.id}`,
    label: asset.label,
    kind: "image-understanding",
    status: manifest.status === "complete" ? "ready-asset" : manifest.exists ? "staged" : "missing-dependency",
    installed: manifest.exists,
    path: asset.localPath,
    runtime: asset.runtimeAdapters.join(" / "),
    notes: [
      manifest.status === "complete"
        ? "Downloaded multimodal/text asset is present; runtime probe decides live image use."
        : manifest.exists
          ? "Asset folder is present but incomplete."
          : "Expected local asset folder is missing.",
    ],
  };
}

function llavaProbe(path: string, pathExists: (path: string) => boolean, listFiles: (path: string) => string[]): VisionRuntimeProbe {
  const files = listFiles(path);
  return {
    id: "vision-llava",
    label: "LLaVA-style image model",
    kind: "image-understanding",
    status: pathExists(path) && files.length > 0 ? "ready-asset" : "missing-dependency",
    installed: pathExists(path) && files.length > 0,
    path,
    runtime: "huggingface-local-or-gguf",
    notes: [
      pathExists(path) && files.length > 0
        ? "Dedicated LLaVA-style image model files are present."
        : "Optional LLaVA feature dependency is not installed yet.",
    ],
  };
}

function packageProbe(id: string, label: string, packageName: string, installed: boolean): VisionRuntimeProbe {
  return {
    id,
    label,
    kind: "runtime-package",
    status: installed ? "ready" : "staged",
    installed,
    runtime: packageName,
    notes: [installed ? `${packageName} is importable in Python.` : `${packageName} is not importable in Python yet.`],
  };
}

function sensorProbe(
  id: string,
  label: string,
  runtime: "screen-capture" | "camera",
  enabled = false,
): VisionRuntimeProbe {
  return {
    id,
    label,
    kind: runtime === "screen-capture" ? "screen-capture" : "camera",
    status: enabled ? "requires-approval" : "locked",
    installed: enabled,
    runtime,
    notes: [
      enabled
        ? "Connector is enabled, but each capture still requires explicit owner approval."
        : "Sensor is locked by default. Dry-run actions may request approval without capture.",
    ],
  };
}

function rewriteSnapshotRoot(localPath: string, hfRoot: string): string {
  const normalized = localPath.replaceAll("/", "\\");
  const marker = "\\models\\huggingface\\snapshots\\";
  const index = normalized.toLowerCase().indexOf(marker.toLowerCase());
  if (index === -1) {
    return localPath;
  }
  return join(hfRoot, normalized.slice(index + marker.length));
}

function safeListFiles(folderPath: string): string[] {
  try {
    if (!existsSync(folderPath)) {
      return [];
    }
    return readdirSync(folderPath, { withFileTypes: true }).flatMap((entry) => {
      const child = join(folderPath, entry.name);
      return entry.isDirectory() ? safeListFiles(child) : entry.isFile() ? [child] : [];
    });
  } catch {
    return [];
  }
}

function commandOk(command: string, args: string[]): { ok: boolean; output: string } {
  try {
    const output = execFileSync(command, args, { encoding: "utf8", timeout: 5000, windowsHide: true });
    return { ok: true, output: output.trim() };
  } catch (error) {
    return { ok: false, output: error instanceof Error ? error.message : String(error) };
  }
}

function pythonPackageProbe(packageName: string): boolean {
  const probe = commandOk("python", [
    "-c",
    `import importlib.util; raise SystemExit(0 if importlib.util.find_spec(${JSON.stringify(packageName)}) else 1)`,
  ]);
  return probe.ok;
}
