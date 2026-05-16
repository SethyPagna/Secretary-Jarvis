import type { ActionRequest, RuntimeEventHealth, TaskQueueItem, TaskRun, TimelineEvent, WorkflowRun } from "@jarvis/core";

export function buildRuntimeEventHealth(params: {
  checkedAt: string;
  tasks: TaskRun[];
  queue: TaskQueueItem[];
  approvals: ActionRequest[];
  timeline: TimelineEvent[];
  workflowRuns: WorkflowRun[];
}): RuntimeEventHealth {
  const waitingApproval =
    params.queue.filter((item) => item.status === "waiting-approval").length +
    params.workflowRuns.filter((run) => run.status === "waiting-approval").length;
  const failedTasks = params.tasks.filter((task) => task.status === "failed" || task.status === "cancelled");
  const failedWorkflows = params.workflowRuns.filter((run) => run.status === "failed" || run.status === "cancelled");
  const recentFailures = [
    ...failedTasks.map((task) => ({
      id: task.id,
      label: task.title,
      kind: "task" as const,
      status: task.status,
    })),
    ...failedWorkflows.map((run) => ({
      id: run.id,
      label: run.result ?? run.workflowId,
      kind: "workflow" as const,
      status: run.status,
    })),
    ...params.timeline
      .filter((event) => /fail|error|blocked|denied/i.test(`${event.title} ${event.summary} ${event.status ?? ""}`))
      .map((event) => ({
        id: event.id,
        label: event.title,
        kind: "timeline" as const,
        status: event.status,
      })),
  ].slice(0, 8);
  const running = params.queue.filter((item) => item.status === "running").length;
  const queued = params.queue.filter((item) => item.status === "queued").length;
  const failed = params.queue.filter((item) => item.status === "failed" || item.status === "cancelled").length + recentFailures.length;
  const attention = params.approvals.length + waitingApproval + recentFailures.length;
  const active = running + queued;
  return {
    checkedAt: params.checkedAt,
    status: attention > 0 ? "attention" : active > 0 ? "active" : "quiet",
    queue: {
      total: params.queue.length,
      running,
      queued,
      waitingApproval,
      failed,
    },
    approvals: {
      pending: params.approvals.length,
      categories: [...new Set(params.approvals.map((approval) => approval.category))],
    },
    recentFailures,
    timeline: {
      recent: params.timeline.length,
      reversible: params.timeline.filter((event) => event.reversible).length,
      remembered: params.timeline.filter((event) => event.status === "remembered").length,
    },
    message:
      attention > 0
        ? "Jarvis has approval or failure items that need attention."
        : active > 0
          ? "Jarvis has active or queued work."
          : "Jarvis queue and approval lane are quiet.",
  };
}
