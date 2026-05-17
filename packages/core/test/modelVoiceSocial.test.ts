import { describe, expect, it } from "vitest";
import {
  appendTranscriptChunk,
  createModelDryRun,
  createOutboundMessageDraft,
  createVoiceSession,
  futureScalingModels,
  hydrateReadyModelAssets,
  neededFeatureDownloads,
  readinessForModel,
  readyModelAssets,
  defaultModelProfiles,
  defaultRuntimeAdapters,
  evaluateActionPolicy,
  resolveToolStatus,
  selectModelForTask,
  seededStatus,
} from "../src/index.js";

describe("model install dry runs", () => {
  it("creates a gated Hugging Face dry-run plan without downloading", () => {
    const dryRun = createModelDryRun({
      id: "dry-run-1",
      modelRef: "Qwen/Qwen3.5-9B",
      source: "huggingface",
      runtime: "huggingface-local",
      connectorId: "huggingface-local",
    });

    expect(dryRun.willDownload).toBe(true);
    expect(dryRun.estimatedSizeGb).toBe(22);
    expect(dryRun.installPlan.commandPreview).toBe("hf download Qwen/Qwen3.5-9B --dry-run");
    expect(dryRun.approvalAction.category).toBe("model-download");
  });

  it("requires approval for a model download through an enabled connector", () => {
    const dryRun = createModelDryRun({
      id: "dry-run-2",
      modelRef: "openai/whisper-large-v3-turbo",
      source: "huggingface",
      runtime: "huggingface-local",
      connectorId: "huggingface-local",
    });

    const decision = evaluateActionPolicy({
      action: dryRun.approvalAction,
      privacyMode: "strict-local",
      allowedConnectors: ["huggingface-local"],
    });

    expect(decision.decision).toBe("requires_approval");
  });
});

describe("model readiness catalogs", () => {
  it("lists exactly the five owner-downloaded ready assets", () => {
    expect(readyModelAssets.map((asset) => asset.modelRef).sort()).toEqual([
      "Qwen/Qwen3.5-9B",
      "Qwen/Qwen3.6-27B",
      "google/gemma-4-26B-A4B-it",
      "google/gemma-4-E4B-it",
      "openai/whisper-large-v3-turbo",
    ]);
  });

  it("keeps ready local assets separate from future scaling models", () => {
    expect(readyModelAssets.map((asset) => asset.profileId)).toEqual(
      expect.arrayContaining([
        "hf-qwen35-9b",
        "hf-qwen36-27b",
        "hf-whisper-large-v3-turbo",
        "hf-gemma4-e4b-it",
        "hf-gemma4-26b-a4b-it",
      ]),
    );
    expect(futureScalingModels.map((model) => model.modelRef)).toContain("deepseek-ai/DeepSeek-V4-Flash");
    expect(neededFeatureDownloads.some((download) => download.id === "feature-kokoro-82m")).toBe(true);
    expect(neededFeatureDownloads.some((download) => download.id === "feature-piper")).toBe(true);
    expect(neededFeatureDownloads.some((download) => download.label.includes("DeepSeek"))).toBe(false);
  });

  it("keeps feature dependency downloads separate from scale-up model choices", () => {
    const featureRefs = new Set(neededFeatureDownloads.map((download) => download.id));
    const scalingRefs = new Set(futureScalingModels.map((model) => model.modelRef));

    expect(featureRefs.has("feature-kokoro-82m")).toBe(true);
    expect(featureRefs.has("feature-omnivoice")).toBe(true);
    expect(featureRefs.has("feature-piper")).toBe(true);
    expect(featureRefs.has("feature-yolo")).toBe(true);
    expect(scalingRefs.has("deepseek-ai/DeepSeek-V4-Flash")).toBe(true);
    expect([...scalingRefs]).not.toContain("openai/whisper-large-v3-turbo");
    expect([...scalingRefs]).not.toContain("google/gemma-4-26B-A4B-it");
  });

  it("declares local runtime adapters while keeping hosted inference disabled", () => {
    expect(defaultRuntimeAdapters.map((adapter) => adapter.id)).toEqual(
      expect.arrayContaining(["ollama", "huggingface-local", "llama-cpp", "lmstudio", "vllm", "sglang", "huggingface-tgi"]),
    );
    expect(defaultRuntimeAdapters.find((adapter) => adapter.id === "huggingface-tgi")).toMatchObject({
      localOnly: false,
      enabledByDefault: false,
    });
  });

  it("classifies downloaded heavy assets as ready assets that still need an appropriate runtime", () => {
    const assets = hydrateReadyModelAssets((path) => path.includes("Qwen__Qwen3.6-27B"));
    const qwen27 = defaultModelProfiles.find((model) => model.id === "hf-qwen36-27b");
    expect(qwen27).toBeDefined();
    const readiness = readinessForModel(qwen27!, () => false, assets);

    expect(readiness.downloadState).toBe("complete");
    expect(readiness.runtimeState).toBe("needs-runtime");
    expect(readiness.hardwareFit).toBe("workstation");
  });

  it("marks ready model assets as detected only when their expected folders exist", () => {
    const assets = hydrateReadyModelAssets((path) => path.endsWith("openai__whisper-large-v3-turbo"));
    const whisper = assets.find((asset) => asset.profileId === "hf-whisper-large-v3-turbo");
    const qwen = assets.find((asset) => asset.profileId === "hf-qwen35-9b");

    expect(whisper?.detected).toBe(true);
    expect(whisper?.detectedPath).toContain("openai__whisper-large-v3-turbo");
    expect(qwen?.detected).toBe(false);
  });

  it("uses a successful runtime probe to route workstation work to the heavier Qwen asset", () => {
    const model = selectModelForTask({
      taskProfile: "coding",
      scaleProfile: "workstation",
      models: defaultModelProfiles,
      readiness: [
        {
          modelId: "hf-qwen35-9b",
          label: "Qwen3.5 9B Multimodal",
          modelRef: "Qwen/Qwen3.5-9B",
          downloadState: "complete",
          runtimeState: "ready-asset",
          hardwareFit: "laptop-staged",
          runtimePlan: "Safe local asset.",
          missingFiles: [],
          recommendedUse: "coding",
          nextAction: "probe",
        },
        {
          modelId: "hf-qwen36-27b",
          label: "Qwen3.6 27B Homelab",
          modelRef: "Qwen/Qwen3.6-27B",
          downloadState: "complete",
          runtimeState: "needs-runtime",
          hardwareFit: "workstation",
          runtimePlan: "SGLang endpoint is serving.",
          missingFiles: [],
          recommendedUse: "heavy coding",
          nextAction: "use endpoint",
          runtimeProbe: {
            id: "probe-qwen36",
            modelId: "hf-qwen36-27b",
            modelRef: "Qwen/Qwen3.6-27B",
            runtime: "sglang",
            status: "served",
            ok: true,
            safeMode: true,
            checkedAt: "2026-05-16T12:00:00.000Z",
            latencyMs: 240,
            endpoint: "http://127.0.0.1:8000",
            notes: ["Local endpoint served."],
            blockers: [],
          },
        },
      ],
    });

    expect(model.id).toBe("hf-qwen36-27b");
  });
});

describe("tool doctor helpers", () => {
  it("reports a local installer when a command is not on PATH", () => {
    const status = resolveToolStatus({
      id: "ollama",
      label: "Ollama",
      command: "ollama",
      localInstallerPath: "C:\\Users\\user\\Downloads\\Secretary Jarvis\\OllamaSetup.exe",
    });

    expect(status.installed).toBe(false);
    expect(status.notes).toContain("local installer");
  });
});

describe("voice session helpers", () => {
  it("uses Whisper large-v3-turbo as the primary STT engine", () => {
    expect(seededStatus.voiceSession?.sttEngineId).toBe("whisper-large-v3-turbo");
    expect(seededStatus.audioEngines?.find((engine) => engine.id === "whisper-large-v3-turbo")).toMatchObject({
      role: "stt",
      modelRef: "openai/whisper-large-v3-turbo",
    });
  });

  it("tracks the owner-provided Jarvis voice identity MP3 assets", () => {
    expect(seededStatus.voiceAssets?.map((asset) => asset.fileName).sort()).toEqual([
      "jarvis-intro-1.mp3",
      "jarvis-intro2.mp3",
      "jarvis.mp3",
      "jarvis_morning.mp3",
    ]);
    expect(seededStatus.voiceProfiles?.find((profile) => profile.agentId === "jarvis")).toMatchObject({
      enginePreference: "voice-sample",
      sampleAssetId: "voice-jarvis-main",
      status: "ready",
    });
  });

  it("lists Kokoro, OmniVoice, Piper, and Vosk as voice feature dependencies", () => {
    const voiceDownloads = neededFeatureDownloads.filter((download) => download.category === "voice");

    expect(voiceDownloads.map((download) => download.id)).toEqual(
      expect.arrayContaining(["feature-kokoro-82m", "feature-omnivoice", "feature-piper", "feature-wake-word", "feature-vosk"]),
    );
    expect(voiceDownloads.find((download) => download.id === "feature-kokoro-82m")?.installHint).toContain("HF_TOKEN");
    expect(voiceDownloads.find((download) => download.id === "feature-omnivoice")?.status).toBe("optional");
    expect(seededStatus.audioEngines?.find((engine) => engine.id === "piper-local")?.status).toBe("planned");
    expect(seededStatus.audioEngines?.find((engine) => engine.id === "vosk-streaming")?.status).toBe("planned");
  });

  it("starts in missing-tools mode when STT/TTS are unavailable", () => {
    const session = createVoiceSession({
      id: "voice-1",
      now: "2026-05-14T00:00:00.000Z",
      toolsReady: false,
    });

    expect(session.state).toBe("missing-tools");
    expect(session.vadEnabled).toBe(true);
  });

  it("appends transcript chunks and returns to idle after a final chunk", () => {
    const session = createVoiceSession({
      id: "voice-2",
      now: "2026-05-14T00:00:00.000Z",
      toolsReady: true,
    });

    const next = appendTranscriptChunk(
      session,
      {
        id: "chunk-1",
        text: "hello Jarvis",
        startMs: 0,
        endMs: 800,
        confidence: 0.9,
        engineId: "whisper-large-v3-turbo",
        final: true,
      },
      "2026-05-14T00:00:01.000Z",
    );

    expect(next.state).toBe("idle");
    expect(next.transcript).toHaveLength(1);
  });
});

describe("social draft guardrails", () => {
  it("creates a waiting approval draft and never marks it sent", () => {
    const action = {
      id: "action-1",
      title: "Draft Discord message",
      category: "send-message" as const,
      target: "friend",
      reason: "Preview outbound message",
      dataTouched: ["message draft"],
    };
    const decision = evaluateActionPolicy({
      action,
      privacyMode: "strict-local",
      allowedConnectors: [],
    });
    const draft = createOutboundMessageDraft({
      id: "draft-1",
      connectorId: "discord",
      recipient: "friend",
      channel: "Discord",
      content: "  hello  ",
      createdAt: "2026-05-14T00:00:00.000Z",
      decision,
      action,
    });

    expect(draft.status).toBe("waiting-approval");
    expect(draft.content).toBe("hello");
  });
});
