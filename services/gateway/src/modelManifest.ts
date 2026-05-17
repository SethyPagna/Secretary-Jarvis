import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import type { FutureScalingModel, ModelAssetIntegrity, ModelAssetManifest, ReadyModelAsset, RuntimeRunnableState } from "@jarvis/core";

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
      integrity: "missing",
      runnableState: input.catalog === "future-scaling" ? "future-scaling" : "incomplete",
      partialReasons: ["model folder missing"],
      pointerFileCount: 0,
      partialDownloadFileCount: 0,
      runtimeRecommendation: "Download or point Jarvis at the local model folder before probing runtimes.",
    };
  }

  const files = collectFiles(input.localPath);
  const relativeFiles = files.map((filePath) => normalize(relative(input.localPath!, filePath)));
  const names = relativeFiles.map((filePath) => basename(filePath).toLowerCase());
  const weightFiles = relativeFiles.filter((filePath) => /\.(safetensors|bin|gguf)$/i.test(filePath));
  const partialDownloadFiles = relativeFiles.filter((filePath) => /\.crdownload$|\.part$|\.tmp$/i.test(filePath));
  const pointerFiles = weightFiles.filter((filePath) => isPointerFile(join(input.localPath!, filePath)));
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
    partialDownloadFiles.length > 0 ? "partial downloads" : undefined,
    pointerFiles.length > 0 ? "full model weights (Git/Xet pointers detected)" : undefined,
  ].filter((item): item is string => Boolean(item));
  const sizeBytes = files.reduce((total, filePath) => total + statSync(filePath).size, 0);
  const status = statusFor(requiredFilesMissing, weightFiles.length, hasConfig || hasTokenizer || hasProcessor);
  const integrity = integrityFor({
    exists: true,
    status,
    pointerFileCount: pointerFiles.length,
    partialDownloadFileCount: partialDownloadFiles.length,
    weightFileCount: weightFiles.length,
  });
  const runnableState = runnableStateFor(input.catalog, integrity);

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
      status === "complete" ? "Required config/tokenizer/weight files are present." : "One or more required local model files are missing or incomplete.",
      input.catalog === "future-scaling" ? "Future scaling asset remains separate from laptop default routing." : "Ready asset remains subject to runtime probe before use.",
      pointerFiles.length > 0 ? "Git/Xet pointer-sized weight files were detected; pull full weights before use." : undefined,
      partialDownloadFiles.length > 0 ? "Partial browser downloads were detected; resume or restart the download before use." : undefined,
    ].filter((note): note is string => Boolean(note)),
    integrity,
    runnableState,
    partialReasons: requiredFilesMissing,
    pointerFileCount: pointerFiles.length,
    partialDownloadFileCount: partialDownloadFiles.length,
    runtimeRecommendation: runtimeRecommendationFor(input.catalog, integrity, input.modelRef),
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

function integrityFor(input: {
  exists: boolean;
  status: ModelAssetManifest["status"];
  pointerFileCount: number;
  partialDownloadFileCount: number;
  weightFileCount: number;
}): ModelAssetIntegrity {
  if (!input.exists) {
    return "missing";
  }
  if (input.partialDownloadFileCount > 0) {
    return "incomplete";
  }
  if (input.pointerFileCount > 0 && input.pointerFileCount >= input.weightFileCount) {
    return "pointer-only";
  }
  if (input.pointerFileCount > 0) {
    return "incomplete";
  }
  if (input.status === "metadata-only") {
    return "metadata-only";
  }
  return input.status === "complete" ? "complete" : "incomplete";
}

function runnableStateFor(catalog: ModelAssetManifest["catalog"], integrity: ModelAssetIntegrity): RuntimeRunnableState {
  if (catalog === "future-scaling") {
    return "future-scaling";
  }
  if (integrity === "complete") {
    return "downloaded";
  }
  if (integrity === "metadata-only") {
    return "staged";
  }
  return "incomplete";
}

function runtimeRecommendationFor(catalog: ModelAssetManifest["catalog"], integrity: ModelAssetIntegrity, modelRef: string): string {
  if (catalog === "future-scaling") {
    return integrity === "complete"
      ? "Use only after a workstation/homelab endpoint is configured."
      : "Future scaling target is not a laptop default; finish the model download before endpoint setup.";
  }
  if (integrity !== "complete") {
    return "Repair the local asset before probing runtime adapters.";
  }
  if (modelRef.toLowerCase().includes("whisper")) {
    return "Use Python Transformers STT probe first; do not route chat through this asset.";
  }
  return "Prefer Ollama/GGUF/LM Studio/vLLM endpoint routing before raw Hugging Face loading on this laptop.";
}

function isPointerFile(filePath: string): boolean {
  try {
    const size = statSync(filePath).size;
    if (size > 4096) {
      return false;
    }
    const content = readFileSync(filePath, "utf8");
    return content.includes("version https://git-lfs.github.com/spec") || content.includes("https://git-lfs.github.com") || content.includes("xet");
  } catch {
    return false;
  }
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
