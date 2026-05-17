import { describe, expect, it } from "vitest";
import type { ModelAssetManifest, NeededFeatureDownload, VoiceRuntimeReadiness } from "@jarvis/core";
import { buildRuntimeAttention, createRuntimeAttentionDryRun } from "../src/runtimeAttention.js";

describe("runtime attention resolver", () => {
  it("summarizes voice dependency gaps without exposing credentials", () => {
    const attention = buildRuntimeAttention({
      generatedAt: "2026-05-17T00:00:00.000Z",
      voice: voiceReadiness(),
      modelManifests: {
        ready: [
          modelManifest({
            id: "ready-whisper",
            label: "Whisper",
            integrity: "complete",
            localPath: "C:/models/openai__whisper-large-v3-turbo",
          }),
          modelManifest({
            id: "ready-gemma-26b",
            label: "Gemma 26B",
            integrity: "incomplete",
            partialReasons: ["partial downloads"],
            localPath: "C:/models/gemma-4-26B-A4B-it",
          }),
        ],
        futureScaling: [
          modelManifest({
            id: "future-deepseek",
            label: "DeepSeek V4 Flash",
            catalog: "future-scaling",
            integrity: "pointer-only",
            partialReasons: ["full model weights"],
            localPath: "C:/models/DeepSeek_V4",
          }),
        ],
      },
      featureDownloads: [
        {
          id: "feature-kokoro-82m",
          category: "voice",
          label: "Kokoro-82M",
          purpose: "fast local neural TTS",
          expectedPath: "C:/models/hexgrad__Kokoro-82M",
          installHint: "hf download hexgrad/Kokoro-82M",
          status: "needed",
          plugsInto: ["voice"],
        },
      ],
    });

    expect(attention.localOnly).toBe(true);
    expect(attention.summary.attention).toBeGreaterThan(0);
    expect(attention.items.find((item) => item.id === "attention-whisper-python-runtime")?.state).toBe("attention");
    expect(attention.items.find((item) => item.id === "attention-tts-kokoro-82m")?.commandPreview).toContain("hf download hexgrad/Kokoro-82M");
    expect(attention.items.find((item) => item.id === "attention-model-ready-gemma-26b")?.state).toBe("blocked");
    expect(attention.items.find((item) => item.id === "attention-model-future-deepseek")?.state).toBe("staged");
    expect(JSON.stringify(attention)).not.toContain("hf_");

    const dryRun = createRuntimeAttentionDryRun(attention, "attention-tts-kokoro-82m");
    expect(dryRun).toMatchObject({
      decision: "requires_approval",
      risk: "approval-required",
      localOnly: true,
    });
    expect(dryRun.message).toContain("HF_TOKEN");
    expect(dryRun.commandPreview).not.toContain("hf_");
  });
});

function voiceReadiness(): VoiceRuntimeReadiness {
  return {
    primaryStt: {
      id: "stt-whisper-large-v3-turbo",
      label: "Whisper large-v3-turbo",
      kind: "stt",
      status: "ready-asset",
      installed: true,
      path: "C:/models/openai__whisper-large-v3-turbo",
      runtime: "python-transformers",
      notes: ["Whisper snapshot is present; install/verify transformers and torch before live STT.", "Transformers: missing. Torch: missing."],
    },
    tts: [
      {
        id: "tts-kokoro-82m",
        label: "Kokoro-82M local neural TTS",
        kind: "tts",
        status: "missing",
        installed: false,
        path: "C:/models/hexgrad__Kokoro-82M",
        notes: ["Kokoro-82M is not installed yet."],
      },
      {
        id: "tts-piper",
        label: "Piper local TTS",
        kind: "tts",
        status: "missing",
        installed: false,
        path: "C:/tools/piper",
        notes: ["Piper executable is missing."],
      },
      {
        id: "tts-windows-sapi",
        label: "Windows SAPI",
        kind: "tts",
        status: "ready",
        installed: true,
        notes: ["Windows SAPI can initialize locally."],
      },
      {
        id: "tts-omnivoice",
        label: "OmniVoice advanced voice",
        kind: "tts",
        status: "missing",
        installed: false,
        path: "C:/models/k2-fsa__OmniVoice",
        notes: ["OmniVoice is optional advanced voice tooling."],
      },
    ],
    ttsPreferredEngine: "tts-windows-sapi",
    fallbackStt: [],
    vad: {
      id: "vad-package-backed",
      label: "Package-backed VAD",
      kind: "vad",
      status: "staged",
      installed: false,
      notes: ["VAD is wired as a dependency-backed path."],
    },
    wakeWord: {
      id: "wake-word-jarvis",
      label: "Jarvis wake word",
      kind: "wake-word",
      status: "missing",
      installed: false,
      path: "C:/models/wake-word",
      notes: ["Install Porcupine or place a local Vosk wake profile."],
    },
    wakeState: "push-to-talk",
    identitySamples: [],
    summary: { sttReady: true, ttsReady: true, sampleCount: 0, missingRequired: 1 },
    privacy: { micCaptureActive: false, speakingActive: false, note: "No capture." },
  };
}

function modelManifest(params: Partial<ModelAssetManifest> & Pick<ModelAssetManifest, "id" | "label" | "integrity" | "localPath">): ModelAssetManifest {
  return {
    catalog: params.catalog ?? "ready",
    modelRef: params.modelRef ?? params.label,
    exists: true,
    status: params.integrity === "complete" ? "complete" : "partial",
    fileCount: 2,
    sizeBytes: 1024,
    hasConfig: true,
    hasTokenizer: true,
    hasProcessor: false,
    weightFileCount: params.integrity === "metadata-only" ? 0 : 1,
    indexFileCount: 0,
    indexedShardCount: 0,
    missingIndexedShards: [],
    requiredFilesMissing: params.partialReasons ?? [],
    notes: ["test"],
    runnableState: params.integrity === "complete" ? "downloaded" : "incomplete",
    partialReasons: params.partialReasons,
    pointerFileCount: params.integrity === "pointer-only" ? 1 : 0,
    partialDownloadFileCount: params.integrity === "incomplete" ? 1 : 0,
    runtimeRecommendation: params.runtimeRecommendation,
    ...params,
  };
}
