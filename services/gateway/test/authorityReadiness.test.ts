import { describe, expect, it } from "vitest";
import { buildAuthorityReadiness } from "../src/authorityReadiness.js";
import { buildStartupReadiness, withTempStartupFixture } from "../src/startupReadiness.js";

describe("authority readiness", () => {
  it("summarizes local authority without granting hidden escalation", () => {
    withTempStartupFixture((root, startupFolder) => {
      const generatedAt = "2026-05-16T00:00:00.000Z";
      const startup = buildStartupReadiness({
        root,
        generatedAt,
        startupFolder,
        commandRunner: (command) => {
          if (command === "schtasks.exe") {
            return "TaskName: Secretary Jarvis Local Runtime\nRun As Task: Interactive Token\n";
          }
          throw new Error("not admin");
        },
      });

      const report = buildAuthorityReadiness({
        generatedAt,
        privacyMode: "strict-local",
        startup,
      });

      expect(report.mode).toBe("limited-local");
      expect(report.localAuthority.approvedAdminAvailable).toBe(false);
      expect(report.actionSummary.approvalRequired).toBeGreaterThan(0);
      expect(report.sensitiveApprovalCategories).toContain("delete-local");
      expect(report.blockedCategories).toContain("protected-core-access");
      expect(report.guardrails.join(" ")).toContain("20-minute undo");
      expect(report.hierarchy.map((layer) => layer.layer)).toContain("Sentinel Policy");
    });
  });

  it("marks approved-admin ready only when startup indicates elevated intent", () => {
    const generatedAt = "2026-05-16T00:00:00.000Z";
    const startup = buildStartupReadiness({
      root: "C:/missing",
      generatedAt,
      startupFolder: "C:/missing/startup",
      commandRunner: (command) => {
        if (command === "schtasks.exe") {
          return "TaskName: Secretary Jarvis Local Runtime\nRunLevel: HighestAvailable\n";
        }
        return "";
      },
    });

    const report = buildAuthorityReadiness({
      generatedAt,
      privacyMode: "strict-local",
      startup,
    });

    expect(report.mode).toBe("approved-admin-ready");
    expect(report.localAuthority.approvedAdminAvailable).toBe(true);
    expect(report.hierarchy.find((layer) => layer.layer === "Python Brain")?.canEscalate).toBe(true);
    expect(report.guardrails.join(" ")).toContain("Protected core");
  });
});
