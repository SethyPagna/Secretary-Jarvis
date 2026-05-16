import type { FutureScalingModel, NeededFeatureDownload, SetupActionGroup } from "@jarvis/core";

export function buildSetupActionGroups(params: {
  neededFeatureDownloads: NeededFeatureDownload[];
  futureScalingModels: FutureScalingModel[];
}): SetupActionGroup[] {
  const neededCount = params.neededFeatureDownloads.filter((item) => item.status === "needed").length;
  const optionalCount = params.neededFeatureDownloads.filter((item) => item.status === "optional").length;
  return [
    {
      id: "setup-needed-feature-downloads",
      label: "Needed Feature Downloads",
      kind: "needed-feature-downloads",
      summary: `${neededCount} needed, ${optionalCount} optional feature dependency path(s).`,
      items: params.neededFeatureDownloads.map((download) => ({
        id: download.id,
        label: download.label,
        status: download.status,
        purpose: download.purpose,
        expectedPath: download.expectedPath,
        actionLabel: download.status === "detected" ? "Open status" : "Show install hint",
        approvalRequired: false,
      })),
    },
    {
      id: "setup-future-scaling-models",
      label: "Future Scaling Models",
      kind: "future-scaling-models",
      summary: `${params.futureScalingModels.length} optional scale-up target(s) for later switching.`,
      items: params.futureScalingModels.map((model) => ({
        id: model.id,
        label: model.label,
        status: "future",
        purpose: model.purpose,
        expectedPath: model.expectedPath,
        actionLabel: "Keep staged",
        approvalRequired: true,
      })),
    },
  ];
}
