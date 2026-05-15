import type {
  ActionRequest,
  ModelDryRunResult,
  ModelInstallPlan,
  ModelSource,
  RuntimeKind,
} from "./types.js";

const DEFAULT_MODEL_CACHE = "C:\\Users\\user\\.cache\\jarvis\\models";

const SIZE_ESTIMATES_GB: Readonly<Record<string, number>> = {
  "qwen3:8b": 6,
  "qwen3-coder:7b": 5,
  "nomic-embed-text": 0.5,
  "bge-m3": 2,
  "Qwen/Qwen3.5-9B": 22,
  "Qwen/Qwen3.6-27B": 62,
  "google/gemma-4-E4B-it": 12,
  "openai/whisper-large-v3-turbo": 3.2,
  "deepseek-ai/DeepSeek-V4-Flash": 380,
};

export function createModelDryRun(params: {
  id: string;
  modelRef: string;
  source: ModelSource;
  runtime: RuntimeKind;
  connectorId?: string;
  localCachePath?: string;
}): ModelDryRunResult {
  const estimatedSizeGb = SIZE_ESTIMATES_GB[params.modelRef];
  const commandPreview = commandForDryRun(params.modelRef, params.source);
  const plan: ModelInstallPlan = {
    id: `${params.id}-plan`,
    modelRef: params.modelRef,
    source: params.source,
    runtime: params.runtime,
    commandPreview,
    localCachePath: params.localCachePath ?? DEFAULT_MODEL_CACHE,
    estimatedSizeGb,
    requiresApproval: true,
    localOnly: params.source !== "disabled-hosted",
    notes: [
      "Dry-run only. Jarvis will not download model files until approval is granted.",
      params.source === "huggingface"
        ? "Use hf download --dry-run first; then download into the local cache."
        : "Use the local runtime cache and keep hosted inference disabled.",
    ],
    blockers: params.source === "disabled-hosted" ? ["Hosted/cloud inference is disabled in strict local mode."] : [],
  };

  return {
    modelRef: params.modelRef,
    source: params.source,
    canEstimate: estimatedSizeGb !== undefined,
    willDownload: true,
    estimatedSizeGb,
    installPlan: plan,
    approvalAction: {
      id: `${params.id}-approval`,
      title: `Download local model ${params.modelRef}`,
      category: "model-download",
      target: params.modelRef,
      reason: "Model files can be large and may require network/cache access, so Jarvis gates downloads.",
      connectorId: params.connectorId,
      dataTouched: ["local model cache", "model metadata", "network download"],
    } satisfies ActionRequest,
  };
}

function commandForDryRun(modelRef: string, source: ModelSource): string {
  if (source === "huggingface") {
    return `hf download ${modelRef} --dry-run`;
  }

  if (source === "ollama-library") {
    return `ollama pull ${modelRef} # approval required`;
  }

  if (source === "docker-model-runner") {
    return `docker model run hf.co/${modelRef} # approval required`;
  }

  return `register local model ${modelRef}`;
}
