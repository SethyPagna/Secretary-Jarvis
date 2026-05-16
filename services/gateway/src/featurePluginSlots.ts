import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { NeededFeatureDownload } from "@jarvis/core";

export type FeaturePluginSlotStatus = "ready" | "partial" | "missing" | "optional";

export interface FeaturePluginSlot {
  id: string;
  category: NeededFeatureDownload["category"];
  label: string;
  purpose: string;
  expectedPath: string;
  installHint: string;
  plugsInto: string[];
  declaredStatus: NeededFeatureDownload["status"];
  status: FeaturePluginSlotStatus;
  folderExists: boolean;
  fileCount: number;
  detectedFiles: string[];
  checks: FeaturePluginSlotCheck[];
  readyCheckCount: number;
  requiredCheckCount: number;
  validationHint: string;
  localOnly: true;
}

export interface FeaturePluginSlotCheck {
  id: string;
  label: string;
  required: boolean;
  passed: boolean;
  detail: string;
}

export interface FeaturePluginSlotManifest {
  generatedAt: string;
  localOnly: true;
  slots: FeaturePluginSlot[];
  summary: Record<FeaturePluginSlotStatus, number>;
  note: string;
}

export function buildFeaturePluginSlotManifest(params: {
  downloads: NeededFeatureDownload[];
  generatedAt: string;
  pathExists?: (path: string) => boolean;
  listFiles?: (path: string) => string[];
}): FeaturePluginSlotManifest {
  const pathExists = params.pathExists ?? existsSync;
  const listFiles = params.listFiles ?? safeListFiles;
  const slots = params.downloads.map((download) => {
    const folderExists = pathExists(download.expectedPath);
    const allFiles = folderExists ? listFiles(download.expectedPath) : [];
    const detectedFiles = allFiles.slice(0, 6);
    const fileCount = allFiles.length;
    const checks = checksFor(download, folderExists, allFiles);
    const status = resolveSlotStatus(download, folderExists, fileCount, checks);
    const requiredChecks = checks.filter((check) => check.required);
    return {
      id: download.id,
      category: download.category,
      label: download.label,
      purpose: download.purpose,
      expectedPath: download.expectedPath,
      installHint: download.installHint,
      plugsInto: download.plugsInto,
      declaredStatus: download.status,
      status,
      folderExists,
      fileCount,
      detectedFiles,
      checks,
      readyCheckCount: checks.filter((check) => check.passed).length,
      requiredCheckCount: requiredChecks.length,
      validationHint: validationHintFor(download),
      localOnly: true,
    } satisfies FeaturePluginSlot;
  });

  return {
    generatedAt: params.generatedAt,
    localOnly: true,
    slots,
    summary: {
      ready: slots.filter((slot) => slot.status === "ready").length,
      partial: slots.filter((slot) => slot.status === "partial").length,
      missing: slots.filter((slot) => slot.status === "missing").length,
      optional: slots.filter((slot) => slot.status === "optional").length,
    },
    note: "Feature plug-in slots are read-only setup manifests. Jarvis does not download or execute installers from this endpoint.",
  };
}

function resolveSlotStatus(
  download: NeededFeatureDownload,
  folderExists: boolean,
  fileCount: number,
  checks: FeaturePluginSlotCheck[],
): FeaturePluginSlotStatus {
  const requiredChecks = checks.filter((check) => check.required);
  if ((requiredChecks.length > 0 && requiredChecks.every((check) => check.passed)) || download.status === "detected") {
    return "ready";
  }
  if (folderExists || fileCount > 0 || checks.some((check) => check.passed)) {
    return "partial";
  }
  return download.status === "optional" ? "optional" : "missing";
}

function checksFor(download: NeededFeatureDownload, folderExists: boolean, files: string[]): FeaturePluginSlotCheck[] {
  const lowerFiles = files.map((file) => file.replaceAll("\\", "/").toLowerCase());
  const hasFile = (predicate: (file: string) => boolean) => lowerFiles.some(predicate);
  const anyFiles = files.length > 0;
  const folderCheck = {
    id: "folder",
    label: "Folder",
    required: download.status === "needed",
    passed: folderExists,
    detail: folderExists ? "Expected folder exists." : "Expected folder is missing.",
  };

  if (download.id === "feature-piper") {
    return [
      folderCheck,
      check("piper-exe", "Piper executable", true, hasFile((file) => file.endsWith("piper.exe") || file.endsWith("/piper"))),
      check("piper-voice", "Piper voice", true, hasFile((file) => file.endsWith(".onnx"))),
      check("piper-config", "Voice config", true, hasFile((file) => file.endsWith(".json"))),
    ];
  }
  if (download.id === "feature-vosk") {
    return [
      folderCheck,
      check("vosk-model", "Vosk model files", false, hasFile((file) => file.endsWith("model.conf") || file.includes("/am/final.mdl"))),
    ];
  }
  if (download.id === "feature-wake-word") {
    return [folderCheck, check("wake-profile", "Wake profile files", true, anyFiles)];
  }
  if (download.id === "feature-yolo") {
    return [folderCheck, check("yolo-weights", "YOLO weights", true, hasFile((file) => file.endsWith(".pt") || file.endsWith(".onnx")))];
  }
  if (download.id === "feature-ocr") {
    return [
      folderCheck,
      check("ocr-runtime", "OCR runtime", true, hasFile((file) => file.includes("tesseract") || file.includes("paddleocr") || file.endsWith(".exe"))),
    ];
  }
  if (download.category === "media") {
    return [folderCheck, check("media-runtime", "Media runtime/model", false, anyFiles)];
  }
  if (download.category === "maps") {
    return [folderCheck, check("map-data", "Offline map data", false, anyFiles)];
  }
  if (download.category === "connector") {
    return [folderCheck, check("vault-entry", "Connector vault", true, folderExists)];
  }
  return [folderCheck, check("local-files", "Local files", download.status === "needed", anyFiles)];
}

function check(id: string, label: string, required: boolean, passed: boolean): FeaturePluginSlotCheck {
  return {
    id,
    label,
    required,
    passed,
    detail: passed ? `${label} detected.` : `${label} not detected yet.`,
  };
}

function validationHintFor(download: NeededFeatureDownload): string {
  if (download.id === "feature-piper") {
    return "Expected: piper.exe plus at least one voices/*.onnx and matching JSON config.";
  }
  if (download.id === "feature-vosk") {
    return "Expected: extracted Vosk model files such as am/final.mdl or model.conf.";
  }
  if (download.id === "feature-wake-word") {
    return "Expected: Porcupine config/key managed locally or a Vosk wake profile folder.";
  }
  if (download.id === "feature-yolo") {
    return "Expected: YOLO weights such as *.pt plus the ultralytics Python package.";
  }
  if (download.id === "feature-ocr") {
    return "Expected: local OCR executable or model runtime, no hosted OCR.";
  }
  if (download.category === "media") {
    return "Expected: local model files or a LAN runtime config for the media studio.";
  }
  if (download.category === "maps") {
    return "Expected: offline tiles, geocoder data, or local map service config.";
  }
  if (download.category === "connector") {
    return "Expected: connector-scoped vault entry created through Jarvis settings.";
  }
  return "Expected: local files in the declared folder; no cloud inference is enabled by default.";
}

function safeListFiles(folderPath: string): string[] {
  try {
    if (!existsSync(folderPath) || !statSync(folderPath).isDirectory()) {
      return [];
    }
    return readdirSync(folderPath, { withFileTypes: true }).flatMap((entry) => {
      const child = join(folderPath, entry.name);
      if (entry.isDirectory()) {
        return safeListFiles(child);
      }
      return entry.isFile() ? [child] : [];
    });
  } catch {
    return [];
  }
}
