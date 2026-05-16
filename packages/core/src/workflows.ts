import type { ActionCategory, TaskProfile } from "./types.js";

export type WorkflowRisk = "safe" | "approval-required" | "blocked";
export type WorkflowStepKind = "agent" | "connector-action" | "system-action" | "approval" | "memory-write" | "sub-workflow";

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
