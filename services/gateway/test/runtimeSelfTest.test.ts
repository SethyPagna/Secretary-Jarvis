import { describe, expect, it } from "vitest";
import { buildRuntimeSelfTest } from "../src/runtimeSelfTest.js";

const generatedAt = "2026-05-16T00:00:00.000Z";

describe("runtime self-test", () => {
  it("aggregates connected runtime checks and safe dry-run fixes", () => {
    const selfTest = buildRuntimeSelfTest({
      generatedAt,
      activation: {
        generatedAt,
        root: "C:/jarvis",
        localOnly: true,
        wake: {
          methods: [],
          summary: { ready: 3, staged: 1, approvalGated: 1 },
          privacyNote: "mic gated",
        },
        voice: {
          primaryStt: "ready",
          vad: "staged",
          wakeWord: "missing",
          ttsReady: true,
          sampleCount: 4,
          note: "voice bridge ready",
        },
        ollama: {
          status: "found-off-path",
          command: "ollama",
          detectedPath: "C:/Users/user/AppData/Local/Programs/Ollama/ollama.exe",
          endpoint: "http://127.0.0.1:11434",
          repairCommands: ["Add Ollama to PATH"],
          note: "Ollama found off PATH.",
        },
        adapters: [],
        safeActions: [],
        summary: {
          reliableWakeMethods: 3,
          stagedWakeMethods: 1,
          ollamaUsable: true,
          localModelAdaptersReady: 1,
        },
        recommendations: [],
      },
      manager: {
        generatedAt,
        localOnly: true,
        manager: { id: "jarvis", label: "Jarvis", role: "manager", connected: true, detail: "manager connected" },
        agents: [],
        voices: { totalAgents: 8, profiles: 8, coveredAgents: 8, distinctProfileCount: 8, ready: 5, staged: 3, missing: 0 },
        routing: [],
        workflowAutonomy: {
          workflows: 4,
          generatedWorkflows: 1,
          enabledWorkflows: 4,
          approvalGatedSteps: 3,
          blockedSteps: 0,
          managerWorkflowReady: true,
          automationNote: "approval gated",
        },
        responseHealth: { runningTasks: 0, queuedItems: 0, waitingApprovals: 0, activeWorkflowRuns: 0, freezeRisk: "low", note: "healthy" },
        summary: { agentsReady: 8, voicesCovered: true, managerConnected: true, workflowsApprovalGated: true, responsePathHealthy: true },
        recommendations: [],
      },
      interaction: {
        generatedAt,
        localOnly: true,
        surfaces: [],
        metrics: {
          runningTasks: 0,
          queuedItems: 0,
          waitingApprovals: 0,
          activeWorkflowRuns: 0,
          generatedWorkflows: 1,
          enabledWorkflows: 4,
          availableUndos: 0,
        },
        summary: {
          responsive: true,
          canTalkWhileWorking: true,
          workflowAutonomyApprovalGated: true,
          editingUndoReady: true,
          freezeRisk: "low",
        },
        recommendations: [],
      },
      packaging: {
        summary: { electronShellReady: true, tauriFallbackReady: false, startupScriptsReady: true, productionCommandsReady: true },
        electron: { note: "Electron HUD ready." },
      } as any,
      processVisibility: {
        summary: { tracked: 5, pidFilesPresent: 0, alive: 2, visibleInTaskManager: 2 },
      } as any,
      startupPlans: {
        generatedAt,
        root: "C:/jarvis",
        plans: [{ id: "startup-standard", label: "Standard", mode: "standard", runLevel: "limited", status: "check-only", approvalRequired: true }],
        note: "dry-run",
      } as any,
      services: {
        localOnly: true,
        checkedAt: generatedAt,
        services: [
          { id: "gateway", label: "Gateway", status: "online" },
          { id: "brain", label: "Brain", status: "offline" },
        ],
        summary: { online: 1, degraded: 0, offline: 1, unknown: 0 },
        note: "one service offline",
      } as any,
    });

    expect(selfTest.summary.topStatus).toBe("attention");
    expect(selfTest.summary.connected).toBe(true);
    expect(selfTest.checks.map((check) => check.id)).toContain("model-adapters");
    expect(selfTest.fixes.map((fix) => fix.id)).toEqual([
      "fix-ollama-path",
      "fix-hotword-enable",
      "fix-start-runtime",
      "fix-register-startup",
    ]);
    expect(selfTest.fixes[0]?.dryRunEndpoint).toBe("/api/runtime/adapter-repair/dry-run");
    expect(selfTest.recommendations.join(" ")).toContain("dry-run");
  });
});
