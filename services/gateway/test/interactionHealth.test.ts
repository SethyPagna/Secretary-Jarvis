import { describe, expect, it } from "vitest";
import { seededStatus, seedWorkflows } from "@jarvis/core";
import { buildInteractionHealth } from "../src/interactionHealth.js";

describe("interaction health", () => {
  it("reports connected command, workflow, editing, and undo surfaces", () => {
    const health = buildInteractionHealth({
      generatedAt: "2026-05-16T00:00:00.000Z",
      status: seededStatus,
      workflows: seedWorkflows,
      workflowRuns: [],
      tasks: [],
      queue: [],
      approvals: [],
      undoJournal: [],
    });

    expect(health.summary.responsive).toBe(true);
    expect(health.summary.canTalkWhileWorking).toBe(true);
    expect(health.summary.workflowAutonomyApprovalGated).toBe(true);
    expect(health.summary.editingUndoReady).toBe(true);
    expect(health.surfaces.find((surface) => surface.id === "text")?.status).toBe("ready");
    expect(health.surfaces.find((surface) => surface.id === "voice")?.status).toBe("ready");
    expect(health.surfaces.find((surface) => surface.id === "emergency-stop")?.status).toBe("ready");
  });

  it("warns when approval pressure can make automation look frozen", () => {
    const health = buildInteractionHealth({
      generatedAt: "2026-05-16T00:00:00.000Z",
      status: seededStatus,
      workflows: seedWorkflows,
      workflowRuns: Array.from({ length: 5 }, (_, index) => ({
        id: `run-${index}`,
        workflowId: "workflow-cto-orchestrator",
        status: "waiting-approval" as const,
        input: {},
        createdAt: "2026-05-16T00:00:00.000Z",
        updatedAt: "2026-05-16T00:00:00.000Z",
      })),
      tasks: [
        {
          id: "task-running",
          conversationId: "conversation",
          title: "Run workflow",
          status: "running",
          taskProfile: "daily-assistant",
          createdAt: "2026-05-16T00:00:00.000Z",
          updatedAt: "2026-05-16T00:00:00.000Z",
        },
      ],
      queue: [],
      approvals: [],
      undoJournal: [],
    });

    expect(health.summary.freezeRisk).toBe("attention");
    expect(health.surfaces.find((surface) => surface.id === "approvals")?.status).toBe("attention");
    expect(health.recommendations.join(" ")).toContain("Clear 5 approval");
  });
});
