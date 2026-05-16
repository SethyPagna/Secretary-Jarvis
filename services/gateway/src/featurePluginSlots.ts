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
  validationHint: string;
  localOnly: true;
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
    const detectedFiles = folderExists ? listFiles(download.expectedPath).slice(0, 6) : [];
    const fileCount = folderExists ? listFiles(download.expectedPath).length : 0;
    const status = resolveSlotStatus(download, folderExists, fileCount);
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

function resolveSlotStatus(download: NeededFeatureDownload, folderExists: boolean, fileCount: number): FeaturePluginSlotStatus {
  if (fileCount > 0 || download.status === "detected") {
    return "ready";
  }
  if (folderExists) {
    return "partial";
  }
  return download.status === "optional" ? "optional" : "missing";
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
