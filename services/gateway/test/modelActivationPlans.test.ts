import { describe, expect, it } from "vitest";
import type { ModelAssetManifest, ModelProfile, ModelReadiness, ReadyModelAsset } from "@jarvis/core";
import { buildModelActivationPlans, createModelActivationDryRun } from "../src/modelActivationPlans.js";

describe("model activation plans", () => {
  it("plans laptop-ready HF assets without loading weights", () => {
    const asset = readyAsset("ready-whisper", "hf-whisper", "Whisper", "openai/whisper-large-v3-turbo", "laptop-ready", [
      "huggingface-local",
    ]);
    const plans = buildModelActivationPlans({
      models: [model("hf-whisper", "Whisper", "openai/whisper-large-v3-turbo", "huggingface-local", 6)],
      readyAssets: [asset],
      manifests: [manifest(asset, "complete")],
      readiness: [readiness(asset, "laptop-ready")],
    });

    expect(plans[0]?.status).toBe("asset-ready");
    expect(plans[0]?.recommendedRuntime).toBe("huggingface-local");
    expect(plans[0]?.runtimeOptions[0]?.summary).toContain("safe probes");
    expect(plans[0]?.safeMode).toBe(true);
  });

  it("routes workstation assets toward served runtimes instead of local weight loading", () => {
    const asset = readyAsset("ready-qwen27", "hf-qwen27", "Qwen 27B", "Qwen/Qwen3.6-27B", "workstation", ["huggingface-local", "vllm", "sglang"]);
    const plans = buildModelActivationPlans({
      models: [model("hf-qwen27", "Qwen 27B", "Qwen/Qwen3.6-27B", "huggingface-local", 62)],
      readyAssets: [asset],
      manifests: [manifest(asset, "complete")],
      readiness: [readiness(asset, "workstation")],
    });

    expect(plans[0]?.status).toBe("needs-runtime");
    expect(plans[0]?.runtimeOptions.find((option) => option.runtime === "huggingface-local")?.status).toBe("too-heavy");
    expect(plans[0]?.runtimeOptions.find((option) => option.runtime === "vllm")?.endpointEnv).toBe("JARVIS_VLLM_URL");
  });

  it("creates approval-gated activation dry-runs with command and unload previews", () => {
    const asset = readyAsset("ready-qwen27", "hf-qwen27", "Qwen 27B", "Qwen/Qwen3.6-27B", "workstation", ["huggingface-local", "vllm"]);
    const [plan] = buildModelActivationPlans({
      models: [model("hf-qwen27", "Qwen 27B", "Qwen/Qwen3.6-27B", "huggingface-local", 62)],
      readyAssets: [asset],
      manifests: [manifest(asset, "complete")],
      readiness: [readiness(asset, "workstation")],
    });

    const dryRun = createModelActivationDryRun({
      id: "activation-dry-run",
      plan: plan!,
      runtime: "vllm",
      createdAt: "2026-05-16T00:00:00.000Z",
      evaluate: (action) => ({
        actionId: action.id,
        decision: "requires_approval",
        risk: "approval-required",
        reasons: ["service-control is configured as an approval-gated action."],
      }),
    });

    expect(dryRun.commandPreview).toContain("vllm");
    expect(dryRun.unloadPreview).toContain("vLLM");
    expect(dryRun.endpointEnv).toBe("JARVIS_VLLM_URL");
    expect(dryRun.decision.decision).toBe("requires_approval");
    expect(dryRun.safeMode).toBe(true);
  });
});

function readyAsset(
  id: string,
  profileId: string,
  label: string,
  modelRef: string,
  hardwareFit: ReadyModelAsset["hardwareFit"],
  runtimeAdapters: ReadyModelAsset["runtimeAdapters"],
): ReadyModelAsset {
  return {
    id,
    profileId,
    label,
    modelRef,
    localPath: `C:/models/${id}`,
    primaryUse: "test",
    runtimeAdapters,
    hardwareFit,
    detected: true,
  };
}

function model(id: string, label: string, modelRef: string, runtime: ModelProfile["runtime"], memory: number): ModelProfile {
  return {
    id,
    label,
    runtime,
    modelRef,
    modalities: ["text"],
    taskProfiles: ["daily-assistant"],
    scale: "laptop",
    safety: "local-only",
    enabled: true,
    recommendedMemoryGb: memory,
    notes: "test",
  };
}

function manifest(asset: ReadyModelAsset, status: ModelAssetManifest["status"]): ModelAssetManifest {
  return {
    id: asset.id,
    catalog: "ready",
    label: asset.label,
    modelRef: asset.modelRef,
    localPath: asset.localPath,
    exists: true,
    status,
    fileCount: 3,
    sizeBytes: 1024,
    hasConfig: true,
    hasTokenizer: true,
    hasProcessor: false,
    weightFileCount: 1,
    indexFileCount: 0,
    indexedShardCount: 0,
    missingIndexedShards: [],
    requiredFilesMissing: [],
    notes: [],
  };
}

function readiness(asset: ReadyModelAsset, hardwareFit: ModelReadiness["hardwareFit"]): ModelReadiness {
  return {
    modelId: asset.profileId,
    label: asset.label,
    modelRef: asset.modelRef,
    downloadState: "complete",
    runtimeState: "ready-asset",
    hardwareFit,
    artifactPath: asset.localPath,
    runtimePlan: "test",
    missingFiles: [],
    recommendedUse: "test",
    nextAction: "test",
  };
}
