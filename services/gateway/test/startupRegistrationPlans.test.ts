import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildStartupRegistrationPlans } from "../src/startupRegistrationPlans.js";

describe("startup registration plans", () => {
  it("returns standard and approved-admin dry-run plans with rollback commands", () => {
    const root = mkdtempSync(join(tmpdir(), "jarvis-startup-plan-"));
    try {
      mkdirSync(join(root, "scripts"), { recursive: true });
      writeFileSync(join(root, "scripts", "register-startup-task.ps1"), "# test\n");

      const manifest = buildStartupRegistrationPlans({
        root,
        generatedAt: "2026-05-16T00:00:00.000Z",
      });

      expect(manifest.plans).toHaveLength(2);
      expect(manifest.plans.map((plan) => plan.runLevel)).toEqual(["limited", "highest"]);
      expect(manifest.plans.every((plan) => plan.approvalRequired)).toBe(true);
      expect(manifest.plans.every((plan) => plan.status === "ready")).toBe(true);
      expect(manifest.plans[1]?.commandPreview).toContain("-Elevated");
      expect(manifest.plans[0]?.rollbackCommand).toContain("-Remove");
      expect(manifest.note).toContain("Dry-run");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
