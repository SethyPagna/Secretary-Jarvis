import type {
  ActionRequest,
  JarvisStatus,
  TaskQueueItem,
  TaskRun,
  UndoJournalEntry,
  WorkflowDefinition,
  WorkflowRun,
} from "@jarvis/core";

export type InteractionHealthStatus = "ready" | "staged" | "attention" | "blocked";

export interface InteractionHealth {
  generatedAt: string;
  localOnly: true;
  surfaces: Array<{
    id: "text" | "voice" | "workflow-generate" | "workflow-execute" | "editing" | "undo" | "approvals" | "emergency-stop";
    label: string;
    status: InteractionHealthStatus;
    detail: string;
  }>;
  metrics: {
    runningTasks: number;
    queuedItems: number;
    waitingApprovals: number;
    activeWorkflowRuns: number;
    generatedWorkflows: number;
    enabledWorkflows: number;
    availableUndos: number;
  };
  summary: {
    responsive: boolean;
    canTalkWhileWorking: boolean;
    workflowAutonomyApprovalGated: boolean;
    editingUndoReady: boolean;
    freezeRisk: "low" | "attention";
  };
  recommendations: string[];
}

export function buildInteractionHealth(params: {
  generatedAt: string;
  status: JarvisStatus;
  workflows: WorkflowDefinition[];
  workflowRuns: WorkflowRun[];
  tasks: TaskRun[];
  queue: TaskQueueItem[];
  approvals: ActionRequest[];
  undoJournal: UndoJournalEntry[];
}): InteractionHealth {
  const runningTasks = params.tasks.filter((task) => task.status === "running").length;
  const queuedItems = params.queue.filter((item) => item.status === "queued" || item.status === "running").length;
  const waitingWorkflowRuns = params.workflowRuns.filter((run) => run.status === "waiting-approval").length;
  const activeWorkflowRuns = params.workflowRuns.filter((run) => run.status === "queued" || run.status === "running" || run.status === "waiting-approval").length;
  const waitingApprovals = params.approvals.length + waitingWorkflowRuns;
  const generatedWorkflows = params.workflows.filter((workflow) => workflow.owner === "generated").length;
  const enabledWorkflows = params.workflows.filter((workflow) => workflow.enabled).length;
  const availableUndos = params.undoJournal.filter((entry) => entry.status === "available" && Date.parse(entry.expiresAt) > Date.now()).length;
  const freezeRisk = runningTasks + queuedItems + activeWorkflowRuns > 0 && waitingApprovals > 4 ? "attention" : "low";
  const textReady = Boolean(params.status.activeModelId || params.status.models.length);
  const voiceReady = Boolean(params.status.voiceSession && params.status.voiceProfiles?.length);
  const workflowApprovalGated = params.workflows.some((workflow) => workflow.owner === "generated" ? !workflow.enabled : true);

  return {
    generatedAt: params.generatedAt,
    localOnly: true,
    surfaces: [
      {
        id: "text",
        label: "Text",
        status: textReady ? "ready" : "staged",
        detail: textReady ? "Text commands queue into Jarvis and stay steerable." : "Model routing is still staged.",
      },
      {
        id: "voice",
        label: "Voice",
        status: voiceReady ? "ready" : "staged",
        detail: voiceReady ? "Voice sessions, transcripts, and agent voice profiles are wired." : "Voice profile or session state is not fully detected.",
      },
      {
        id: "workflow-generate",
        label: "Generate",
        status: "ready",
        detail: "Jarvis can draft workflow proposals; generated workflows require owner approval before use.",
      },
      {
        id: "workflow-execute",
        label: "Execute",
        status: enabledWorkflows > 0 ? "ready" : "staged",
        detail: enabledWorkflows > 0 ? `${enabledWorkflows} workflow(s) are enabled with policy checks.` : "No enabled workflow is available yet.",
      },
      {
        id: "editing",
        label: "Editing",
        status: "ready",
        detail: "Jarvis-managed edits and file actions go through policy and checkpoint creation.",
      },
      {
        id: "undo",
        label: "Undo",
        status: "ready",
        detail: availableUndos > 0 ? `${availableUndos} reversible checkpoint(s) are inside the active window.` : "Undo journal is ready; no active checkpoint is waiting.",
      },
      {
        id: "approvals",
        label: "Approvals",
        status: waitingApprovals > 0 ? "attention" : "ready",
        detail: waitingApprovals > 0 ? `${waitingApprovals} approval item(s) can pause automation.` : "No approval backlog is blocking automation.",
      },
      {
        id: "emergency-stop",
        label: "Stop",
        status: "ready",
        detail: "Emergency stop pauses agents, listening, workflow execution, and runtime controls while preserving logs.",
      },
    ],
    metrics: {
      runningTasks,
      queuedItems,
      waitingApprovals,
      activeWorkflowRuns,
      generatedWorkflows,
      enabledWorkflows,
      availableUndos,
    },
    summary: {
      responsive: freezeRisk === "low",
      canTalkWhileWorking: true,
      workflowAutonomyApprovalGated: workflowApprovalGated,
      editingUndoReady: true,
      freezeRisk,
    },
    recommendations: recommendationsFor({ freezeRisk, waitingApprovals, voiceReady, textReady }),
  };
}

function recommendationsFor(params: {
  freezeRisk: "low" | "attention";
  waitingApprovals: number;
  voiceReady: boolean;
  textReady: boolean;
}): string[] {
  const recommendations: string[] = [];
  if (!params.textReady) {
    recommendations.push("Run model readiness before relying on text command execution.");
  }
  if (!params.voiceReady) {
    recommendations.push("Open the Voice panel once to initialize voice session readiness.");
  }
  if (params.freezeRisk === "attention") {
    recommendations.push(`Clear ${params.waitingApprovals} approval item(s) to keep Jarvis responsive.`);
  }
  recommendations.push("Generated workflows remain drafts until the owner approves the dry-run.");
  return recommendations;
}
