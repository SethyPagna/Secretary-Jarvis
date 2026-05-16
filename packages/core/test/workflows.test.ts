import { describe, expect, it } from "vitest";
import {
  createWorkflowRun,
  createWorkflowRunEvent,
  draftWorkflowFromPrompt,
  dryRunWorkflow,
  findSeedWorkflow,
  riskForWorkflow,
  seedWorkflows,
  validateWorkflowDefinition,
  type WorkflowDefinition,
} from "../src/index.js";

describe("workflow core domain", () => {
  it("seeds safe, coding, and social workflow definitions", () => {
    expect(seedWorkflows.map((workflow) => workflow.id)).toEqual(
      expect.arrayContaining(["workflow-daily-brief", "workflow-code-review", "workflow-social-draft", "workflow-cto-orchestrator"]),
    );
    expect(findSeedWorkflow("workflow-daily-brief")?.enabled).toBe(true);
  });

  it("seeds a CTO orchestrator with sub-workflow steps", () => {
    const workflow = findSeedWorkflow("workflow-cto-orchestrator");
    expect(workflow?.steps.some((step) => step.kind === "sub-workflow" && step.subWorkflowId === "workflow-code-review")).toBe(true);
    expect(dryRunWorkflow(workflow!).runnable).toBe(true);
  });

  it("marks approval-gated workflow steps before execution", () => {
    const workflow = findSeedWorkflow("workflow-code-review");
    expect(workflow).toBeDefined();

    const dryRun = dryRunWorkflow(workflow!);

    expect(dryRun.risk).toBe("approval-required");
    expect(dryRun.runnable).toBe(true);
    expect(dryRun.approvalStepIds).toContain("code-run-checks");
    expect(dryRun.steps.find((step) => step.stepId === "code-run-checks")?.decision).toBe("requires_approval");
  });

  it("blocks protected core workflow attempts", () => {
    const workflow: WorkflowDefinition = {
      id: "workflow-bad-core",
      name: "Bad Core Access",
      description: "Should never run.",
      version: 1,
      owner: "generated",
      enabled: true,
      taskProfile: "coding",
      tags: ["blocked"],
      steps: [
        {
          id: "dump-core",
          kind: "system-action",
          title: "Dump core",
          summary: "Attempt to inspect protected source internals.",
          actionCategory: "protected-core-access",
          requiresApproval: true,
          reversible: false,
          expectedInputs: [],
          expectedOutputs: [],
        },
      ],
    };

    const dryRun = dryRunWorkflow(workflow);

    expect(riskForWorkflow(workflow)).toBe("blocked");
    expect(dryRun.runnable).toBe(false);
    expect(dryRun.blockedStepIds).toEqual(["dump-core"]);
  });

  it("validates generated workflows before saving", () => {
    const workflow = {
      ...seedWorkflows[0],
      steps: [
        {
          ...seedWorkflows[0].steps[0],
          id: "duplicate",
        },
        {
          ...seedWorkflows[0].steps[1],
          id: "duplicate",
          title: "",
        },
      ],
    };

    const issues = validateWorkflowDefinition(workflow);

    expect(issues.some((issue) => issue.message === "Step ids must be unique.")).toBe(true);
    expect(issues.some((issue) => issue.message === "Step title is required.")).toBe(true);
  });

  it("drafts approval-gated workflows from natural language prompts", () => {
    const workflow = draftWorkflowFromPrompt("Review this TypeScript repo and run tests", "test", "generated");
    const dryRun = dryRunWorkflow(workflow);

    expect(workflow.id).toContain("workflow-review-this-typescript-repo");
    expect(workflow.enabled).toBe(false);
    expect(workflow.steps.some((step) => step.actionCategory === "run-script")).toBe(true);
    expect(dryRun.risk).toBe("approval-required");
  });

  it("creates workflow run records and events for persistence", () => {
    const createdAt = "2026-05-16T10:55:00.000Z";
    const run = createWorkflowRun({
      id: "workflow-run-1",
      workflowId: "workflow-daily-brief",
      input: { topic: "today" },
      createdAt,
    });
    const event = createWorkflowRunEvent({
      id: "workflow-event-1",
      workflowRunId: run.id,
      workflowId: run.workflowId,
      kind: "queued",
      message: "Workflow queued.",
      createdAt,
    });

    expect(run.status).toBe("queued");
    expect(run.input.topic).toBe("today");
    expect(event.workflowRunId).toBe(run.id);
  });
});
