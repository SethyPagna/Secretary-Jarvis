import type {
  FutureScalingModel,
  HardwareFit,
  ModelProfile,
  ModelReadiness,
  NeededFeatureDownload,
  ReadyModelAsset,
  RuntimeKind,
} from "./types.js";

const SNAPSHOT_ROOT = "C:/Users/user/Downloads/Secretary Jarvis/models/huggingface/snapshots";

export const readyModelAssets: ReadyModelAsset[] = [
  {
    id: "ready-qwen35-9b",
    profileId: "hf-qwen35-9b",
    label: "Qwen 3.5 9B",
    modelRef: "Qwen/Qwen3.5-9B",
    localPath: `${SNAPSHOT_ROOT}/Qwen__Qwen3.5-9B`,
    primaryUse: "coding, reasoning, research, and multimodal laptop work",
    runtimeAdapters: ["huggingface-local", "lmstudio", "llama-cpp"],
    hardwareFit: "laptop-staged",
  },
  {
    id: "ready-qwen36-27b",
    profileId: "hf-qwen36-27b",
    label: "Qwen 3.6 27B",
    modelRef: "Qwen/Qwen3.6-27B",
    localPath: `${SNAPSHOT_ROOT}/Qwen__Qwen3.6-27B`,
    primaryUse: "heavier reasoning and coding when workstation/LAN runtime is available",
    runtimeAdapters: ["huggingface-local", "vllm", "sglang"],
    hardwareFit: "workstation",
  },
  {
    id: "ready-whisper-large-v3-turbo",
    profileId: "hf-whisper-large-v3-turbo",
    label: "Whisper large-v3-turbo",
    modelRef: "openai/whisper-large-v3-turbo",
    localPath: `${SNAPSHOT_ROOT}/openai__whisper-large-v3-turbo`,
    primaryUse: "primary local speech-to-text",
    runtimeAdapters: ["huggingface-local"],
    hardwareFit: "laptop-ready",
  },
  {
    id: "ready-gemma4-e4b-it",
    profileId: "hf-gemma4-e4b-it",
    label: "Gemma 4 E4B-it",
    modelRef: "google/gemma-4-E4B-it",
    localPath: `${SNAPSHOT_ROOT}/gemma-4-E4B-it`,
    primaryUse: "multimodal assistant, image/audio/video understanding experiments",
    runtimeAdapters: ["huggingface-local", "lmstudio"],
    hardwareFit: "laptop-staged",
  },
  {
    id: "ready-gemma4-26b-a4b-it",
    profileId: "hf-gemma4-26b-a4b-it",
    label: "Gemma 4 26B A4B-it",
    modelRef: "google/gemma-4-26B-A4B-it",
    localPath: `${SNAPSHOT_ROOT}/gemma-4-26B-A4B-it`,
    primaryUse: "stronger multimodal reasoning through workstation or optimized local runtime",
    runtimeAdapters: ["huggingface-local", "vllm", "sglang"],
    hardwareFit: "workstation",
  },
];

export const neededFeatureDownloads: NeededFeatureDownload[] = [
  {
    id: "feature-kokoro-82m",
    category: "voice",
    label: "Kokoro-82M local neural TTS",
    purpose: "Preferred lightweight local neural text-to-speech for Jarvis and agent voices on the laptop.",
    expectedPath: `${SNAPSHOT_ROOT}/hexgrad__Kokoro-82M`,
    installHint:
      "Use HF CLI with HF_TOKEN from your environment or the local vault: hf download hexgrad/Kokoro-82M --local-dir \"C:/Users/user/Downloads/Secretary Jarvis/models/huggingface/snapshots/hexgrad__Kokoro-82M\". Do not paste tokens into commands or files.",
    status: "needed",
    plugsInto: ["Voice Loop", "Agent voice profiles", "HUD speaking animation", "Kokoro preferred TTS route"],
  },
  {
    id: "feature-piper",
    category: "voice",
    label: "Piper executable and one voice",
    purpose: "Fast fully local text-to-speech for Jarvis and agent voices.",
    expectedPath: "C:/Users/user/Downloads/Secretary Jarvis/tools/piper",
    installHint: "Download Piper for Windows and a voice ONNX/JSON pair into tools/piper/voices.",
    status: "needed",
    plugsInto: ["Voice Loop", "Agent voice profiles", "HUD speaking animation"],
  },
  {
    id: "feature-wake-word",
    category: "voice",
    label: "Wake-word profile",
    purpose: "Let Jarvis wake from a minimal HUD without always showing the full panel.",
    expectedPath: "C:/Users/user/Downloads/Secretary Jarvis/models/wake-word",
    installHint: "Use Porcupine or a local Vosk wake profile; keep credentials/config local.",
    status: "needed",
    plugsInto: ["Voice Loop", "HUD wake animation"],
  },
  {
    id: "feature-omnivoice",
    category: "voice",
    label: "OmniVoice advanced voice dependency",
    purpose: "Optional advanced omni-speech and voice experimentation after the Kokoro path is stable.",
    expectedPath: `${SNAPSHOT_ROOT}/k2-fsa__OmniVoice`,
    installHint:
      "Use HF CLI with HF_TOKEN from your environment or the local vault: hf download k2-fsa/OmniVoice --local-dir \"C:/Users/user/Downloads/Secretary Jarvis/models/huggingface/snapshots/k2-fsa__OmniVoice\". Keep tokens out of chat, logs, and source files.",
    status: "optional",
    plugsInto: ["Advanced voice experiments", "Future cloned/omni voice profiles", "Agent voice profiles"],
  },
  {
    id: "feature-vosk",
    category: "voice",
    label: "Vosk streaming STT model",
    purpose: "Low-latency fallback speech recognition when Whisper is too heavy.",
    expectedPath: "C:/Users/user/Downloads/Secretary Jarvis/models/vosk",
    installHint: "Download a Vosk small English or multilingual model and extract it here.",
    status: "optional",
    plugsInto: ["Voice fallback", "Wake command mode"],
  },
  {
    id: "feature-llava",
    category: "vision",
    label: "LLaVA-style image model",
    purpose: "Dedicated local image/screen understanding if Qwen/Gemma runtime is not enough.",
    expectedPath: "C:/Users/user/Downloads/Secretary Jarvis/models/huggingface/snapshots/llava",
    installHint: "Download a quantized/local LLaVA-compatible model or HF snapshot.",
    status: "optional",
    plugsInto: ["Vision", "Screen explain", "OCR context"],
  },
  {
    id: "feature-yolo",
    category: "vision",
    label: "YOLO object detection weights",
    purpose: "Fast local object detection for camera/screen frames.",
    expectedPath: "C:/Users/user/Downloads/Secretary Jarvis/models/vision/yolo",
    installHint: "Install ultralytics and place YOLOv8/YOLOv11 weights in this folder.",
    status: "needed",
    plugsInto: ["Vision", "Webcam presence", "Device awareness"],
  },
  {
    id: "feature-ocr",
    category: "vision",
    label: "OCR runtime",
    purpose: "Read text from screenshots, PDFs, and app windows.",
    expectedPath: "C:/Users/user/Downloads/Secretary Jarvis/tools/ocr",
    installHint: "Install Tesseract/PaddleOCR or another local OCR runtime.",
    status: "needed",
    plugsInto: ["Vision", "Memory timeline", "Screen error explanation"],
  },
  {
    id: "feature-image-gen",
    category: "media",
    label: "Local image generation model",
    purpose: "Generate and edit images from the Media Studio.",
    expectedPath: "C:/Users/user/Downloads/Secretary Jarvis/models/media/image",
    installHint: "Place a local image generation checkpoint or ComfyUI/SD runtime here.",
    status: "optional",
    plugsInto: ["Media Studio", "Image tasks"],
  },
  {
    id: "feature-video-gen",
    category: "media",
    label: "Local video generation/editing model",
    purpose: "Enable video creation and editing workflows.",
    expectedPath: "C:/Users/user/Downloads/Secretary Jarvis/models/media/video",
    installHint: "Place local video generation models or configure a LAN video runtime endpoint.",
    status: "optional",
    plugsInto: ["Media Studio", "Video tasks"],
  },
  {
    id: "feature-music-gen",
    category: "media",
    label: "Local music/song/audio model",
    purpose: "Generate music, songs, and rich audio outputs.",
    expectedPath: "C:/Users/user/Downloads/Secretary Jarvis/models/media/music",
    installHint: "Place local audio/music model files or configure a local audio runtime.",
    status: "optional",
    plugsInto: ["Media Studio", "Music tasks"],
  },
  {
    id: "feature-map-data",
    category: "maps",
    label: "Offline maps/geocoder data",
    purpose: "Enable local map room routing and geospatial lookup without hosted map APIs.",
    expectedPath: "C:/Users/user/Downloads/Secretary Jarvis/data/maps",
    installHint: "Place offline map tiles, geocoder data, or a local map service config here.",
    status: "optional",
    plugsInto: ["Maps", "Travel/logistics", "Device topology"],
  },
  {
    id: "feature-social-credentials",
    category: "connector",
    label: "Social/device connector credentials",
    purpose: "Enable approved sends and device control after local draft/approval checks.",
    expectedPath: "C:/Users/user/Downloads/Secretary Jarvis/jarvis/data/vault",
    installHint: "Add connector-scoped credentials through Jarvis settings, not plain text files.",
    status: "needed",
    plugsInto: ["Social Outbox", "Email", "Phone bridge", "Smart home"],
  },
];

export const futureScalingModels: FutureScalingModel[] = [
  {
    id: "scale-deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    modelRef: "deepseek-ai/DeepSeek-V4-Flash",
    scale: "homelab",
    purpose: "Top-tier optional reasoning/coding scale-up when multi-GPU serving is available.",
    expectedRuntime: "vllm",
    expectedPath: "C:/Users/user/Downloads/Secretary Jarvis/models/huggingface/repos/deepseek-ai__DeepSeek-V4-Flash",
    notes: "Separate from feature dependencies; use when switching Jarvis to a homelab profile.",
  },
  {
    id: "scale-large-reasoning",
    label: "Larger DeepSeek/Qwen/Gemma/Llama reasoning models",
    modelRef: "future/local-reasoning-family",
    scale: "homelab",
    purpose: "Optional model switching and benchmarking for advanced analysis and coding.",
    expectedRuntime: "sglang",
    notes: "Register exact model refs later through the Model Hub.",
  },
  {
    id: "scale-multimodal-homelab",
    label: "Workstation/homelab multimodal models",
    modelRef: "future/local-multimodal-family",
    scale: "workstation",
    purpose: "Optional stronger visual, audio, and video reasoning endpoints.",
    expectedRuntime: "vllm",
    notes: "Use LAN/local endpoints; hosted inference remains disabled by default.",
  },
  {
    id: "scale-media-studio-large",
    label: "Large image/video/audio/music generation models",
    modelRef: "future/local-media-family",
    scale: "homelab",
    purpose: "Optional heavier generation workloads once storage and GPU serving are ready.",
    expectedRuntime: "lan-local",
    notes: "Feature adapters are coded separately; this list is for later scale choices.",
  },
];

export function hydrateReadyModelAssets(pathExists: (path: string) => boolean): ReadyModelAsset[] {
  return readyModelAssets.map((asset) => {
    const detected = pathExists(asset.localPath);
    return {
      ...asset,
      detected,
      detectedPath: detected ? asset.localPath : undefined,
      setupNotes: detected
        ? [
            "Local model folder detected.",
            asset.hardwareFit === "laptop-ready"
              ? "Ready for laptop routing once the matching runtime probe succeeds."
              : "Keep staged until an optimized runtime or LAN endpoint is configured.",
          ]
        : ["Expected local model folder is missing."],
    };
  });
}

export function readinessForModel(
  model: ModelProfile,
  pathExists: (path: string) => boolean,
  assets: ReadyModelAsset[] = readyModelAssets,
): ModelReadiness {
  const readyAsset = assets.find((asset) => asset.profileId === model.id);
  const artifactPath = readyAsset?.localPath ?? model.artifact?.localPath;
  const downloaded = readyAsset?.detected ?? (artifactPath ? pathExists(artifactPath) : model.installState === "installed");
  const isFutureScaling = futureScalingModels.some((future) => future.modelRef === model.modelRef);
  const hardwareFit: HardwareFit = readyAsset?.hardwareFit ?? fitForModel(model);
  const runtimeState = resolveRuntimeState(model, downloaded, hardwareFit, isFutureScaling);

  return {
    modelId: model.id,
    label: model.label,
    modelRef: model.modelRef,
    downloadState: downloaded ? "complete" : model.source === "disabled-hosted" ? "not-required" : "missing",
    runtimeState,
    hardwareFit,
    artifactPath,
    runtimePlan: runtimePlanFor(model, hardwareFit),
    missingFiles: downloaded || !artifactPath ? [] : [artifactPath],
    recommendedUse: readyAsset?.primaryUse ?? model.notes,
    nextAction: nextActionFor(runtimeState, model),
  };
}

function fitForModel(model: ModelProfile): HardwareFit {
  if (model.scale === "homelab") {
    return "homelab";
  }
  if (model.scale === "workstation" || (model.recommendedMemoryGb >= 48 && (model.recommendedVramGb ?? 0) >= 16)) {
    return "workstation";
  }
  return model.recommendedVramGb && model.recommendedVramGb > 4 ? "laptop-staged" : "laptop-ready";
}

function resolveRuntimeState(
  model: ModelProfile,
  downloaded: boolean,
  hardwareFit: HardwareFit,
  isFutureScaling: boolean,
) {
  if (model.safety === "disabled-cloud" || model.installState === "disabled") {
    return "disabled";
  }
  if (isFutureScaling) {
    return "future-scaling";
  }
  if (!downloaded) {
    return "missing";
  }
  if (hardwareFit === "workstation" || hardwareFit === "homelab") {
    return "needs-runtime";
  }
  return model.runtime === "huggingface-local" ? "ready-asset" : "ready";
}

function runtimePlanFor(model: ModelProfile, hardwareFit: HardwareFit): string {
  const adapters: RuntimeKind[] = model.runtime === "huggingface-local" ? ["huggingface-local", "lmstudio"] : [model.runtime];
  if (hardwareFit === "workstation" || hardwareFit === "homelab") {
    return `Use ${adapters.join(" or ")} through an optimized local/LAN runtime before loading on this laptop.`;
  }
  return `Use ${adapters.join(" or ")} locally; benchmark before pinning as default.`;
}

function nextActionFor(runtimeState: ModelReadiness["runtimeState"], model: ModelProfile): string {
  if (runtimeState === "missing") {
    return "Download or place the asset in the expected local folder.";
  }
  if (runtimeState === "needs-runtime") {
    return "Start a compatible local/LAN runtime or use this as a staged heavy model.";
  }
  if (runtimeState === "future-scaling") {
    return "Keep in Future Scaling until you choose a homelab/workstation model switch.";
  }
  if (runtimeState === "disabled") {
    return "Disabled by strict local policy.";
  }
  return model.enabled ? "Ready for routing and benchmarking." : "Ready asset detected; enable or select when needed.";
}
