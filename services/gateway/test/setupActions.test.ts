import { describe, expect, it } from "vitest";
import type { FutureScalingModel, NeededFeatureDownload } from "@jarvis/core";
import { buildSetupActionGroups } from "../src/setupActions.js";

describe("setup action groups", () => {
  it("keeps feature dependencies separate from future scaling models", () => {
    const groups = buildSetupActionGroups({
      neededFeatureDownloads: [
        {
          id: "feature-piper",
          category: "voice",
          label: "Piper",
          purpose: "Local TTS",
          expectedPath: "tools/piper",
          installHint: "download piper",
          status: "needed",
          plugsInto: ["Voice"],
        },
        {
          id: "feature-maps",
          category: "maps",
          label: "Maps",
          purpose: "Offline maps",
          expectedPath: "data/maps",
          installHint: "download maps",
          status: "optional",
          plugsInto: ["Maps"],
        },
      ] satisfies NeededFeatureDownload[],
      futureScalingModels: [
        {
          id: "scale-deepseek",
          label: "DeepSeek V4 Flash",
          modelRef: "deepseek-ai/DeepSeek-V4-Flash",
          scale: "homelab",
          purpose: "Scale-up reasoning",
          expectedRuntime: "vllm",
          notes: "future",
        },
      ] satisfies FutureScalingModel[],
    });

    expect(groups).toHaveLength(2);
    expect(groups[0]?.kind).toBe("needed-feature-downloads");
    expect(groups[0]?.items.map((item) => item.status)).toEqual(["needed", "optional"]);
    expect(groups[1]?.kind).toBe("future-scaling-models");
    expect(groups[1]?.items[0]?.approvalRequired).toBe(true);
  });
});
