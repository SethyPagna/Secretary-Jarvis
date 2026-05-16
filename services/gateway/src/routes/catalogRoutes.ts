import type { FutureScalingModel, JarvisStatus, NeededFeatureDownload } from "@jarvis/core";
import { buildFeaturePluginSlotManifest } from "../featurePluginSlots.js";
import { buildSetupActionGroups } from "../setupActions.js";
import { buildSetupInstallPlanManifest } from "../setupInstallPlans.js";

type SendJson = (statusCode: number, body: unknown) => void;

export function tryHandleCatalogRoute(params: {
  method: string | undefined;
  pathname: string;
  now: () => string;
  sendJson: SendJson;
  statusWithRuntimeState: () => JarvisStatus;
  localModelAssetManifests: () => Record<string, unknown>;
  modelActivationPlans: () => Array<{ status: string }>;
  hydrateFeatureDownloads: () => NeededFeatureDownload[];
  futureScalingModels: FutureScalingModel[];
  detectToolStatuses: () => unknown[];
}): boolean {
  if (params.method !== "GET") {
    return false;
  }

  if (params.pathname === "/api/models") {
    const runtimeStatus = params.statusWithRuntimeState();
    const assetManifests = params.localModelAssetManifests();
    params.sendJson(200, {
      models: runtimeStatus.models,
      readyModelAssets: runtimeStatus.readyModelAssets,
      assetManifests,
      modelReadiness: runtimeStatus.modelReadiness,
      futureScalingModels: runtimeStatus.futureScalingModels,
      runtimeAdapters: runtimeStatus.runtimeAdapters ?? [],
      hardwareProfile: runtimeStatus.hardwareProfile,
      toolStatuses: params.detectToolStatuses(),
    });
    return true;
  }

  if (params.pathname === "/api/models/readiness") {
    const runtimeStatus = params.statusWithRuntimeState();
    const assetManifests = params.localModelAssetManifests();
    params.sendJson(200, {
      readyModelAssets: runtimeStatus.readyModelAssets ?? [],
      assetManifests,
      readiness: runtimeStatus.modelReadiness ?? [],
      activeModelId: runtimeStatus.activeModelId,
      hardwareProfile: runtimeStatus.hardwareProfile,
    });
    return true;
  }

  if (params.pathname === "/api/models/activation-plans") {
    const plans = params.modelActivationPlans();
    params.sendJson(200, {
      plans,
      summary: {
        readyToUse: plans.filter((plan) => plan.status === "ready-to-use").length,
        assetReady: plans.filter((plan) => plan.status === "asset-ready").length,
        needsRuntime: plans.filter((plan) => plan.status === "needs-runtime" || plan.status === "too-heavy").length,
        missingAsset: plans.filter((plan) => plan.status === "missing-asset").length,
      },
    });
    return true;
  }

  if (params.pathname === "/api/models/local-assets") {
    const assetManifests = params.localModelAssetManifests() as {
      ready?: Array<{ status: string }>;
      futureScaling?: Array<{ status: string }>;
    };
    params.sendJson(200, {
      ...assetManifests,
      summary: {
        readyComplete: (assetManifests.ready ?? []).filter((manifest) => manifest.status === "complete").length,
        futureScalingComplete: (assetManifests.futureScaling ?? []).filter((manifest) => manifest.status === "complete").length,
        missingOrPartial: [...(assetManifests.ready ?? []), ...(assetManifests.futureScaling ?? [])].filter(
          (manifest) => manifest.status !== "complete",
        ).length,
      },
    });
    return true;
  }

  if (params.pathname === "/api/setup/needed-feature-downloads") {
    params.sendJson(200, {
      downloads: params.hydrateFeatureDownloads(),
      note: "These are feature dependencies Jarvis is wired to use after you download/install them. They are separate from future scaling models.",
    });
    return true;
  }

  if (params.pathname === "/api/setup/action-groups") {
    params.sendJson(200, {
      groups: buildSetupActionGroups({
        neededFeatureDownloads: params.hydrateFeatureDownloads(),
        futureScalingModels: params.futureScalingModels,
      }),
      note: "Feature dependencies are actionable setup items. Future scaling models are optional later switch targets.",
    });
    return true;
  }

  if (params.pathname === "/api/setup/plugin-slots") {
    params.sendJson(200, {
      manifest: buildFeaturePluginSlotManifest({
        downloads: params.hydrateFeatureDownloads(),
        generatedAt: params.now(),
      }),
    });
    return true;
  }

  if (params.pathname === "/api/setup/install-plans") {
    const generatedAt = params.now();
    params.sendJson(200, {
      manifest: buildSetupInstallPlanManifest({
        generatedAt,
        slotManifest: buildFeaturePluginSlotManifest({
          downloads: params.hydrateFeatureDownloads(),
          generatedAt,
        }),
      }),
    });
    return true;
  }

  if (params.pathname === "/api/models/future-scaling") {
    params.sendJson(200, {
      models: params.futureScalingModels,
      note: "These are optional future scale-up targets for model switching and benchmarking, not feature dependency downloads.",
    });
    return true;
  }

  return false;
}
