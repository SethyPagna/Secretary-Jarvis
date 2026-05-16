import { describe, expect, it } from "vitest";
import { buildCodeHealthReport, withTempCodeHealthFixture } from "../src/codeHealth.js";

describe("code health report", () => {
  it("flags cleanup hints without deleting or modifying project files", () => {
    withTempCodeHealthFixture((root) => {
      const report = buildCodeHealthReport({
        root,
        generatedAt: "2026-05-16T00:00:00.000Z",
      });

      expect(report.scannedFiles).toBeGreaterThan(0);
      expect(report.oversizedFiles[0]?.path).toBe("big.ts");
      expect(report.duplicateBasenames.find((entry) => entry.name === "copy.ts")?.paths.length).toBe(2);
      expect(report.repeatedRouteLiterals.find((entry) => entry.route === "/api/test")?.count).toBe(2);
      expect(report.staleMarkers.find((entry) => entry.marker === "TODO")?.count).toBe(1);
      expect(report.cleanupBacklog.join(" ")).toContain("TypeScript");
    });
  });
});
