import type {
  NeededFeatureDownload,
  PrivacyMode,
  RuntimeConstellation,
  RuntimeConstellationNode,
  VisionRuntimeReadiness,
  VoiceRuntimeReadiness,
} from "@jarvis/core";
import type { ModelAssetManifest } from "@jarvis/core";

export interface RuntimeConstellationInput {
  readyModels: ModelAssetManifest[];
  futureScalingModels: ModelAssetManifest[];
  voice: VoiceRuntimeReadiness;
  vision: VisionRuntimeReadiness;
  neededFeatureDownloads: NeededFeatureDownload[];
  privacyMode: PrivacyMode;
  updatedAt: string;
}

export function buildRuntimeConstellation(input: RuntimeConstellationInput): RuntimeConstellation {
  const readyModelCount = input.readyModels.filter((manifest) => manifest.status === "complete").length;
  const futureReadyCount = input.futureScalingModels.filter((manifest) => manifest.status === "complete").length;
  const missingFeatureDownloads = input.neededFeatureDownloads.filter((download) => download.status === "needed").length;
  const optionalFeatureDownloads = input.neededFeatureDownloads.filter((download) => download.status === "optional").length;

  const nodes: RuntimeConstellationNode[] = [
    {
      id: "constellation-models",
      label: "Models",
      kind: "models",
      status: readyModelCount === input.readyModels.length && readyModelCount > 0 ? "ready" : readyModelCount > 0 ? "ready-asset" : "attention",
      value: `${readyModelCount}/${input.readyModels.length}`,
      detail:
        futureReadyCount > 0
          ? `${futureReadyCount} future scaling asset(s) also detected.`
          : "Ready local assets stay separate from future scaling models.",
      tone: readyModelCount > 0 ? "cyan" : "amber",
    },
    {
      id: "constellation-voice",
      label: "Voice",
      kind: "voice",
      status: input.voice.summary.sttReady && input.voice.summary.ttsReady ? "ready" : input.voice.summary.sttReady ? "staged" : "attention",
      value: input.voice.summary.sttReady ? `${input.voice.summary.sampleCount} samples` : "staged",
      detail: input.voice.summary.ttsReady ? "STT/TTS fallback path available." : "Voice is wired; install Piper/Vosk/wake dependencies for full loop.",
      tone: input.voice.summary.sttReady && input.voice.summary.ttsReady ? "green" : "amber",
    },
    {
      id: "constellation-vision",
      label: "Vision",
      kind: "vision",
      status: input.vision.summary.localVisionAssets > 0 ? "ready-asset" : "staged",
      value: `${input.vision.summary.localVisionAssets} assets`,
      detail: input.vision.summary.ocrReady
        ? "OCR runtime is available; sensors remain approval-gated."
        : "Vision assets are probed safely; OCR/YOLO/LLaVA dependencies may still be staged.",
      tone: input.vision.summary.localVisionAssets > 0 ? "cyan" : "amber",
    },
    {
      id: "constellation-privacy",
      label: "Privacy",
      kind: "privacy",
      status: input.privacyMode === "strict-local" ? "locked" : "staged",
      value: input.privacyMode === "strict-local" ? "sealed" : input.privacyMode,
      detail: "Screen, camera, social sends, credentials, deletes, and irreversible actions stay approval-gated.",
      tone: input.privacyMode === "strict-local" ? "magenta" : "amber",
    },
    {
      id: "constellation-setup",
      label: "Setup",
      kind: "setup",
      status: missingFeatureDownloads === 0 ? "ready" : "attention",
      value: `${missingFeatureDownloads} needed`,
      detail: `${optionalFeatureDownloads} optional feature dependency path(s) remain staged.`,
      tone: missingFeatureDownloads === 0 ? "green" : "amber",
    },
  ];

  return {
    id: "runtime-constellation",
    localOnly: true,
    updatedAt: input.updatedAt,
    nodes,
    summary: {
      ready: nodes.filter((node) => node.status === "ready" || node.status === "ready-asset").length,
      staged: nodes.filter((node) => node.status === "staged").length,
      attention: nodes.filter((node) => node.status === "attention").length,
      locked: nodes.filter((node) => node.status === "locked").length,
    },
    note: "Compact readiness only. Detailed logs and raw diagnostics stay behind expandable panels.",
  };
}
