import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FutureScalingModel, ReadyModelAsset } from "@jarvis/core";
import { inspectFutureScalingModel, inspectReadyModelAsset } from "../src/modelManifest.js";

describe("local model asset manifests", () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), "jarvis-model-manifest-"));
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("reports a complete ready snapshot without loading weights", () => {
    writeFileSync(join(tempRoot, "config.json"), "{}");
    writeFileSync(join(tempRoot, "tokenizer.json"), "{}");
    writeFileSync(join(tempRoot, "model.safetensors"), "tiny fixture");
    const asset: ReadyModelAsset = {
      id: "ready-test",
      profileId: "hf-test",
      label: "Test Ready Model",
      modelRef: "local/test-ready",
      localPath: tempRoot,
      primaryUse: "test",
      runtimeAdapters: ["huggingface-local"],
      hardwareFit: "laptop-ready",
    };

    const manifest = inspectReadyModelAsset(asset);

    expect(manifest).toMatchObject({
      catalog: "ready",
      exists: true,
      status: "complete",
      integrity: "complete",
      runnableState: "downloaded",
      hasConfig: true,
      hasTokenizer: true,
      weightFileCount: 1,
    });
    expect(manifest.notes.join(" ")).toContain("weights were not loaded");
  });

  it("flags partial indexed snapshots when shards are missing", () => {
    writeFileSync(join(tempRoot, "config.json"), "{}");
    writeFileSync(join(tempRoot, "tokenizer.json"), "{}");
    writeFileSync(
      join(tempRoot, "model.safetensors.index.json"),
      JSON.stringify({ weight_map: { "layer.0": "model-00001-of-00002.safetensors", "layer.1": "model-00002-of-00002.safetensors" } }),
    );
    writeFileSync(join(tempRoot, "model-00001-of-00002.safetensors"), "tiny shard");
    const asset: ReadyModelAsset = {
      id: "ready-partial",
      profileId: "hf-partial",
      label: "Partial Ready Model",
      modelRef: "local/partial",
      localPath: tempRoot,
      primaryUse: "test",
      runtimeAdapters: ["huggingface-local"],
      hardwareFit: "laptop-staged",
    };

    const manifest = inspectReadyModelAsset(asset);

    expect(manifest.status).toBe("partial");
    expect(manifest.integrity).toBe("incomplete");
    expect(manifest.runnableState).toBe("incomplete");
    expect(manifest.indexedShardCount).toBe(2);
    expect(manifest.missingIndexedShards).toEqual(["model-00002-of-00002.safetensors"]);
    expect(manifest.requiredFilesMissing).toContain("indexed shards");
  });

  it("marks browser partial downloads as incomplete, not ready", () => {
    writeFileSync(join(tempRoot, "config.json"), "{}");
    writeFileSync(join(tempRoot, "tokenizer.json"), "{}");
    writeFileSync(join(tempRoot, "model-00001-of-00002.safetensors.crdownload"), "partial");
    writeFileSync(join(tempRoot, "model-00002-of-00002.safetensors"), "fixture shard");
    const asset: ReadyModelAsset = {
      id: "ready-downloading",
      profileId: "hf-downloading",
      label: "Downloading Model",
      modelRef: "local/downloading",
      localPath: tempRoot,
      primaryUse: "test",
      runtimeAdapters: ["huggingface-local"],
      hardwareFit: "workstation",
    };

    const manifest = inspectReadyModelAsset(asset);

    expect(manifest.status).toBe("partial");
    expect(manifest.integrity).toBe("incomplete");
    expect(manifest.partialDownloadFileCount).toBe(1);
    expect(manifest.requiredFilesMissing).toContain("partial downloads");
  });

  it("marks Git or Xet pointer weights as pointer-only", () => {
    writeFileSync(join(tempRoot, "config.json"), "{}");
    writeFileSync(join(tempRoot, "tokenizer.json"), "{}");
    writeFileSync(
      join(tempRoot, "model.safetensors"),
      "version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 123456789\n",
    );
    const asset: ReadyModelAsset = {
      id: "ready-pointer",
      profileId: "hf-pointer",
      label: "Pointer Model",
      modelRef: "local/pointer",
      localPath: tempRoot,
      primaryUse: "test",
      runtimeAdapters: ["huggingface-local"],
      hardwareFit: "workstation",
    };

    const manifest = inspectReadyModelAsset(asset);

    expect(manifest.integrity).toBe("pointer-only");
    expect(manifest.runnableState).toBe("incomplete");
    expect(manifest.pointerFileCount).toBe(1);
    expect(manifest.requiredFilesMissing).toContain("full model weights (Git/Xet pointers detected)");
  });

  it("keeps future scaling manifests separate from ready assets", () => {
    mkdirSync(join(tempRoot, "repo"), { recursive: true });
    writeFileSync(join(tempRoot, "repo", "config.json"), "{}");
    const future: FutureScalingModel = {
      id: "scale-test",
      label: "Future Scale Test",
      modelRef: "future/test",
      scale: "homelab",
      purpose: "test future scaling",
      expectedRuntime: "vllm",
      expectedPath: join(tempRoot, "repo"),
      notes: "future only",
    };

    const manifest = inspectFutureScalingModel(future);

    expect(manifest.catalog).toBe("future-scaling");
    expect(manifest.status).toBe("metadata-only");
    expect(manifest.runnableState).toBe("future-scaling");
    expect(manifest.notes.join(" ")).toContain("Future scaling asset remains separate");
  });
});
