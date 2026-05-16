import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import type { FutureScalingModel, ModelAssetManifest, ReadyModelAsset } from "@jarvis/core";

export function inspectReadyModelAsset(asset: ReadyModelAsset): ModelAssetManifest {
  return inspectModelPath({
    id: asset.id,
    catalog: "ready",
    label: asset.label,
    modelRef: asset.modelRef,
    localPath: asset.localPath,
  });
}

export function inspectFutureScalingModel(model: FutureScalingModel): ModelAssetManifest {
  return inspectModelPath({
    id: model.id,
    catalog: "future-scaling",
    label: model.label,
    modelRef: model.modelRef,
    localPath: model.expectedPath,
  });
}

function inspectModelPath(input: {
  id: string;
  catalog: ModelAssetManifest["catalog"];
  label: string;
  modelRef: string;
  localPath?: string;
}): ModelAssetManifest {
  if (!input.localPath || !existsSync(input.localPath)) {
    return {
      ...input,
      exists: false,
      status: "missing",
      fileCount: 0,
      sizeBytes: 0,
      hasConfig: false,
      hasTokenizer: false,
      hasProcessor: false,
      weightFileCount: 0,
      indexFileCount: 0,
      indexedShardCount: 0,
      missingIndexedShards: [],
      requiredFilesMissing: ["model folder"],
      notes: ["Expected local model folder is missing. No download was attempted."],
    };
  }

  const files = collectFiles(input.localPath);
  const relativeFiles = files.map((filePath) => normalize(relative(input.localPath!, filePath)));
  const names = relativeFiles.map((filePath) => basename(filePath).toLowerCase());
  const weightFiles = relativeFiles.filter((filePath) => /\.(safetensors|bin|gguf)$/i.test(filePath));
  const indexFiles = relativeFiles.filter((filePath) => /index\.json$/i.test(filePath));
  const indexedShards = indexFiles.flatMap((filePath) => readIndexedShardNames(join(input.localPath!, filePath)));
  const missingIndexedShards = indexedShards.filter((shard) => !existsSync(join(input.localPath!, dirname(shard), basename(shard))));
  const hasConfig = names.includes("config.json");
  const hasTokenizer = names.some((name) => name === "tokenizer.json" || name === "tokenizer.model" || name === "vocab.json");
  const hasProcessor = names.some((name) => name.includes("processor_config") || name.includes("preprocessor_config"));
  const requiredFilesMissing = [
    hasConfig ? undefined : "config.json",
    hasTokenizer ? undefined : "tokenizer/vocab",
    weightFiles.length > 0 ? undefined : "model weights",
    missingIndexedShards.length > 0 ? "indexed shards" : undefined,
  ].filter((item): item is string => Boolean(item));
  const sizeBytes = files.reduce((total, filePath) => total + statSync(filePath).size, 0);
  const status = statusFor(requiredFilesMissing, weightFiles.length, hasConfig || hasTokenizer || hasProcessor);

  return {
    ...input,
    exists: true,
    status,
    fileCount: files.length,
    sizeBytes,
    hasConfig,
    hasTokenizer,
    hasProcessor,
    weightFileCount: weightFiles.length,
    indexFileCount: indexFiles.length,
    indexedShardCount: indexedShards.length,
    missingIndexedShards,
    requiredFilesMissing,
    notes: [
      "Safe manifest inspected local files only; model weights were not loaded.",
      status === "complete" ? "Required config/tokenizer/weight files are present." : "One or more required local model files are missing.",
      input.catalog === "future-scaling" ? "Future scaling asset remains separate from laptop default routing." : "Ready asset remains subject to runtime probe before use.",
    ],
  };
}

function statusFor(requiredFilesMissing: string[], weightFileCount: number, hasMetadata: boolean): ModelAssetManifest["status"] {
  if (requiredFilesMissing.length === 0) {
    return "complete";
  }
  if (weightFileCount === 0 && hasMetadata) {
    return "metadata-only";
  }
  return "partial";
}

function collectFiles(folderPath: string): string[] {
  return readdirSync(folderPath, { withFileTypes: true }).flatMap((entry) => {
    const childPath = join(folderPath, entry.name);
    if (entry.isDirectory()) {
      return collectFiles(childPath);
    }
    return entry.isFile() ? [childPath] : [];
  });
}

function readIndexedShardNames(indexFilePath: string): string[] {
  try {
    const parsed = JSON.parse(readFileSync(indexFilePath, "utf8")) as { weight_map?: Record<string, string> };
    return [...new Set(Object.values(parsed.weight_map ?? {}).map(normalize))];
  } catch {
    return [];
  }
}

function normalize(value: string): string {
  return value.replace(/\\/g, "/");
}
