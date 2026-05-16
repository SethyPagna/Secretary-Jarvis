import {
  defaultAgentSouls,
  dryRunWorkflow,
  routeTaskToAgents,
  seedWorkflows,
  type ActionRequest,
  type AgentSoul,
  type JarvisStatus,
  type TaskProfile,
  type TaskQueueItem,
  type TaskRun,
  type VoiceProfile,
  type WorkflowDefinition,
  type WorkflowRun,
} from "@jarvis/core";

const MANAGER_TASK_PROFILES: TaskProfile[] = ["daily-assistant", "coding", "research", "rag", "screen-vision", "deep-reasoning"];

export interface AgentManagerReadiness {
  generatedAt: string;
  localOnly: true;
  manager: {
    id: "jarvis";
    label: string;
    role: string;
    connected: boolean;
    detail: string;
  };
  agents: AgentManagerAgentStatus[];
  voices: {
    totalAgents: number;
    profiles: number;
    coveredAgents: number;
    distinctProfileCount: number;
    ready: number;
    staged: number;
    missing: number;
  };
  routing: Array<{
    taskProfile: TaskProfile;
    primary: string;
    reviewer: string;
    support: string[];
    approvalReviewerConnected: boolean;
  }>;
  workflowAutonomy: {
    workflows: number;
    generatedWorkflows: number;
    enabledWorkflows: number;
    approvalGatedSteps: number;
    blockedSteps: number;
    managerWorkflowReady: boolean;
    automationNote: string;
  };
  responseHealth: {
    runningTasks: number;
    queuedItems: number;
    waitingApprovals: number;
    activeWorkflowRuns: number;
    freezeRisk: "low" | "attention";
    note: string;
  };
  summary: {
    agentsReady: number;
    voicesCovered: boolean;
    managerConnected: boolean;
    workflowsApprovalGated: boolean;
    responsePathHealthy: boolean;
  };
  recommendations: string[];
}

export interface AgentManagerAgentStatus {
  id: string;
  name: string;
  role: string;
  status: AgentSoul["status"];
  voiceProfileId: string;
  voiceLabel: string;
  voiceStyle: string;
  voiceStatus: VoiceProfile["status"] | "missing";
  personality: string;
  permissions: number;
  canManageWorkflow: boolean;
}

export function buildAgentManagerReadiness(params: {
  generatedAt: string;
  status: JarvisStatus;
  workflows: WorkflowDefinition[];
  workflowRuns: WorkflowRun[];
  tasks: TaskRun[];
  queue: TaskQueueItem[];
  approvals: ActionRequest[];
  souls?: AgentSoul[];
}): AgentManagerReadiness {
  const souls = params.souls ?? defaultAgentSouls;
  const voiceProfiles = params.status.voiceProfiles ?? [];
  const voiceById = new Map(voiceProfiles.map((profile) => [profile.id, profile]));
  const workflows = params.workflows.length > 0 ? params.workflows : seedWorkflows;
  const agents = souls.map((soul) => agentStatus(soul, voiceById));
  const workflowDryRuns = workflows.map(dryRunWorkflow);
  const runningTasks = params.tasks.filter((task) => task.status === "running").length;
  const queuedItems = params.queue.filter((item) => item.status === "queued" || item.status === "running").length;
  const waitingApprovals = params.approvals.length + params.workflowRuns.filter((run) => run.status === "waiting-approval").length;
  const activeWorkflowRuns = params.workflowRuns.filter((run) => run.status === "queued" || run.status === "running" || run.status === "waiting-approval").length;
  const freezeRisk = runningTasks + queuedItems + activeWorkflowRuns > 0 && waitingApprovals > 4 ? "attention" : "low";

  return {
    generatedAt: params.generatedAt,
    localOnly: true,
    manager: {
      id: "jarvis",
      label: "Jarvis Manager",
      role: "Routes goals, delegates specialists, keeps Sentinel review in the loop, and returns concise commander updates.",
      connected: Boolean(souls.find((soul) => soul.id === "jarvis")) && workflows.some((workflow) => workflow.id === "workflow-cto-orchestrator"),
      detail: "Jarvis is the manager; specialist agents own execution lanes while Sentinel gates risk.",
    },
    agents,
    voices: voiceSummary(souls, voiceProfiles),
    routing: MANAGER_TASK_PROFILES.map((taskProfile) => {
      const route = routeTaskToAgents(taskProfile);
      return {
        taskProfile,
        primary: route.primaryAgentId,
        reviewer: route.reviewerAgentId,
        support: route.supportAgentIds,
        approvalReviewerConnected: route.reviewerAgentId === "sentinel" && souls.some((soul) => soul.id === "sentinel"),
      };
    }),
    workflowAutonomy: {
      workflows: workflows.length,
      generatedWorkflows: workflows.filter((workflow) => workflow.owner === "generated").length,
      enabledWorkflows: workflows.filter((workflow) => workflow.enabled).length,
      approvalGatedSteps: workflowDryRuns.reduce((total, dryRun) => total + dryRun.approvalStepIds.length, 0),
      blockedSteps: workflowDryRuns.reduce((total, dryRun) => total + dryRun.blockedStepIds.length, 0),
      managerWorkflowReady: workflows.some((workflow) => workflow.id === "workflow-cto-orchestrator" && workflow.enabled),
      automationNote: "Jarvis may draft workflows and automations, but generated workflows stay disabled until owner approval.",
    },
    responseHealth: {
      runningTasks,
      queuedItems,
      waitingApprovals,
      activeWorkflowRuns,
      freezeRisk,
      note:
        freezeRisk === "attention"
          ? "Approval backlog may make Jarvis appear paused; review approvals or use emergency stop."
          : "Queue and workflow response paths are ready for steer, interrupt, cancel, and approval-gated automation.",
    },
    summary: {
      agentsReady: agents.length,
      voicesCovered: agents.every((agent) => agent.voiceStatus !== "missing"),
      managerConnected: workflows.some((workflow) => workflow.id === "workflow-cto-orchestrator"),
      workflowsApprovalGated: workflowDryRuns.some((dryRun) => dryRun.approvalStepIds.length > 0),
      responsePathHealthy: freezeRisk === "low",
    },
    recommendations: recommendationsFor(agents, workflowDryRuns.reduce((total, dryRun) => total + dryRun.blockedStepIds.length, 0), freezeRisk),
  };
}

function agentStatus(soul: AgentSoul, voiceById: Map<string, VoiceProfile>): AgentManagerAgentStatus {
  const voice = voiceById.get(soul.voiceProfileId);
  return {
    id: soul.id,
    name: soul.name,
    role: soul.role,
    status: soul.status,
    voiceProfileId: soul.voiceProfileId,
    voiceLabel: voice?.label ?? "Missing voice profile",
    voiceStyle: voice?.style ?? "No voice style configured.",
    voiceStatus: voice?.status ?? "missing",
    personality: soul.personality,
    permissions: soul.permissions.length,
    canManageWorkflow: soul.id === "jarvis" || soul.id === "friday" || soul.id === "daedalus",
  };
}

function voiceSummary(souls: AgentSoul[], voiceProfiles: VoiceProfile[]): AgentManagerReadiness["voices"] {
  const profileById = new Map(voiceProfiles.map((profile) => [profile.id, profile]));
  const linkedProfiles = souls.map((soul) => profileById.get(soul.voiceProfileId)).filter((profile): profile is VoiceProfile => Boolean(profile));
  return {
    totalAgents: souls.length,
    profiles: voiceProfiles.length,
    coveredAgents: linkedProfiles.length,
    distinctProfileCount: new Set(souls.map((soul) => soul.voiceProfileId)).size,
    ready: linkedProfiles.filter((profile) => profile.status === "ready").length,
    staged: linkedProfiles.filter((profile) => profile.status === "staged").length,
    missing: souls.length - linkedProfiles.length + linkedProfiles.filter((profile) => profile.status === "missing-dependency").length,
  };
}

function recommendationsFor(agents: AgentManagerAgentStatus[], blockedSteps: number, freezeRisk: "low" | "attention"): string[] {
  const recommendations: string[] = [];
  if (agents.some((agent) => agent.voiceStatus === "missing")) {
    recommendations.push("Add missing voice profiles before enabling per-agent spoken responses.");
  }
  if (blockedSteps > 0) {
    recommendations.push("Review blocked workflow steps before allowing Jarvis to propose automations from them.");
  }
  if (freezeRisk === "attention") {
    recommendations.push("Clear pending approvals to keep Jarvis responsive.");
  }
  recommendations.push("Keep generated workflows disabled until the owner approves the dry-run plan.");
  return recommendations;
}
