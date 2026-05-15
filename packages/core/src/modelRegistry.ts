import type { ModelProfile, ModelReadiness, RuntimeAdapter, ScaleProfile, TaskProfile } from "./types.js";

const DISABLED_CLOUD_NOTE =
  "Cloud or hosted inference is represented for planning only and remains disabled in strict local mode.";

export const defaultModelProfiles: ModelProfile[] = [
  {
    id: "ollama-qwen3-8b",
    label: "Qwen3 8B Fast Assistant",
    runtime: "ollama",
    modelRef: "qwen3:8b",
    modalities: ["text", "research"],
    taskProfiles: ["daily-assistant", "research", "rag"],
    scale: "laptop",
    safety: "local-only",
    enabled: true,
    recommendedMemoryGb: 8,
    recommendedVramGb: 0,
    contextWindow: 32768,
    source: "ollama-library",
    installState: "installed",
    artifact: {
      source: "ollama-library",
      repoId: "qwen3:8b",
      estimatedSizeGb: 6,
      license: "model-specific",
    },
    notes: "Installed laptop assistant profile for responsive private chat and light research.",
  },
  {
    id: "ollama-qwen3-coder-7b",
    label: "Qwen3 Coder 7B",
    runtime: "ollama",
    modelRef: "qwen3-coder:7b",
    modalities: ["text", "code"],
    taskProfiles: ["coding", "deep-reasoning"],
    scale: "laptop",
    safety: "local-only",
    enabled: false,
    recommendedMemoryGb: 10,
    recommendedVramGb: 0,
    contextWindow: 32768,
    source: "ollama-library",
    installState: "missing",
    artifact: {
      source: "ollama-library",
      repoId: "qwen3-coder:7b",
      estimatedSizeGb: 5,
      license: "model-specific",
    },
    notes: "Ollama tag is not currently available; use the downloaded HF Qwen snapshots for coding.",
  },
  {
    id: "ollama-nomic-embed",
    label: "Nomic Embed Text",
    runtime: "ollama",
    modelRef: "nomic-embed-text",
    modalities: ["embedding"],
    taskProfiles: ["rag"],
    scale: "laptop",
    safety: "local-only",
    enabled: true,
    recommendedMemoryGb: 2,
    recommendedVramGb: 0,
    source: "ollama-library",
    installState: "installed",
    artifact: {
      source: "ollama-library",
      repoId: "nomic-embed-text",
      estimatedSizeGb: 0.5,
      license: "apache-2.0",
    },
    notes: "Fast local embedding profile for MemoryOS and document recall.",
  },
  {
    id: "ollama-bge-m3",
    label: "BGE-M3 Deep Retrieval",
    runtime: "ollama",
    modelRef: "bge-m3",
    modalities: ["embedding"],
    taskProfiles: ["rag", "research"],
    scale: "laptop",
    safety: "local-only",
    enabled: false,
    recommendedMemoryGb: 4,
    recommendedVramGb: 0,
    source: "ollama-library",
    installState: "installed",
    artifact: {
      source: "ollama-library",
      repoId: "bge-m3",
      estimatedSizeGb: 2,
      license: "mit",
    },
    notes: "Higher-quality multilingual embedding profile for deeper recall.",
  },
  {
    id: "hf-qwen35-9b",
    label: "Qwen3.5 9B Multimodal",
    runtime: "huggingface-local",
    modelRef: "Qwen/Qwen3.5-9B",
    modalities: ["text", "code", "vision", "research"],
    taskProfiles: ["daily-assistant", "deep-reasoning", "coding", "research", "screen-vision"],
    scale: "laptop",
    safety: "local-only",
    enabled: true,
    recommendedMemoryGb: 24,
    recommendedVramGb: 8,
    contextWindow: 262144,
    source: "huggingface",
    installState: "installed",
    artifact: {
      source: "huggingface",
      repoId: "Qwen/Qwen3.5-9B",
      localPath: "C:/Users/user/Downloads/Secretary Jarvis/models/huggingface/snapshots/Qwen__Qwen3.5-9B",
      estimatedSizeGb: 22,
      license: "apache-2.0",
    },
    notes: "Downloaded HF local snapshot for stronger coding, vision, and long-context work.",
  },
  {
    id: "hf-gemma4-e4b-it",
    label: "Gemma 4 E4B-it",
    runtime: "huggingface-local",
    modelRef: "google/gemma-4-E4B-it",
    modalities: ["text", "vision", "audio", "video", "research"],
    taskProfiles: ["daily-assistant", "screen-vision", "audio-transcription", "research"],
    scale: "laptop",
    safety: "local-only",
    enabled: false,
    recommendedMemoryGb: 16,
    recommendedVramGb: 6,
    contextWindow: 128000,
    source: "huggingface",
    installState: "installed",
    artifact: {
      source: "huggingface",
      repoId: "google/gemma-4-E4B-it",
      localPath: "C:/Users/user/Downloads/Secretary Jarvis/models/huggingface/snapshots/gemma-4-E4B-it",
      estimatedSizeGb: 12,
      license: "gemma",
    },
    notes: "Downloaded multimodal laptop/workstation candidate for image, audio, and video understanding.",
  },
  {
    id: "hf-gemma4-26b-a4b-it",
    label: "Gemma 4 26B A4B-it",
    runtime: "huggingface-local",
    modelRef: "google/gemma-4-26B-A4B-it",
    modalities: ["text", "vision", "audio", "video", "research"],
    taskProfiles: ["deep-reasoning", "research", "screen-vision", "audio-transcription"],
    scale: "workstation",
    safety: "local-only",
    enabled: false,
    recommendedMemoryGb: 64,
    recommendedVramGb: 16,
    contextWindow: 128000,
    source: "huggingface",
    installState: "installed",
    artifact: {
      source: "huggingface",
      repoId: "google/gemma-4-26B-A4B-it",
      localPath: "C:/Users/user/Downloads/Secretary Jarvis/models/huggingface/snapshots/gemma-4-26B-A4B-it",
      estimatedSizeGb: 32,
      license: "gemma",
    },
    notes: "Downloaded heavier multimodal asset. Keep staged unless a workstation/LAN runtime is configured.",
  },
  {
    id: "hf-whisper-large-v3-turbo",
    label: "Whisper Large v3 Turbo",
    runtime: "huggingface-local",
    modelRef: "openai/whisper-large-v3-turbo",
    modalities: ["speech", "audio"],
    taskProfiles: ["audio-transcription"],
    scale: "laptop",
    safety: "local-only",
    enabled: true,
    recommendedMemoryGb: 8,
    recommendedVramGb: 0,
    source: "huggingface",
    installState: "installed",
    artifact: {
      source: "huggingface",
      repoId: "openai/whisper-large-v3-turbo",
      localPath: "C:/Users/user/Downloads/Secretary Jarvis/models/huggingface/snapshots/openai__whisper-large-v3-turbo",
      estimatedSizeGb: 3.2,
      license: "mit",
    },
    notes: "Downloaded high-accuracy STT target. Use Python Transformers first, whisper.cpp/native later.",
  },
  {
    id: "hf-qwen36-27b",
    label: "Qwen3.6 27B Homelab",
    runtime: "sglang",
    modelRef: "Qwen/Qwen3.6-27B",
    modalities: ["text", "code", "vision", "research"],
    taskProfiles: ["deep-reasoning", "coding", "research", "screen-vision"],
    scale: "workstation",
    safety: "local-only",
    enabled: false,
    recommendedMemoryGb: 96,
    recommendedVramGb: 24,
    contextWindow: 262144,
    source: "huggingface",
    installState: "installed",
    artifact: {
      source: "huggingface",
      repoId: "Qwen/Qwen3.6-27B",
      localPath: "C:/Users/user/Downloads/Secretary Jarvis/models/huggingface/snapshots/Qwen__Qwen3.6-27B",
      estimatedSizeGb: 62,
      license: "apache-2.0",
    },
    notes: "Downloaded workstation/homelab multimodal model for stronger agentic coding and long context.",
  },
  {
    id: "homelab-deepseek-v4-flash",
    label: "DeepSeek V4 Flash Homelab",
    runtime: "vllm",
    modelRef: "deepseek-ai/DeepSeek-V4-Flash",
    modalities: ["text", "code", "research"],
    taskProfiles: ["deep-reasoning", "coding", "research"],
    scale: "homelab",
    safety: "local-only",
    enabled: false,
    recommendedMemoryGb: 256,
    recommendedVramGb: 80,
    contextWindow: 1000000,
    source: "huggingface",
    installState: "staged",
    artifact: {
      source: "huggingface",
      repoId: "deepseek-ai/DeepSeek-V4-Flash",
      localPath: "C:/Users/user/Downloads/Secretary Jarvis/models/huggingface/repos/deepseek-ai__DeepSeek-V4-Flash",
      estimatedSizeGb: 380,
      license: "model-specific",
    },
    notes: "Top-tier scale target for a future multi-GPU homelab, not a laptop default.",
  },
  {
    id: "disabled-hf-hosted",
    label: "Hugging Face Hosted Adapter",
    runtime: "huggingface-tgi",
    modelRef: "disabled/hosted",
    modalities: ["text", "vision", "image", "video", "audio", "music"],
    taskProfiles: [
      "deep-reasoning",
      "image-generation",
      "video-generation",
      "audio-transcription",
      "music-generation",
    ],
    scale: "homelab",
    safety: "disabled-cloud",
    enabled: false,
    recommendedMemoryGb: 0,
    source: "disabled-hosted",
    installState: "disabled",
    artifact: {
      source: "disabled-hosted",
      repoId: "disabled/hosted",
      estimatedSizeGb: 0,
    },
    notes: DISABLED_CLOUD_NOTE,
  },
];

export const defaultRuntimeAdapters: RuntimeAdapter[] = [
  {
    id: "ollama",
    label: "Ollama local runtime",
    source: "ollama-library",
    toolCommand: "ollama",
    localOnly: true,
    enabledByDefault: true,
  },
  {
    id: "huggingface-local",
    label: "Hugging Face local snapshot",
    source: "huggingface",
    toolCommand: "hf",
    localOnly: true,
    enabledByDefault: false,
  },
  {
    id: "llama-cpp",
    label: "llama.cpp / GGUF",
    source: "gguf-local",
    toolCommand: "llama-server",
    localOnly: true,
    enabledByDefault: false,
  },
  {
    id: "lmstudio",
    label: "LM Studio OpenAI-compatible server",
    source: "openai-compatible-lan",
    localOnly: true,
    enabledByDefault: false,
  },
  {
    id: "vllm",
    label: "vLLM homelab server",
    source: "huggingface",
    toolCommand: "vllm",
    localOnly: true,
    enabledByDefault: false,
  },
  {
    id: "sglang",
    label: "SGLang homelab server",
    source: "huggingface",
    toolCommand: "python -m sglang.launch_server",
    localOnly: true,
    enabledByDefault: false,
  },
  {
    id: "huggingface-tgi",
    label: "Hosted Hugging Face TGI",
    source: "disabled-hosted",
    localOnly: false,
    enabledByDefault: false,
  },
];

export function selectModelForTask(params: {
  taskProfile: TaskProfile;
  scaleProfile: ScaleProfile;
  models?: ModelProfile[];
  readiness?: ModelReadiness[];
}): ModelProfile {
  const models = params.models ?? defaultModelProfiles;
  const readinessById = new Map((params.readiness ?? []).map((readiness) => [readiness.modelId, readiness]));
  const eligible = models.filter(
    (model) =>
      model.safety !== "disabled-cloud" &&
      model.taskProfiles.includes(params.taskProfile),
  );

  const ranked = eligible
    .map((model) => ({
      model,
      score: routingScore(model, params.taskProfile, params.scaleProfile, readinessById.get(model.id)),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score);

  if (ranked[0]) {
    return ranked[0].model;
  }

  const fallback =
    eligible.find((model) => model.enabled && model.scale === "laptop") ??
    eligible[0] ??
    models.find(
      (model) =>
        model.enabled &&
        model.safety !== "disabled-cloud" &&
        model.taskProfiles.includes("daily-assistant") &&
        model.scale === "laptop",
    );
  if (!fallback) {
    throw new Error(`No enabled local model is configured for ${params.taskProfile}`);
  }

  return fallback;
}

function routingScore(
  model: ModelProfile,
  taskProfile: TaskProfile,
  scaleProfile: ScaleProfile,
  readiness?: ModelReadiness,
): number {
  const runtimeState = readiness?.runtimeProbe?.ok
    ? "ready"
    : readiness?.runtimeProbe?.status === "served"
      ? "ready"
      : readiness?.runtimeState;
  const readinessScore = runtimeStateScore(runtimeState);
  if (readinessScore <= 0 && !model.enabled) {
    return 0;
  }

  let score = readinessScore;
  score += scaleScore(model.scale, scaleProfile);
  score += model.enabled ? 8 : 0;
  score += taskPreferenceScore(model, taskProfile, scaleProfile, readiness);
  score -= memoryPenalty(model, scaleProfile);
  return score;
}

function runtimeStateScore(runtimeState: ModelReadiness["runtimeState"] | undefined): number {
  if (runtimeState === "ready") {
    return 100;
  }
  if (runtimeState === "ready-asset") {
    return 72;
  }
  if (runtimeState === "needs-runtime") {
    return 24;
  }
  if (runtimeState === "future-scaling") {
    return 8;
  }
  return 0;
}

function scaleScore(modelScale: ScaleProfile, desiredScale: ScaleProfile): number {
  if (modelScale === desiredScale) {
    return 22;
  }
  if (desiredScale === "laptop" && modelScale === "workstation") {
    return -18;
  }
  if (desiredScale === "laptop" && modelScale === "homelab") {
    return -32;
  }
  if (desiredScale === "workstation" && modelScale === "laptop") {
    return 8;
  }
  if (desiredScale === "homelab" && modelScale !== "homelab") {
    return 4;
  }
  return 0;
}

function taskPreferenceScore(
  model: ModelProfile,
  taskProfile: TaskProfile,
  scaleProfile: ScaleProfile,
  readiness?: ModelReadiness,
): number {
  const ref = `${model.id} ${model.modelRef} ${model.label}`.toLowerCase();
  const servedOrReady = readiness?.runtimeProbe?.ok || readiness?.runtimeState === "ready" || readiness?.runtimeState === "ready-asset";

  if (taskProfile === "daily-assistant") {
    return (model.runtime === "ollama" ? 18 : 0) + (model.scale === "laptop" ? 10 : 0);
  }
  if (taskProfile === "coding" || taskProfile === "deep-reasoning") {
    const qwenScore = ref.includes("qwen") ? 22 : 0;
    const heavyReadyBonus = scaleProfile !== "laptop" && model.scale !== "laptop" && servedOrReady ? 12 : 0;
    return qwenScore + heavyReadyBonus;
  }
  if (taskProfile === "audio-transcription") {
    return ref.includes("whisper") ? 35 : 0;
  }
  if (taskProfile === "screen-vision") {
    return ref.includes("gemma") ? 18 : ref.includes("qwen") ? 12 : 0;
  }
  if (taskProfile === "rag") {
    return model.modalities.includes("embedding") ? 24 : 0;
  }
  return 0;
}

function memoryPenalty(model: ModelProfile, scaleProfile: ScaleProfile): number {
  if (scaleProfile !== "laptop") {
    return 0;
  }
  if (model.recommendedMemoryGb >= 64) {
    return 34;
  }
  if (model.recommendedMemoryGb >= 32) {
    return 18;
  }
  return 0;
}
