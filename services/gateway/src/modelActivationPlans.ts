import type { ActionRequest, ModelAssetManifest, ModelProfile, ModelReadiness, PolicyDecision, ReadyModelAsset, RuntimeKind } from "@jarvis/core";

export type ModelActivationStatus = "ready-to-use" | "asset-ready" | "needs-runtime" | "too-heavy" | "missing-asset" | "disabled";

export interface ModelRuntimeOption {
  runtime: RuntimeKind;
  label: string;
  status: ModelActivationStatus;
  endpointEnv?: string;
  endpointHint?: string;
  summary: string;
}

export interface ModelActivationPlan {
  id: string;
  modelId: string;
  assetId: string;
  label: string;
  modelRef: string;
  localPath: string;
  hardwareFit: string;
  assetStatus: ModelAssetManifest["status"];
  recommendedRuntime: RuntimeKind;
  status: ModelActivationStatus;
  expectedMemoryGb: number;
  runtimeOptions: ModelRuntimeOption[];
  blockers: string[];
  nextAction: string;
  safeMode: true;
}

export interface ModelActivationDryRun {
  id: string;
  planId: string;
  modelId: string;
  modelRef: string;
  runtime: RuntimeKind;
  commandPreview: string;
  unloadPreview: string;
  expectedMemoryGb: number;
  endpointEnv?: string;
  endpointHint?: string;
  decision: PolicyDecision;
  action: ActionRequest;
  safeMode: true;
  notes: string[];
  blockers: string[];
}

export function buildModelActivationPlans(params: {
  models: ModelProfile[];
  readyAssets: ReadyModelAsset[];
  manifests: ModelAssetManifest[];
  readiness: ModelReadiness[];
}): ModelActivationPlan[] {
  return params.readyAssets.map((asset) => {
    const model = params.models.find((candidate) => candidate.id === asset.profileId);
    const manifest = params.manifests.find((candidate) => candidate.id === asset.id);
    const readiness = params.readiness.find((candidate) => candidate.modelId === asset.profileId || candidate.modelRef === asset.modelRef);
    const recommendedRuntime = recommendRuntime(asset, model, readiness);
    const status = activationStatus(asset, manifest, readiness, recommendedRuntime);
    const blockers = blockersFor(asset, manifest, readiness, status);
    return {
      id: `activation-${asset.id}`,
      modelId: asset.profileId,
      assetId: asset.id,
      label: asset.label,
      modelRef: asset.modelRef,
      localPath: asset.localPath,
      hardwareFit: asset.hardwareFit,
      assetStatus: manifest?.status ?? "missing",
      recommendedRuntime,
      status,
      expectedMemoryGb: model?.recommendedMemoryGb ?? estimateMemory(asset),
      runtimeOptions: asset.runtimeAdapters.map((runtime) => runtimeOption(runtime, asset, model, readiness, manifest)),
      blockers,
      nextAction: nextActionFor(status, recommendedRuntime, asset),
      safeMode: true,
    } satisfies ModelActivationPlan;
  });
}

export function createModelActivationDryRun(params: {
  id: string;
  plan: ModelActivationPlan;
  runtime?: RuntimeKind;
  createdAt: string;
  evaluate: (action: ActionRequest) => PolicyDecision;
}): ModelActivationDryRun {
  const runtime = params.runtime ?? params.plan.recommendedRuntime;
  const option = params.plan.runtimeOptions.find((candidate) => candidate.runtime === runtime);
  const action: ActionRequest = {
    id: params.id,
    title: `Activate model runtime: ${params.plan.label}`,
    category: "service-control",
    target: `${params.plan.label} via ${runtimeLabel(runtime)}`,
    reason: "Model activation can start local runtime services, allocate memory, and load local model weights.",
    connectorId: "local-model-runtime",
    agentId: "sentinel",
    dataTouched: ["local model files", "runtime process", "system memory", "model endpoint"],
  };
  const decision = params.evaluate(action);

  return {
    id: params.id,
    planId: params.plan.id,
    modelId: params.plan.modelId,
    modelRef: params.plan.modelRef,
    runtime,
    commandPreview: commandPreviewFor(runtime, params.plan),
    unloadPreview: unloadPreviewFor(runtime, params.plan),
    expectedMemoryGb: params.plan.expectedMemoryGb,
    endpointEnv: option?.endpointEnv ?? endpointEnv(runtime),
    endpointHint: option?.endpointHint ?? endpointHint(runtime),
    decision,
    action,
    safeMode: true,
    notes: [
      "Dry-run only: no model weights were loaded and no runtime process was started.",
      option?.summary ?? runtimeSummary(runtime, { label: params.plan.label, hardwareFit: params.plan.hardwareFit } as ReadyModelAsset, undefined, params.plan.status),
      `Created at ${params.createdAt}.`,
    ],
    blockers: params.plan.blockers,
  };
}

function recommendRuntime(asset: ReadyModelAsset, model?: ModelProfile, readiness?: ModelReadiness): RuntimeKind {
  if ((asset.hardwareFit === "workstation" || asset.hardwareFit === "homelab") && asset.runtimeAdapters.includes("vllm")) {
    return "vllm";
  }
  if ((asset.hardwareFit === "workstation" || asset.hardwareFit === "homelab") && asset.runtimeAdapters.includes("sglang")) {
    return "sglang";
  }
  if (model?.runtime && asset.runtimeAdapters.includes(model.runtime)) {
    return model.runtime;
  }
  if (asset.hardwareFit === "laptop-ready" && asset.runtimeAdapters.includes("huggingface-local")) {
    return "huggingface-local";
  }
  if (readiness?.hardwareFit === "workstation" && asset.runtimeAdapters.includes("lmstudio")) {
    return "lmstudio";
  }
  if (asset.runtimeAdapters.includes("vllm")) {
    return "vllm";
  }
  return asset.runtimeAdapters[0] ?? "huggingface-local";
}

function activationStatus(
  asset: ReadyModelAsset,
  manifest: ModelAssetManifest | undefined,
  readiness: ModelReadiness | undefined,
  recommendedRuntime: RuntimeKind,
): ModelActivationStatus {
  if (readiness?.runtimeState === "disabled") {
    return "disabled";
  }
  if (!asset.detected || !manifest?.exists) {
    return "missing-asset";
  }
  if (readiness?.runtimeProbe?.ok) {
    return "ready-to-use";
  }
  if (asset.hardwareFit === "workstation" || asset.hardwareFit === "homelab") {
    return recommendedRuntime === "huggingface-local" ? "too-heavy" : "needs-runtime";
  }
  return manifest.status === "complete" ? "asset-ready" : "needs-runtime";
}

function runtimeOption(
  runtime: RuntimeKind,
  asset: ReadyModelAsset,
  model: ModelProfile | undefined,
  readiness: ModelReadiness | undefined,
  manifest: ModelAssetManifest | undefined,
): ModelRuntimeOption {
  const status = runtimeStatus(runtime, asset, readiness, manifest);
  return {
    runtime,
    label: runtimeLabel(runtime),
    status,
    endpointEnv: endpointEnv(runtime),
    endpointHint: endpointHint(runtime),
    summary: runtimeSummary(runtime, asset, model, status),
  };
}

function runtimeStatus(
  runtime: RuntimeKind,
  asset: ReadyModelAsset,
  readiness: ModelReadiness | undefined,
  manifest: ModelAssetManifest | undefined,
): ModelActivationStatus {
  if (!asset.detected || !manifest?.exists) {
    return "missing-asset";
  }
  if (readiness?.runtimeProbe?.runtime === runtime && readiness.runtimeProbe.ok) {
    return "ready-to-use";
  }
  if (runtime === "huggingface-local" && (asset.hardwareFit === "workstation" || asset.hardwareFit === "homelab")) {
    return "too-heavy";
  }
  if (runtime === "huggingface-local" && manifest.status === "complete") {
    return "asset-ready";
  }
  return "needs-runtime";
}

function blockersFor(
  asset: ReadyModelAsset,
  manifest: ModelAssetManifest | undefined,
  readiness: ModelReadiness | undefined,
  status: ModelActivationStatus,
): string[] {
  if (status === "ready-to-use") {
    return [];
  }
  if (!asset.detected || !manifest?.exists) {
    return [asset.localPath];
  }
  if (manifest.requiredFilesMissing.length > 0) {
    return manifest.requiredFilesMissing;
  }
  if (status === "too-heavy") {
    return ["Use LM Studio, vLLM, SGLang, or a LAN endpoint before loading this asset."];
  }
  return readiness?.runtimeProbe?.blockers ?? ["Configure or probe a compatible local runtime."];
}

function nextActionFor(status: ModelActivationStatus, runtime: RuntimeKind, asset: ReadyModelAsset): string {
  if (status === "ready-to-use") {
    return "Route tasks to this model or run a benchmark.";
  }
  if (status === "missing-asset") {
    return `Place the downloaded model asset at ${asset.localPath}.`;
  }
  if (status === "too-heavy") {
    return "Serve from workstation/homelab runtime, then set the matching local endpoint.";
  }
  if (runtime === "huggingface-local") {
    return "Run a safe probe first; only load weights after explicit owner approval.";
  }
  return `Start or configure ${runtimeLabel(runtime)} and run the activation dry-run.`;
}

function runtimeSummary(runtime: RuntimeKind, asset: ReadyModelAsset, model: ModelProfile | undefined, status: ModelActivationStatus): string {
  const memory = model?.recommendedMemoryGb ? `~${model.recommendedMemoryGb} GB RAM` : "runtime-dependent memory";
  if (status === "too-heavy") {
    return `${asset.label} is present but should be served through an optimized endpoint on this hardware.`;
  }
  if (runtime === "huggingface-local") {
    return `Local Transformers path, ${memory}; safe probes inspect files before loading.`;
  }
  if (runtime === "ollama") {
    return "Ollama tag route for quantized laptop defaults.";
  }
  return `${runtimeLabel(runtime)} route for local/LAN serving.`;
}

function endpointEnv(runtime: RuntimeKind): string | undefined {
  const env: Partial<Record<RuntimeKind, string>> = {
    lmstudio: "JARVIS_LMSTUDIO_URL",
    vllm: "JARVIS_VLLM_URL",
    sglang: "JARVIS_SGLANG_URL",
    "llama-cpp": "JARVIS_LLAMA_CPP_URL",
    "huggingface-tgi": "JARVIS_TGI_URL",
    "lan-local": "JARVIS_LAN_MODEL_URL",
  };
  return env[runtime];
}

function commandPreviewFor(runtime: RuntimeKind, plan: ModelActivationPlan): string {
  if (runtime === "ollama") {
    return `ollama run ${plan.modelRef}`;
  }
  if (runtime === "huggingface-local") {
    return `python services/brain/model_loader.py --model "${plan.localPath}" --safe-load --profile ${plan.modelId}`;
  }
  if (runtime === "llama-cpp") {
    return `llama-server -m "<local gguf for ${plan.label}>" --host 127.0.0.1 --port 8080`;
  }
  if (runtime === "lmstudio") {
    return `Open LM Studio, load "${plan.localPath}", enable local server at ${endpointHint(runtime)}`;
  }
  if (runtime === "vllm") {
    return `python -m vllm.entrypoints.openai.api_server --model "${plan.localPath}" --host 127.0.0.1 --port 8000`;
  }
  if (runtime === "sglang") {
    return `python -m sglang.launch_server --model-path "${plan.localPath}" --host 127.0.0.1 --port 30000`;
  }
  if (runtime === "huggingface-tgi") {
    return `text-generation-launcher --model-id "${plan.localPath}" --hostname 127.0.0.1 --port 8081`;
  }
  return `Configure LAN model endpoint for ${plan.modelRef} and set ${endpointEnv(runtime) ?? "JARVIS_LAN_MODEL_URL"}`;
}

function unloadPreviewFor(runtime: RuntimeKind, plan: ModelActivationPlan): string {
  if (runtime === "ollama") {
    return `ollama stop ${plan.modelRef}`;
  }
  if (runtime === "lmstudio") {
    return "Stop the LM Studio local server or unload the selected model.";
  }
  if (runtime === "lan-local") {
    return "Unset the LAN endpoint or stop the remote local runtime.";
  }
  return `Stop the ${runtimeLabel(runtime)} process that serves ${plan.modelRef}.`;
}

function endpointHint(runtime: RuntimeKind): string | undefined {
  const hint: Partial<Record<RuntimeKind, string>> = {
    lmstudio: "http://127.0.0.1:1234/v1/models",
    vllm: "http://127.0.0.1:8000/v1/models",
    sglang: "http://127.0.0.1:30000/v1/models",
    "llama-cpp": "http://127.0.0.1:8080/v1/models",
    "huggingface-tgi": "http://127.0.0.1:8081/info",
  };
  return hint[runtime];
}

function runtimeLabel(runtime: RuntimeKind): string {
  return {
    ollama: "Ollama",
    lmstudio: "LM Studio",
    "llama-cpp": "llama.cpp",
    vllm: "vLLM",
    sglang: "SGLang",
    "huggingface-local": "HF Transformers",
    "huggingface-tgi": "HF TGI",
    "lan-local": "LAN endpoint",
  }[runtime];
}

function estimateMemory(asset: ReadyModelAsset): number {
  return asset.hardwareFit === "laptop-ready" ? 6 : asset.hardwareFit === "laptop-staged" ? 18 : 48;
}
