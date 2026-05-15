import { describe, expect, it } from "vitest";
import {
  appendTranscriptChunk,
  createModelDryRun,
  createOutboundMessageDraft,
  createVoiceSession,
  evaluateActionPolicy,
  resolveToolStatus,
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
