import { describe, expect, it } from "vitest";
import type { PolicyDecision } from "@jarvis/core";
import { createRuntimeAdapterRepairDryRun, isRuntimeAdapterRepairKind } from "../src/runtimeAdapterRepair.js";
import type { WakeRuntimeActivationReadiness } from "../src/wakeRuntimeActivation.js";

describe("runtime adapter repair dry-runs", () => {
  it("creates approval-gated Ollama PATH repair previews without mutating the system", () => {
    const dryRun = createRuntimeAdapterRepairDryRun({
      id: "repair-ollama-path",
      repair: "ollama-path",
      activation: activationFixture(),
      createdAt: "2026-05-16T00:00:00.000Z",
      evaluate: approvalRequired,
    });

    expect(dryRun.decision.decision).toBe("requires_approval");
    expect(dryRun.action.category).toBe("run-script");
    expect(dryRun.commandPreview).toContain("SetEnvironmentVariable");
    expect(dryRun.message).toContain("Dry-run only");
    expect(dryRun.notes.join(" ")).toContain("will not mutate User PATH");
  });

  it("creates sensor-gated hotword enable previews", () => {
    const dryRun = createRuntimeAdapterRepairDryRun({
      id: "repair-hotword",
      repair: "hotword-enable",
      activation: activationFixture(),
      createdAt: "2026-05-16T00:00:00.000Z",
      evaluate: approvalRequired,
    });

    expect(dryRun.action.category).toBe("sensor-capture");
    expect(dryRun.dataTouched).toContain("microphone capture state");
    expect(dryRun.commandPreview).toContain("wake-word");
  });

  it("validates repair kinds", () => {
    expect(isRuntimeAdapterRepairKind("ollama-launch")).toBe(true);
    expect(isRuntimeAdapterRepairKind("unknown")).toBe(false);
  });
});

function approvalRequired(action: { id: string }): PolicyDecision {
  return {
    actionId: action.id,
    decision: "requires_approval",
    risk: "approval-required",
    reasons: ["test approval gate"],
  };
}

function activationFixture(): WakeRuntimeActivationReadiness {
  return {
    generatedAt: "2026-05-16T00:00:00.000Z",
    root: "C:/jarvis",
    localOnly: true,
    wake: {
      methods: [],
      summary: { ready: 2, staged: 1, approvalGated: 1 },
      privacyNote: "Continuous microphone wake remains disabled until approval.",
    },
    voice: {
      primaryStt: "ready",
      vad: "staged",
      wakeWord: "missing",
      ttsReady: true,
      sampleCount: 4,
      note: "manual voice ready",
    },
    ollama: {
      status: "found-off-path",
      command: "ollama",
      detectedPath: "C:\\Users\\user\\AppData\\Local\\Programs\\Ollama\\ollama.exe",
      endpoint: "http://127.0.0.1:11434",
      repairCommands: ["Add Ollama to PATH"],
      note: "Ollama found off PATH.",
    },
    adapters: [],
    safeActions: [
      {
        id: "repair-ollama-path",
        label: "Repair Ollama PATH",
        approvalRequired: true,
        commandPreview:
          "[Environment]::SetEnvironmentVariable('Path', $env:Path + ';C:\\Users\\user\\AppData\\Local\\Programs\\Ollama', 'User')",
        detail: "preview",
      },
    ],
    summary: {
      reliableWakeMethods: 2,
      stagedWakeMethods: 1,
      ollamaUsable: true,
      localModelAdaptersReady: 1,
    },
    recommendations: [],
  };
}
