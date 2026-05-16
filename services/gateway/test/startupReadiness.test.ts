import { describe, expect, it } from "vitest";
import { buildStartupReadiness, withTempStartupFixture } from "../src/startupReadiness.js";

describe("startup readiness", () => {
  it("reports scripts, shortcut fallback, pid files, and limited authority", () => {
    withTempStartupFixture((root, startupFolder) => {
      const report = buildStartupReadiness({
        root,
        generatedAt: "2026-05-16T00:00:00.000Z",
        startupFolder,
        commandRunner: (command, args) => {
          if (command === "schtasks.exe") {
            return "TaskName: Secretary Jarvis Local Runtime\nRun As Task: Interactive Token\n";
          }
          throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
        },
      });

      expect(report.summary.scriptsReady).toBe(true);
      expect(report.scheduledTask.configured).toBe(true);
      expect(report.scheduledTask.runLevel).toBe("limited");
      expect(report.startupShortcut.configured).toBe(true);
      expect(report.summary.backgroundPidFiles).toBe(1);
      expect(report.summary.runningPidFiles).toBe(1);
      expect(report.authority.highTrustMode).toBe("limited");
      expect(report.recommendations.join(" ")).toContain("Sensitive actions");
    });
  });

  it("detects elevated scheduled task intent without executing elevation", () => {
    const report = buildStartupReadiness({
      root: "C:/missing",
      generatedAt: "2026-05-16T00:00:00.000Z",
      startupFolder: "C:/missing/startup",
      commandRunner: (command) => {
        if (command === "schtasks.exe") {
          return "TaskName: Secretary Jarvis Local Runtime\nRunLevel: HighestAvailable\n";
        }
        throw new Error("not admin");
      },
    });

    expect(report.scheduledTask.configured).toBe(true);
    expect(report.scheduledTask.runLevel).toBe("highest");
    expect(report.authority.elevatedRequested).toBe(true);
    expect(report.authority.highTrustMode).toBe("approved-admin-ready");
  });
});
