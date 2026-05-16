import { describe, expect, it } from "vitest";
import {
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
      expect.arrayContaining(["workflow-daily-brief", "workflow-code-review", "workflow-social-draft"]),
    );
    expect(findSeedWorkflow("workflow-daily-brief")?.enabled).toBe(true);
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
});
