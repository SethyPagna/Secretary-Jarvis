import type { ActionCategory, TaskProfile } from "./types.js";

export type WorkflowRisk = "safe" | "approval-required" | "blocked";
export type WorkflowStepKind = "agent" | "connector-action" | "system-action" | "approval" | "memory-write" | "sub-workflow";
export type WorkflowRunStatus = "queued" | "running" | "waiting-approval" | "completed" | "failed" | "cancelled";
export type WorkflowRunEventKind = "queued" | "started" | "step-started" | "approval-requested" | "step-completed" | "completed" | "failed" | "cancelled";

export interface WorkflowStep {
  id: string;
  kind: WorkflowStepKind;
  title: string;
  summary: string;
  agentId?: string;
  connectorId?: string;
  subWorkflowId?: string;
  taskProfile?: TaskProfile;
  actionCategory?: ActionCategory;
  requiresApproval: boolean;
  reversible: boolean;
  expectedInputs: string[];
  expectedOutputs: string[];
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  version: number;
  owner: "jarvis" | "user" | "generated";
  enabled: boolean;
  taskProfile: TaskProfile;
  steps: WorkflowStep[];
  tags: string[];
}

export interface WorkflowValidationIssue {
  stepId?: string;
  severity: "error" | "warning";
  message: string;
}

export interface WorkflowDryRunStep {
  stepId: string;
  title: string;
  kind: WorkflowStepKind;
  risk: WorkflowRisk;
  decision: "allow" | "requires_approval" | "deny";
  note: string;
}

export interface WorkflowDryRun {
  workflowId: string;
  risk: WorkflowRisk;
  runnable: boolean;
  approvalStepIds: string[];
  blockedStepIds: string[];
  validationIssues: WorkflowValidationIssue[];
  steps: WorkflowDryRunStep[];
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  status: WorkflowRunStatus;
  currentStepId?: string;
  input: Record<string, unknown>;
  result?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowRunEvent {
  id: string;
  workflowRunId: string;
  workflowId: string;
  kind: WorkflowRunEventKind;
  message: string;
  stepId?: string;
  createdAt: string;
  payload?: Record<string, unknown>;
}

export interface WorkflowGenerationRequest {
  prompt: string;
  owner?: WorkflowDefinition["owner"];
  save?: boolean;
}

export interface WorkflowGenerationResult {
  workflow: WorkflowDefinition;
  dryRun: WorkflowDryRun;
  issues: WorkflowValidationIssue[];
  approvalRequired: boolean;
  saved: boolean;
  strategy: "local-model" | "deterministic-local";
  modelRef?: string;
  note: string;
}

const blockedCategories = new Set<ActionCategory>(["protected-core-access", "credential-access", "purchase"]);
const approvalCategories = new Set<ActionCategory>([
  "write-local",
  "delete-local",
  "run-script",
  "service-control",
  "device-control",
  "model-download",
  "sensor-capture",
  "send-message",
  "post-social",
  "irreversible-edit",
]);

export const seedWorkflows: WorkflowDefinition[] = [
  {
    id: "workflow-daily-brief",
    name: "Daily Brief",
    description: "Friday gathers local schedule, tasks, memory notes, and model status into a concise morning brief.",
    version: 1,
    owner: "jarvis",
    enabled: true,
    taskProfile: "daily-assistant",
    tags: ["briefing", "memory", "secretary"],
    steps: [
      {
        id: "daily-memory-recall",
        kind: "agent",
        title: "Recall recent context",
        summary: "Mnemosyne recalls relevant local memory and unresolved tasks.",
        agentId: "mnemosyne",
        taskProfile: "rag",
        requiresApproval: false,
        reversible: false,
        expectedInputs: ["timeline", "memory"],
        expectedOutputs: ["brief context"],
      },
      {
        id: "daily-compose",
        kind: "agent",
        title: "Compose brief",
        summary: "Friday turns recalled context into a short actionable brief.",
        agentId: "friday",
        taskProfile: "daily-assistant",
        requiresApproval: false,
        reversible: false,
        expectedInputs: ["brief context"],
        expectedOutputs: ["brief response"],
      },
    ],
  },
  {
    id: "workflow-code-review",
    name: "Local Code Review",
    description: "Daedalus inspects an approved workspace, runs safe static checks, and asks Sentinel to review risky steps.",
    version: 1,
    owner: "jarvis",
    enabled: true,
    taskProfile: "coding",
    tags: ["coding", "review", "safety"],
    steps: [
      {
        id: "code-read-workspace",
        kind: "system-action",
        title: "Read approved workspace",
        summary: "Read files inside an approved project path.",
        actionCategory: "read-local",
        taskProfile: "coding",
        requiresApproval: false,
        reversible: false,
        expectedInputs: ["workspace path"],
        expectedOutputs: ["file summary"],
      },
      {
        id: "code-run-checks",
        kind: "system-action",
        title: "Run approved checks",
        summary: "Run explicit user-approved test or lint commands.",
        actionCategory: "run-script",
        taskProfile: "coding",
        requiresApproval: true,
        reversible: false,
        expectedInputs: ["approved command"],
        expectedOutputs: ["test output"],
      },
      {
        id: "code-review-summary",
        kind: "agent",
        title: "Review findings",
        summary: "Daedalus summarizes risks, changes, and next actions.",
        agentId: "daedalus",
        taskProfile: "coding",
        requiresApproval: false,
        reversible: false,
        expectedInputs: ["file summary", "test output"],
        expectedOutputs: ["review summary"],
      },
    ],
  },
  {
    id: "workflow-social-draft",
    name: "Social Draft",
    description: "Hermes drafts outbound messages locally and requires approval before anything can be sent.",
    version: 1,
    owner: "jarvis",
    enabled: true,
    taskProfile: "daily-assistant",
    tags: ["social", "draft", "approval"],
    steps: [
      {
        id: "social-compose",
        kind: "agent",
        title: "Compose draft",
        summary: "Hermes writes the message locally.",
        agentId: "hermes",
        taskProfile: "daily-assistant",
        requiresApproval: false,
        reversible: false,
        expectedInputs: ["recipient", "intent"],
        expectedOutputs: ["message draft"],
      },
      {
        id: "social-send-approval",
        kind: "approval",
        title: "Approve outbound send",
        summary: "Owner approval is required before sending to an external channel.",
        actionCategory: "send-message",
        requiresApproval: true,
        reversible: false,
        expectedInputs: ["message draft"],
        expectedOutputs: ["approval decision"],
      },
    ],
  },
  {
    id: "workflow-cto-orchestrator",
    name: "CTO Orchestrator",
    description: "Jarvis coordinates specialist workflows, keeps Sentinel in the loop, and returns an executive activity summary.",
    version: 1,
    owner: "jarvis",
    enabled: true,
    taskProfile: "deep-reasoning",
    tags: ["orchestration", "multi-agent", "cto"],
    steps: [
      {
        id: "cto-clarify-mission",
        kind: "agent",
        title: "Clarify mission",
        summary: "Jarvis turns the goal into a short execution brief for specialist workflows.",
        agentId: "jarvis",
        taskProfile: "deep-reasoning",
        requiresApproval: false,
        reversible: false,
        expectedInputs: ["goal", "constraints"],
        expectedOutputs: ["execution brief"],
      },
      {
        id: "cto-code-subflow",
        kind: "sub-workflow",
        title: "Invoke code review sub-workflow",
        summary: "Daedalus can be queued for approved workspace inspection and checks.",
        subWorkflowId: "workflow-code-review",
        taskProfile: "coding",
        requiresApproval: false,
        reversible: false,
        expectedInputs: ["execution brief"],
        expectedOutputs: ["child workflow run"],
      },
      {
        id: "cto-secretary-subflow",
        kind: "sub-workflow",
        title: "Invoke daily brief sub-workflow",
        summary: "Friday and Mnemosyne produce a concise operational brief.",
        subWorkflowId: "workflow-daily-brief",
        taskProfile: "daily-assistant",
        requiresApproval: false,
        reversible: false,
        expectedInputs: ["execution brief"],
        expectedOutputs: ["child workflow run"],
      },
      {
        id: "cto-summarize",
        kind: "agent",
        title: "Summarize activity",
        summary: "Friday returns a compact executive summary with next actions.",
        agentId: "friday",
        taskProfile: "daily-assistant",
        requiresApproval: false,
        reversible: false,
        expectedInputs: ["child workflow status"],
        expectedOutputs: ["activity summary"],
      },
    ],
  },
];

export function riskForWorkflowStep(step: WorkflowStep): WorkflowRisk {
  if (step.actionCategory && blockedCategories.has(step.actionCategory)) {
    return "blocked";
  }
  if (step.requiresApproval || (step.actionCategory && approvalCategories.has(step.actionCategory))) {
    return "approval-required";
  }
  return "safe";
}

export function riskForWorkflow(workflow: WorkflowDefinition): WorkflowRisk {
  const stepRisks = workflow.steps.map(riskForWorkflowStep);
  if (stepRisks.includes("blocked")) {
    return "blocked";
  }
  if (stepRisks.includes("approval-required")) {
    return "approval-required";
  }
  return "safe";
}

export function validateWorkflowDefinition(workflow: WorkflowDefinition): WorkflowValidationIssue[] {
  const issues: WorkflowValidationIssue[] = [];
  if (!workflow.id.trim()) {
    issues.push({ severity: "error", message: "Workflow id is required." });
  }
  if (!workflow.name.trim()) {
    issues.push({ severity: "error", message: "Workflow name is required." });
  }
  if (workflow.steps.length === 0) {
    issues.push({ severity: "error", message: "Workflow needs at least one step." });
  }

  const seen = new Set<string>();
  for (const step of workflow.steps) {
    if (!step.id.trim()) {
      issues.push({ stepId: step.id, severity: "error", message: "Step id is required." });
    }
    if (seen.has(step.id)) {
      issues.push({ stepId: step.id, severity: "error", message: "Step ids must be unique." });
    }
    seen.add(step.id);
    if (!step.title.trim()) {
      issues.push({ stepId: step.id, severity: "error", message: "Step title is required." });
    }
    if ((step.kind === "connector-action" || step.kind === "system-action" || step.kind === "approval") && !step.actionCategory) {
      issues.push({ stepId: step.id, severity: "error", message: "Action steps require an action category." });
    }
    if (riskForWorkflowStep(step) === "approval-required" && !step.requiresApproval) {
      issues.push({ stepId: step.id, severity: "warning", message: "Step category is approval-gated; requiresApproval should be true." });
    }
  }
  return issues;
}

export function dryRunWorkflow(workflow: WorkflowDefinition): WorkflowDryRun {
  const validationIssues = validateWorkflowDefinition(workflow);
  const steps = workflow.steps.map((step) => {
    const risk = riskForWorkflowStep(step);
    return {
      stepId: step.id,
      title: step.title,
      kind: step.kind,
      risk,
      decision: risk === "blocked" ? "deny" : risk === "approval-required" ? "requires_approval" : "allow",
      note:
        risk === "blocked"
          ? "This step touches a blocked category and cannot run."
          : risk === "approval-required"
            ? "This step can run only after owner approval."
            : "This step is safe for local execution.",
    } satisfies WorkflowDryRunStep;
  });
  const blockedStepIds = steps.filter((step) => step.risk === "blocked").map((step) => step.stepId);
  const approvalStepIds = steps.filter((step) => step.risk === "approval-required").map((step) => step.stepId);
  const hasErrors = validationIssues.some((issue) => issue.severity === "error");
  return {
    workflowId: workflow.id,
    risk: riskForWorkflow(workflow),
    runnable: !hasErrors && blockedStepIds.length === 0,
    approvalStepIds,
    blockedStepIds,
    validationIssues,
    steps,
  };
}

export function findSeedWorkflow(id: string): WorkflowDefinition | undefined {
  return seedWorkflows.find((workflow) => workflow.id === id);
}

export function draftWorkflowFromPrompt(prompt: string, idSuffix: string, owner: WorkflowDefinition["owner"] = "generated"): WorkflowDefinition {
  const lowerPrompt = prompt.toLowerCase();
  const slug = slugifyWorkflowName(prompt).slice(0, 42) || "generated-workflow";
  const baseId = `workflow-${slug}-${idSuffix}`;
  const isSocial = /\b(email|message|discord|telegram|whatsapp|slack|post|social)\b/.test(lowerPrompt);
  const isCoding = /\b(code|repo|test|lint|review|bug|build|typescript|python)\b/.test(lowerPrompt);
  const isSystem = /\b(file|folder|download|organize|move|copy|script|service|window|app)\b/.test(lowerPrompt);
  const isResearch = /\b(research|summarize|paper|web|report|brief|analyze)\b/.test(lowerPrompt);

  if (isSocial) {
    return {
      id: baseId,
      name: titleFromPrompt(prompt, "Social Draft Workflow"),
      description: "Generated local-first workflow: draft outbound communication locally and require owner approval before sending.",
      version: 1,
      owner,
      enabled: false,
      taskProfile: "daily-assistant",
      tags: ["generated", "social", "approval"],
      steps: [
        generatedAgentStep("compose-draft", "Compose local draft", "Hermes writes a concise local draft without sending.", "hermes", "daily-assistant"),
        generatedApprovalStep("approve-send", "Approve outbound send", "Owner must approve before any external message is sent.", "send-message"),
      ],
    };
  }

  if (isCoding) {
    return {
      id: baseId,
      name: titleFromPrompt(prompt, "Coding Workflow"),
      description: "Generated local-first workflow: inspect approved code, run approval-gated checks, and summarize findings.",
      version: 1,
      owner,
      enabled: false,
      taskProfile: "coding",
      tags: ["generated", "coding", "review"],
      steps: [
        generatedSystemStep("inspect-workspace", "Inspect approved workspace", "Read approved project files and summarize relevant code.", "read-local", false),
        generatedSystemStep("run-checks", "Run approved checks", "Run explicit test, lint, or build commands after owner approval.", "run-script", true),
        generatedAgentStep("summarize-findings", "Summarize findings", "Daedalus reports risks, failures, and next actions.", "daedalus", "coding"),
      ],
    };
  }

  if (isSystem) {
    return {
      id: baseId,
      name: titleFromPrompt(prompt, "Local System Workflow"),
      description: "Generated local-first workflow: plan a reversible laptop action, request approval, then record the result.",
      version: 1,
      owner,
      enabled: false,
      taskProfile: "daily-assistant",
      tags: ["generated", "system", "undo"],
      steps: [
        generatedAgentStep("plan-action", "Plan local action", "Vulcan creates a concise dry-run plan with rollback notes.", "vulcan", "daily-assistant"),
        generatedSystemStep("execute-approved-action", "Execute approved action", "Run the approved local action with checkpointing where possible.", "write-local", true),
        generatedAgentStep("record-result", "Record result", "Mnemosyne writes the outcome into MemoryOS and the timeline.", "mnemosyne", "rag"),
      ],
    };
  }

  return {
    id: baseId,
    name: titleFromPrompt(prompt, isResearch ? "Research Workflow" : "Generated Workflow"),
    description: "Generated local-first workflow: gather context, reason with the selected local model, and save a concise result.",
    version: 1,
    owner,
    enabled: false,
    taskProfile: isResearch ? "research" : "daily-assistant",
    tags: ["generated", isResearch ? "research" : "assistant", "memory"],
    steps: [
      generatedAgentStep("gather-context", "Gather local context", "Recall relevant MemoryOS notes and approved local documents.", "mnemosyne", "rag"),
      generatedAgentStep("reason-and-compose", "Reason and compose", "Jarvis produces a short answer or report using the selected local model.", "jarvis", isResearch ? "research" : "daily-assistant"),
      generatedAgentStep("save-summary", "Save summary", "Mnemosyne stores the useful outcome in the timeline.", "mnemosyne", "rag"),
    ],
  };
}

export function createWorkflowRun(params: {
  id: string;
  workflowId: string;
  input?: Record<string, unknown>;
  status?: WorkflowRunStatus;
  currentStepId?: string;
  createdAt: string;
}): WorkflowRun {
  return {
    id: params.id,
    workflowId: params.workflowId,
    status: params.status ?? "queued",
    currentStepId: params.currentStepId,
    input: params.input ?? {},
    createdAt: params.createdAt,
    updatedAt: params.createdAt,
  };
}

export function createWorkflowRunEvent(params: {
  id: string;
  workflowRunId: string;
  workflowId: string;
  kind: WorkflowRunEventKind;
  message: string;
  stepId?: string;
  createdAt: string;
  payload?: Record<string, unknown>;
}): WorkflowRunEvent {
  return {
    id: params.id,
    workflowRunId: params.workflowRunId,
    workflowId: params.workflowId,
    kind: params.kind,
    message: params.message,
    stepId: params.stepId,
    createdAt: params.createdAt,
    payload: params.payload,
  };
}

function generatedAgentStep(
  id: string,
  title: string,
  summary: string,
  agentId: string,
  taskProfile: TaskProfile,
): WorkflowStep {
  return {
    id,
    kind: "agent",
    title,
    summary,
    agentId,
    taskProfile,
    requiresApproval: false,
    reversible: false,
    expectedInputs: ["user intent", "local context"],
    expectedOutputs: ["agent result"],
  };
}

function generatedSystemStep(
  id: string,
  title: string,
  summary: string,
  actionCategory: ActionCategory,
  requiresApproval: boolean,
): WorkflowStep {
  return {
    id,
    kind: "system-action",
    title,
    summary,
    actionCategory,
    requiresApproval,
    reversible: actionCategory === "write-local",
    expectedInputs: ["approved target", "dry-run plan"],
    expectedOutputs: ["system result", "audit event"],
  };
}

function generatedApprovalStep(id: string, title: string, summary: string, actionCategory: ActionCategory): WorkflowStep {
  return {
    id,
    kind: "approval",
    title,
    summary,
    actionCategory,
    requiresApproval: true,
    reversible: false,
    expectedInputs: ["draft", "recipient", "channel"],
    expectedOutputs: ["owner decision"],
  };
}

function slugifyWorkflowName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleFromPrompt(prompt: string, fallback: string): string {
  const cleaned = prompt
    .replace(/\s+/g, " ")
    .replace(/[^\w\s-]/g, "")
    .trim();
  if (!cleaned) {
    return fallback;
  }
  const words = cleaned.split(" ").slice(0, 5);
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}
