import { describe, expect, it } from "vitest";
import type { ActionRequest, PolicyDecision } from "@jarvis/core";
import { createRuntimeControlDryRun, isRuntimeControlKind } from "../src/runtimeControl.js";

describe("runtime control dry-runs", () => {
  const approvalDecision: PolicyDecision = {
    actionId: "runtime-control-test",
    decision: "requires_approval",
    risk: "approval-required",
    reasons: ["run-script is configured as an approval-gated action."],
  };

  it("creates approval-gated dry-runs without executing commands", () => {
    const dryRun = createRuntimeControlDryRun({
      id: "runtime-control-test",
      control: "restart",
      target: "all",
      createdAt: "2026-05-16T00:00:00.000Z",
      evaluate: (action: ActionRequest) => ({ ...approvalDecision, actionId: action.id }),
    });

    expect(dryRun.control).toBe("restart");
    expect(dryRun.commandPreview).toContain("jarvis-runtime.ps1");
    expect(dryRun.decision.decision).toBe("requires_approval");
    expect(dryRun.message).toContain("Dry-run only");
    expect(dryRun.action.category).toBe("run-script");
  });

  it("recognizes only supported runtime controls", () => {
    expect(isRuntimeControlKind("start")).toBe(true);
    expect(isRuntimeControlKind("emergency-stop")).toBe(true);
    expect(isRuntimeControlKind("delete-everything")).toBe(false);
  });
});
