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
});
