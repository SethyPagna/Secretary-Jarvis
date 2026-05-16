import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPackagingReadiness } from "../src/packagingReadiness.js";

describe("packaging readiness", () => {
  it("reports Electron packaging, startup commands, and staged wake methods", () => {
    withPackagingFixture((root) => {
      const report = buildPackagingReadiness({
        root,
        generatedAt: "2026-05-16T00:00:00.000Z",
      });

      expect(report.summary.electronShellReady).toBe(true);
      expect(report.summary.startupScriptsReady).toBe(true);
      expect(report.summary.productionCommandsReady).toBe(true);
      expect(report.electron.commands).toContain("npm.cmd run dist:hud");
      expect(report.startup.startScript).toContain("jarvis-runtime.ps1");
      expect(report.startup.checkOnlyCommand).toContain("-CheckOnly");
      expect(report.backgroundRuntime.expectedProcesses).toContain("electron.exe");
      expect(report.backgroundRuntime.wakeMethods.some((method) => method.id === "hotword" && method.status === "staged")).toBe(true);
      expect(report.recommendations.join(" ")).toContain("Hotword wake remains staged");
    });
  });
});

function withPackagingFixture(callback: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "jarvis-packaging-"));
  try {
    mkdirSync(join(root, "apps", "hud", "electron"), { recursive: true });
    mkdirSync(join(root, "scripts"), { recursive: true });
    writeFileSync(join(root, "apps", "hud", "package.json"), "{}");
    writeFileSync(join(root, "apps", "hud", "electron", "main.ts"), "export {};\n");
    for (const script of ["jarvis-runtime.ps1"]) {
      writeFileSync(join(root, "scripts", script), "# test\n");
    }
    callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
