import type { ModelAssetManifest, NeededFeatureDownload, VoiceRuntimeReadiness } from "@jarvis/core";

export type RuntimeAttentionState = "ready" | "attention" | "blocked" | "staged";
export type RuntimeAttentionCategory = "voice" | "models" | "vision" | "media" | "maps" | "connectors" | "runtime";

export interface RuntimeAttentionItem {
  id: string;
  category: RuntimeAttentionCategory;
  label: string;
  state: RuntimeAttentionState;
  reason: string;
  nextAction: string;
  expectedPath?: string;
  commandPreview?: string;
  approvalRequired: boolean;
  dataTouched: string[];
}

export interface RuntimeAttentionManifest {
  generatedAt: string;
  localOnly: true;
  items: RuntimeAttentionItem[];
  summary: Record<RuntimeAttentionState, number>;
  priority: RuntimeAttentionItem[];
  note: string;
}

export interface RuntimeAttentionDryRun {
  itemId: string;
  decision: "allow" | "deny" | "requires_approval";
  risk: "safe" | "approval-required" | "blocked";
  commandPreview: string;
  message: string;
  dataTouched: string[];
  localOnly: true;
}

export function buildRuntimeAttention(params: {
  generatedAt: string;
  voice: VoiceRuntimeReadiness;
  modelManifests: {
    ready: ModelAssetManifest[];
    futureScaling: ModelAssetManifest[];
  };
  featureDownloads: NeededFeatureDownload[];
}): RuntimeAttentionManifest {
  const items = [
    voicePrimaryStt(params.voice),
    voiceTtsCandidate(params.voice, "tts-kokoro-82m", {
      label: "Kokoro neural TTS",
      nextAction: "Download the Kokoro snapshot, then run the voice setup doctor before making it the preferred TTS engine.",
      commandPreview:
        'hf download hexgrad/Kokoro-82M --local-dir "C:\\Users\\user\\Downloads\\Secretary Jarvis\\models\\huggingface\\snapshots\\hexgrad__Kokoro-82M"',
      dataTouched: ["Hugging Face local cache", "models/huggingface/snapshots/hexgrad__Kokoro-82M"],
    }),
    voiceTtsCandidate(params.voice, "tts-piper", {
      label: "Piper local TTS",
      nextAction: "Place piper.exe and at least one ONNX voice under tools/piper, or keep SAPI as fallback.",
      commandPreview: 'manual install: tools\\piper\\piper.exe plus tools\\piper\\voices\\*.onnx and matching JSON config',
      dataTouched: ["tools/piper"],
    }),
    voiceTtsCandidate(params.voice, "tts-windows-sapi", {
      label: "Windows SAPI fallback",
      nextAction: "Keep SAPI available as the immediate local fallback while neural voices are staged.",
      dataTouched: ["Windows local speech runtime"],
    }),
    voiceTtsCandidate(params.voice, "tts-omnivoice", {
      label: "OmniVoice advanced voice",
      nextAction: "Treat OmniVoice as an optional advanced experiment after Kokoro is stable.",
      commandPreview:
        'hf download k2-fsa/OmniVoice --local-dir "C:\\Users\\user\\Downloads\\Secretary Jarvis\\models\\huggingface\\snapshots\\k2-fsa__OmniVoice"',
      dataTouched: ["Hugging Face local cache", "models/huggingface/snapshots/k2-fsa__OmniVoice"],
    }),
    voiceWake(params.voice),
    voiceVad(params.voice),
    ...modelAttention(params.modelManifests.ready, false),
    ...modelAttention(params.modelManifests.futureScaling, true),
    ...featureAttention(params.featureDownloads),
  ];
  const summary = {
    ready: items.filter((item) => item.state === "ready").length,
    attention: items.filter((item) => item.state === "attention").length,
    blocked: items.filter((item) => item.state === "blocked").length,
    staged: items.filter((item) => item.state === "staged").length,
  };

  return {
    generatedAt: params.generatedAt,
    localOnly: true,
    items,
    summary,
    priority: items.filter((item) => item.state === "blocked" || item.state === "attention").slice(0, 6),
    note: "Runtime attention is read-only. Commands are previews and use HF_TOKEN from the environment or vault only; no pasted tokens are stored or printed.",
  };
}

export function createRuntimeAttentionDryRun(manifest: RuntimeAttentionManifest, itemId: string): RuntimeAttentionDryRun {
  const item = manifest.items.find((candidate) => candidate.id === itemId);
  if (!item) {
    return {
      itemId,
      decision: "deny",
      risk: "blocked",
      commandPreview: "No command available.",
      message: "Runtime attention item was not found.",
      dataTouched: [],
      localOnly: true,
    };
  }

  if (!item.commandPreview) {
    return {
      itemId,
      decision: item.state === "ready" ? "allow" : "requires_approval",
      risk: item.state === "ready" ? "safe" : "approval-required",
      commandPreview: "No command is needed for this item.",
      message: item.nextAction,
      dataTouched: item.dataTouched,
      localOnly: true,
    };
  }

  return {
    itemId,
    decision: item.approvalRequired ? "requires_approval" : "allow",
    risk: item.approvalRequired ? "approval-required" : "safe",
    commandPreview: item.commandPreview,
    message: item.approvalRequired
      ? "Preview only. Install/download actions require explicit owner approval and must use HF_TOKEN from the environment or connector vault."
      : "Preview only. This action is safe to inspect.",
    dataTouched: item.dataTouched,
    localOnly: true,
  };
}

function voicePrimaryStt(voice: VoiceRuntimeReadiness): RuntimeAttentionItem {
  const missingRuntime = voice.primaryStt.notes.find((note) => note.includes("Transformers: missing") || note.includes("Torch: missing"));
  const state = voice.primaryStt.status === "ready" ? "ready" : voice.primaryStt.status === "ready-asset" ? "attention" : "blocked";
  return {
    id: "attention-whisper-python-runtime",
    category: "voice",
    label: "Whisper STT runtime",
    state,
    reason: missingRuntime ?? voice.primaryStt.notes[0] ?? "Primary STT route.",
    nextAction:
      state === "ready"
        ? "Whisper STT is runnable."
        : "Install or verify Python packages for the local Whisper snapshot before enabling live STT.",
    expectedPath: voice.primaryStt.path,
    commandPreview: "python -m pip install transformers torch accelerate sentencepiece soundfile",
    approvalRequired: state !== "ready",
    dataTouched: ["Python environment", "local Whisper snapshot"],
  };
}

function voiceTtsCandidate(
  voice: VoiceRuntimeReadiness,
  probeId: string,
  fallback: {
    label: string;
    nextAction: string;
    commandPreview?: string;
    dataTouched: string[];
  },
): RuntimeAttentionItem {
  const probe = voice.tts.find((candidate) => candidate.id === probeId);
  const state = probe?.status === "ready" ? "ready" : probe?.status === "staged" ? "attention" : probe?.status === "missing" ? "attention" : "staged";
  return {
    id: `attention-${probeId}`,
    category: "voice",
    label: probe?.label ?? fallback.label,
    state,
    reason: probe?.notes[0] ?? "TTS route is staged.",
    nextAction: state === "ready" ? `${probe?.label ?? fallback.label} is runnable.` : fallback.nextAction,
    expectedPath: probe?.path,
    commandPreview: fallback.commandPreview,
    approvalRequired: Boolean(fallback.commandPreview) && state !== "ready",
    dataTouched: fallback.dataTouched,
  };
}

function voiceWake(voice: VoiceRuntimeReadiness): RuntimeAttentionItem {
  const state = voice.wakeState === "wake-armed" ? "ready" : voice.wakeState === "push-to-talk" ? "attention" : "staged";
  return {
    id: "attention-wake-word",
    category: "voice",
    label: "Wake word",
    state,
    reason: voice.wakeWord.notes[0] ?? "Wake-word capture remains approval-gated.",
    nextAction:
      state === "ready"
        ? "Wake word is armed."
        : "Install a wake engine/profile, then approve continuous mic capture from Jarvis before enabling automatic wake.",
    expectedPath: voice.wakeWord.path,
    commandPreview: "scripts\\setup-voice-runtime.ps1 -Action ShowCommands",
    approvalRequired: true,
    dataTouched: ["microphone permission state", "models/wake-word"],
  };
}

function voiceVad(voice: VoiceRuntimeReadiness): RuntimeAttentionItem {
  return {
    id: "attention-vad",
    category: "voice",
    label: voice.vad.label,
    state: voice.vad.status === "ready" ? "ready" : "attention",
    reason: voice.vad.notes[0] ?? "VAD path.",
    nextAction: voice.vad.status === "ready" ? "VAD is available." : "Install webrtcvad or silero-vad for production microphone segmentation.",
    commandPreview: "python -m pip install webrtcvad",
    approvalRequired: voice.vad.status !== "ready",
    dataTouched: ["Python environment"],
  };
}

function modelAttention(manifests: ModelAssetManifest[], futureScaling: boolean): RuntimeAttentionItem[] {
  return manifests
    .filter((manifest) => futureScaling || manifest.integrity !== "complete")
    .slice(0, futureScaling ? 3 : 8)
    .map((manifest) => {
      const complete = manifest.integrity === "complete";
      return {
        id: `attention-model-${manifest.id}`,
        category: "models",
        label: manifest.label,
        state: futureScaling ? "staged" : complete ? "ready" : "blocked",
        reason:
          manifest.partialReasons?.join(", ") ??
          manifest.runtimeRecommendation ??
          (futureScaling ? "Future scaling model; not part of laptop default routing." : "Model asset requires runtime probe."),
        nextAction: complete
          ? manifest.runtimeRecommendation ?? "Probe a local endpoint before routing tasks here."
          : "Repair/download the local asset before probing runtime adapters.",
        expectedPath: manifest.localPath,
        commandPreview: futureScaling || complete ? undefined : "Use hf download or resume the local model download into the expected folder.",
        approvalRequired: !complete,
        dataTouched: ["model folder", manifest.localPath ?? "model path"].filter(Boolean),
      } satisfies RuntimeAttentionItem;
    });
}

function featureAttention(downloads: NeededFeatureDownload[]): RuntimeAttentionItem[] {
  return downloads
    .filter((download) => download.status !== "detected")
    .slice(0, 10)
    .map((download) => ({
      id: `attention-${download.id}`,
      category: download.category === "connector" ? "connectors" : download.category,
      label: download.label,
      state: download.status === "optional" ? "staged" : "attention",
      reason: download.purpose,
      nextAction: download.installHint,
      expectedPath: download.expectedPath,
      commandPreview: download.installHint,
      approvalRequired: true,
      dataTouched: [download.expectedPath, ...download.plugsInto],
    }));
}
