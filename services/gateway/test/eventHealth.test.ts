import { describe, expect, it } from "vitest";
import type { ActionRequest, TaskQueueItem, TaskRun, TimelineEvent, WorkflowRun } from "@jarvis/core";
import { buildRuntimeEventHealth } from "../src/eventHealth.js";

describe("runtime event health", () => {
  it("flags pending approvals and failures as attention", () => {
    const health = buildRuntimeEventHealth({
      checkedAt: "2026-05-16T00:00:00.000Z",
      tasks: [task("task-1", "cancelled")],
      queue: [queueItem("task-2", "running"), queueItem("task-3", "queued")],
      approvals: [approval("approval-1", "run-script")],
      timeline: [timelineEvent("timeline-1", "Blocked action", "policy denied", "blocked")],
      workflowRuns: [workflowRun("workflow-run-1", "failed")],
    });

    expect(health.status).toBe("attention");
    expect(health.queue.running).toBe(1);
    expect(health.queue.queued).toBe(1);
    expect(health.approvals.pending).toBe(1);
    expect(health.recentFailures.length).toBeGreaterThanOrEqual(3);
  });

  it("reports quiet when queue, approvals, and failures are clear", () => {
    const health = buildRuntimeEventHealth({
      checkedAt: "2026-05-16T00:00:00.000Z",
      tasks: [],
      queue: [],
      approvals: [],
      timeline: [],
      workflowRuns: [],
    });

    expect(health.status).toBe("quiet");
    expect(health.message).toContain("quiet");
  });
});

function task(id: string, status: TaskRun["status"]): TaskRun {
  return {
    id,
    conversationId: "conversation",
    title: id,
    status,
    activeAgentId: "jarvis",
    taskProfile: "daily-assistant",
    createdAt: "2026-05-16T00:00:00.000Z",
    updatedAt: "2026-05-16T00:00:00.000Z",
  };
}

function queueItem(taskId: string, status: TaskQueueItem["status"]): TaskQueueItem {
  return {
    taskId,
    status,
    priority: 1,
    enqueuedAt: "2026-05-16T00:00:00.000Z",
  };
}

function approval(id: string, category: ActionRequest["category"]): ActionRequest {
  return {
    id,
    title: id,
    category,
    target: "runtime",
    reason: "test",
    dataTouched: ["runtime"],
  };
}

function timelineEvent(id: string, title: string, summary: string, status: TimelineEvent["status"]): TimelineEvent {
  return {
    id,
    kind: "decision",
    title,
    summary,
    occurredAt: "2026-05-16T00:00:00.000Z",
    source: "system",
    reversible: false,
    status,
    tags: [],
  };
}

function workflowRun(id: string, status: WorkflowRun["status"]): WorkflowRun {
  return {
    id,
    workflowId: "workflow",
    status,
    input: {},
    createdAt: "2026-05-16T00:00:00.000Z",
    updatedAt: "2026-05-16T00:00:00.000Z",
  };
}
