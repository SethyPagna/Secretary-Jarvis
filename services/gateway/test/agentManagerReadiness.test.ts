import { describe, expect, it } from "vitest";
import { seedWorkflows, seededStatus, type TaskQueueItem, type TaskRun, type WorkflowRun } from "@jarvis/core";
import { buildAgentManagerReadiness } from "../src/agentManagerReadiness.js";

describe("agent manager readiness", () => {
  it("reports distinct voice coverage, Sentinel review routing, and approval-gated workflow autonomy", () => {
    const readiness = buildAgentManagerReadiness({
      generatedAt: "2026-05-16T00:00:00.000Z",
      status: seededStatus,
      workflows: seedWorkflows,
      workflowRuns: [],
      tasks: [],
      queue: [],
      approvals: [],
    });

    expect(readiness.manager.connected).toBe(true);
    expect(readiness.voices.coveredAgents).toBe(8);
    expect(readiness.voices.distinctProfileCount).toBe(8);
    expect(readiness.routing.every((route) => route.approvalReviewerConnected)).toBe(true);
    expect(readiness.workflowAutonomy.managerWorkflowReady).toBe(true);
    expect(readiness.workflowAutonomy.approvalGatedSteps).toBeGreaterThan(0);
    expect(readiness.summary).toMatchObject({
      voicesCovered: true,
      managerConnected: true,
      workflowsApprovalGated: true,
      responsePathHealthy: true,
    });
  });

  it("raises attention when approval backlog can make work feel frozen", () => {
    const tasks: TaskRun[] = [
      {
        id: "task-running",
        conversationId: "conversation-test",
        title: "Long running task",
        status: "running",
        taskProfile: "coding",
        createdAt: "2026-05-16T00:00:00.000Z",
        updatedAt: "2026-05-16T00:00:00.000Z",
        events: [],
      },
    ];
    const queue: TaskQueueItem[] = [
      {
        id: "queue-running",
        taskRunId: "task-running",
        status: "running",
        priority: 1,
        enqueuedAt: "2026-05-16T00:00:00.000Z",
      },
    ];
    const workflowRuns: WorkflowRun[] = Array.from({ length: 5 }, (_, index) => ({
      id: `workflow-run-${index}`,
      workflowId: "workflow-code-review",
      status: "waiting-approval",
      input: {},
      createdAt: "2026-05-16T00:00:00.000Z",
      updatedAt: "2026-05-16T00:00:00.000Z",
    }));

    const readiness = buildAgentManagerReadiness({
      generatedAt: "2026-05-16T00:00:00.000Z",
      status: seededStatus,
      workflows: seedWorkflows,
      workflowRuns,
      tasks,
      queue,
      approvals: [],
    });

    expect(readiness.responseHealth.freezeRisk).toBe("attention");
    expect(readiness.responseHealth.note).toContain("Approval backlog");
    expect(readiness.summary.responsePathHealthy).toBe(false);
  });
});
