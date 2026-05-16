import { describe, expect, it } from "vitest";
import type { NeededFeatureDownload } from "@jarvis/core";
import { buildFeaturePluginSlotManifest } from "../src/featurePluginSlots.js";
import { buildSetupInstallPlanManifest, createSetupInstallDryRun } from "../src/setupInstallPlans.js";

describe("setup install plans", () => {
  it("creates dry-run-only plans with manual steps and approval flags", () => {
    const generatedAt = "2026-05-16T00:00:00.000Z";
    const slotManifest = buildFeaturePluginSlotManifest({
      downloads: [
        download("feature-piper", "voice", "needed", "C:/jarvis/tools/piper"),
        download("feature-social-credentials", "connector", "needed", "C:/jarvis/data/vault"),
        download("feature-map-data", "maps", "optional", "C:/jarvis/data/maps"),
      ],
      generatedAt,
      pathExists: (path) => path.includes("piper"),
      listFiles: (path) =>
        path.includes("piper")
          ? ["C:/jarvis/tools/piper/piper.exe", "C:/jarvis/tools/piper/voices/jarvis.onnx", "C:/jarvis/tools/piper/voices/jarvis.json"]
          : [],
    });

    const manifest = buildSetupInstallPlanManifest({ slotManifest, generatedAt });

    expect(manifest.summary).toMatchObject({ ready: 1, optional: 1, approvalRequired: 2 });
    expect(manifest.note).toContain("never downloads");

    const piper = manifest.plans.find((plan) => plan.slotId === "feature-piper");
    expect(piper?.status).toBe("ready");
    expect(piper?.approvalRequired).toBe(false);
    expect(piper?.commandPreview).toContain("manual extract");
    expect(piper?.manualSteps.join(" ")).toContain("Piper");

    const vault = manifest.plans.find((plan) => plan.slotId === "feature-social-credentials");
    expect(vault?.actionCategory).toBe("credential-access");
    expect(vault?.approvalRequired).toBe(true);
    expect(vault?.commandPreview).toContain("Vault");
    expect(vault?.detailsHiddenByDefault).toBe(true);
  });

  it("creates approval-gated setup dry-runs without executing installers", () => {
    const generatedAt = "2026-05-16T00:00:00.000Z";
    const slotManifest = buildFeaturePluginSlotManifest({
      downloads: [download("feature-yolo", "vision", "needed", "C:/jarvis/models/yolo")],
      generatedAt,
      pathExists: () => false,
      listFiles: () => [],
    });
    const manifest = buildSetupInstallPlanManifest({ slotManifest, generatedAt });
    const plan = manifest.plans[0];

    const dryRun = createSetupInstallDryRun({
      id: "setup-install-test",
      plan,
      createdAt: generatedAt,
      evaluate: (action) => ({
        actionId: action.id,
        decision: "requires_approval",
        risk: "approval-required",
        reasons: [`${action.category} is configured as an approval-gated action.`],
      }),
    });

    expect(dryRun.safeMode).toBe(true);
    expect(dryRun.executed).toBe(false);
    expect(dryRun.action.category).toBe("model-download");
    expect(dryRun.decision.decision).toBe("requires_approval");
    expect(dryRun.notes.join(" ")).toContain("no installer was launched");
    expect(dryRun.blockers).toContain("Folder");
  });
});

function download(
  id: string,
  category: NeededFeatureDownload["category"],
  status: NeededFeatureDownload["status"],
  expectedPath: string,
): NeededFeatureDownload {
  return {
    id,
    category,
    label: id,
    purpose: "test purpose",
    expectedPath,
    installHint: "test hint",
    status,
    plugsInto: ["test"],
  };
}
