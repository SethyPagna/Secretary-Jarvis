import { describe, expect, it } from "vitest";
import { buildProcessVisibilityStatus, withTempProcessVisibilityFixture } from "../src/processVisibility.js";

describe("process visibility", () => {
  it("reports PID files and expected Task Manager visibility without changing processes", () => {
    withTempProcessVisibilityFixture((runtimeRoot) => {
      const status = buildProcessVisibilityStatus({
        generatedAt: "2026-05-16T00:00:00.000Z",
        runtimeRoot,
        pidAlive: (pid) => pid === process.pid,
      });

      expect(status.summary.tracked).toBeGreaterThanOrEqual(5);
      expect(status.summary.pidFilesPresent).toBe(2);
      expect(status.summary.alive).toBe(1);
      expect(status.summary.visibleInTaskManager).toBe(1);
      expect(status.services.find((service) => service.id === "typescript-gateway")?.expectedProcessNames).toContain("node.exe");
      expect(status.note).toContain("Read-only");
    });
  });
});
