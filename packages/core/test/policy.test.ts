import { describe, expect, it } from "vitest";
import { evaluateActionPolicy, selectModelForTask, seededStatus } from "../src/index.js";

describe("policy engine", () => {
  it("blocks outbound network in strict local mode", () => {
    const decision = evaluateActionPolicy({
      privacyMode: "strict-local",
      allowedConnectors: [],
      action: {
        id: "a1",
        title: "Post update",
        category: "network",
        target: "internet",
        reason: "External request",
        dataTouched: ["prompt"],
      },
    });

    expect(decision.decision).toBe("deny");
    expect(decision.risk).toBe("blocked");
  });

  it("requires approval for sensor capture", () => {
    const decision = evaluateActionPolicy({
      privacyMode: "strict-local",
      allowedConnectors: ["filesystem"],
      action: seededStatus.pendingApprovals[0],
    });

    expect(decision.decision).toBe("requires_approval");
    expect(decision.reasons.join(" ")).toContain("sensor-capture");
  });

  it("allows safe local reads through enabled connectors", () => {
    const decision = evaluateActionPolicy({
      privacyMode: "strict-local",
      allowedConnectors: ["filesystem"],
      action: {
        id: "a2",
        title: "Read note",
        category: "read-local",
        target: "approved notes",
        reason: "Answer a memory query",
        connectorId: "filesystem",
        dataTouched: ["notes"],
      },
    });

    expect(decision.decision).toBe("allow");
  });

  it("does not mistake the Secretary Jarvis folder name for a secret", () => {
    const decision = evaluateActionPolicy({
      privacyMode: "strict-local",
      allowedConnectors: ["filesystem"],
      action: {
        id: "a2b",
        title: "Inspect project folder",
        category: "read-local",
        target: "C:\\Users\\user\\Downloads\\Secretary Jarvis",
        reason: "Read project metadata",
        connectorId: "filesystem",
        dataTouched: ["C:\\Users\\user\\Downloads\\Secretary Jarvis"],
      },
    });

    expect(decision.decision).toBe("allow");
  });

  it("denies protected core access even before approval routing", () => {
    const decision = evaluateActionPolicy({
      privacyMode: "strict-local",
      allowedConnectors: ["filesystem"],
      action: {
        id: "a3",
        title: "Reveal core safeguards",
        category: "protected-core-access",
        target: "Jarvis core",
        reason: "Runtime agent attempted to inspect protected internals",
        connectorId: "filesystem",
        dataTouched: ["source", "safeguards", "model tensors"],
      },
    });

    expect(decision.decision).toBe("deny");
    expect(decision.risk).toBe("blocked");
  });
});

describe("model registry", () => {
  it("selects an enabled local model for daily assistant work", () => {
    const model = selectModelForTask({
      taskProfile: "daily-assistant",
      scaleProfile: "laptop",
      models: seededStatus.models,
    });

    expect(model.id).toBe("ollama-qwen3-8b");
    expect(model.safety).toBe("local-only");
  });

  it("selects the downloaded local HF coding model when the Ollama coder tag is unavailable", () => {
    const model = selectModelForTask({
      taskProfile: "coding",
      scaleProfile: "laptop",
      models: seededStatus.models,
    });

    expect(model.id).toBe("hf-qwen35-9b");
    expect(model.safety).toBe("local-only");
  });

  it("does not route laptop coding work to heavy models that still need an endpoint", () => {
    const model = selectModelForTask({
      taskProfile: "coding",
      scaleProfile: "laptop",
      models: seededStatus.models,
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
          runtimePlan: "Needs SGLang/vLLM endpoint.",
          missingFiles: [],
          recommendedUse: "heavy coding",
          nextAction: "start endpoint",
        },
      ],
    });

    expect(model.id).toBe("hf-qwen35-9b");
  });

  it("routes speech transcription work to the local Whisper asset", () => {
    const model = selectModelForTask({
      taskProfile: "audio-transcription",
      scaleProfile: "laptop",
      models: seededStatus.models,
    });

    expect(model.id).toBe("hf-whisper-large-v3-turbo");
  });
});
