import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ModelProfile, ModelReadiness, ReadyModelAsset, RuntimeKind, RuntimeProbe } from "@jarvis/core";
import { commandVersion } from "./doctor.js";

const DEFAULT_ENDPOINTS: Partial<Record<RuntimeKind, string>> = {
  lmstudio: "http://127.0.0.1:1234/v1/models",
  vllm: "http://127.0.0.1:8000/v1/models",
  sglang: "http://127.0.0.1:30000/v1/models",
  "llama-cpp": "http://127.0.0.1:8080/v1/models",
  "huggingface-tgi": "http://127.0.0.1:8081/info",
};

const RUNTIME_ENV: Partial<Record<RuntimeKind, string>> = {
  ollama: "JARVIS_OLLAMA_URL",
  lmstudio: "JARVIS_LMSTUDIO_URL",
  vllm: "JARVIS_VLLM_URL",
  sglang: "JARVIS_SGLANG_URL",
  "llama-cpp": "JARVIS_LLAMA_CPP_URL",
  "huggingface-tgi": "JARVIS_TGI_URL",
  "lan-local": "JARVIS_LAN_MODEL_URL",
};

interface ProbeOptions {
  runtime?: RuntimeKind;
  safeMode?: boolean;
}

export async function probeModelRuntime(
  model: ModelProfile,
  readiness: ModelReadiness,
  assets: ReadyModelAsset[],
  options: ProbeOptions = {},
): Promise<RuntimeProbe> {
  const started = Date.now();
  const runtime = options.runtime ?? model.runtime;
  const safeMode = options.safeMode ?? true;
  const readyAsset = assets.find((asset) => asset.profileId === model.id);
  const artifactPath = readyAsset?.localPath ?? readiness.artifactPath ?? model.artifact?.localPath;

  const base = {
    id: `probe-${model.id}-${Date.now().toString(36)}`,
    modelId: model.id,
    modelRef: model.modelRef,
    runtime,
    safeMode,
    checkedAt: new Date().toISOString(),
    artifactPath,
    estimatedMemoryGb: model.recommendedMemoryGb,
  };

  if (model.safety === "disabled-cloud" || model.installState === "disabled") {
    return finish(started, {
      ...base,
      status: "disabled",
      ok: false,
      notes: ["Hosted/cloud inference is represented only for planning and remains disabled by default."],
      blockers: ["Enable a local/LAN runtime instead of hosted inference."],
    });
  }

  if ((readiness.hardwareFit === "workstation" || readiness.hardwareFit === "homelab") && safeMode && runtime === "huggingface-local") {
    const folder = artifactPath ? inspectFolder(artifactPath) : undefined;
    return finish(started, {
      ...base,
      status: folder?.ok ? "too-heavy" : "missing-model",
      ok: false,
      fileCount: folder?.fileCount,
      sizeBytes: folder?.sizeBytes,
      notes: [
        "Safe probe did not load heavy local weights.",
        folder?.ok ? "Model files are present; use LM Studio, vLLM, SGLang, or a workstation runtime to serve it." : "Expected model folder is missing.",
      ],
      blockers: folder?.ok ? ["Model is staged for an optimized runtime or LAN endpoint."] : [artifactPath ?? "No artifact path configured."],
    });
  }

  if (runtime === "ollama") {
    return finish(started, probeOllama(base));
  }

  if (runtime === "huggingface-local") {
    return finish(started, probeHuggingFaceFolder(base, artifactPath));
  }

  if (runtime === "llama-cpp") {
    return finish(started, await probeOpenAiCompatible(base, runtime, model.modelRef, "llama.cpp", "llama-server"));
  }

  if (runtime === "lmstudio" || runtime === "vllm" || runtime === "sglang" || runtime === "huggingface-tgi" || runtime === "lan-local") {
    return finish(started, await probeOpenAiCompatible(base, runtime, model.modelRef, runtime));
  }

  return finish(started, {
    ...base,
    status: "error",
    ok: false,
    notes: [`No runtime probe is implemented for ${runtime}.`],
    blockers: ["Add a runtime adapter probe."],
  });
}

function probeOllama(base: Omit<RuntimeProbe, "status" | "ok" | "latencyMs" | "notes" | "blockers">): Omit<RuntimeProbe, "latencyMs"> {
  const tags = commandVersion("ollama", ["list"]);
  if (!tags.ok) {
    return {
      ...base,
      status: "missing-tool",
      ok: false,
      command: "ollama list",
      notes: ["Ollama CLI is not available or not responding."],
      blockers: [tags.output],
    };
  }

  const installed = tags.output.toLowerCase().includes(base.modelRef.toLowerCase());
  return {
    ...base,
    status: installed ? "ready" : "missing-model",
    ok: installed,
    command: "ollama list",
    notes: installed ? ["Ollama reports this model tag locally."] : ["Ollama is installed, but this model tag is not listed."],
    blockers: installed ? [] : [`Run an approved pull/install for ${base.modelRef}.`],
  };
}

function probeHuggingFaceFolder(
  base: Omit<RuntimeProbe, "status" | "ok" | "latencyMs" | "notes" | "blockers">,
  artifactPath: string | undefined,
): Omit<RuntimeProbe, "latencyMs"> {
  const folder = artifactPath ? inspectFolder(artifactPath) : undefined;
  if (!artifactPath || !folder?.ok) {
    return {
      ...base,
      status: "missing-model",
      ok: false,
      notes: ["Expected local Hugging Face snapshot folder is missing."],
      blockers: [artifactPath ?? "No artifact path configured."],
    };
  }

  const hasConfig = existsSync(join(artifactPath, "config.json"));
  const hasTokenizer = existsSync(join(artifactPath, "tokenizer.json")) || existsSync(join(artifactPath, "tokenizer.model"));
  const hasWeights = folder.files.some((filePath) => /\.(safetensors|bin|gguf)$/i.test(filePath));
  const ok = hasConfig && hasWeights;

  return {
    ...base,
    status: ok ? "asset-ready" : "missing-model",
    ok,
    fileCount: folder.fileCount,
    sizeBytes: folder.sizeBytes,
    notes: [
      "Safe Hugging Face probe checked snapshot files only; it did not load model weights.",
      hasConfig ? "config.json found." : "config.json missing.",
      hasTokenizer ? "tokenizer found." : "tokenizer not found or model may use remote/custom processing.",
      hasWeights ? "weight files found." : "weight files missing.",
    ],
    blockers: ok ? [] : ["Snapshot is incomplete for local Transformers loading."],
  };
}

async function probeOpenAiCompatible(
  base: Omit<RuntimeProbe, "status" | "ok" | "latencyMs" | "notes" | "blockers">,
  runtime: RuntimeKind,
  modelRef: string,
  label: string,
  command?: string,
): Promise<Omit<RuntimeProbe, "latencyMs">> {
  const endpoint = endpointFor(runtime);
  const tool = command ? commandVersion(command, ["--version"]) : undefined;

  if (!endpoint) {
    return {
      ...base,
      status: command && !tool?.ok ? "missing-tool" : "needs-endpoint",
      ok: false,
      command,
      notes: [`${label} probe needs an explicit local/LAN endpoint.`],
      blockers: [`Set ${RUNTIME_ENV[runtime] ?? "runtime endpoint env var"} to a local server URL.`],
    };
  }

  const response = await fetchJson(endpoint);
  if (!response.ok) {
    return {
      ...base,
      status: command && !tool?.ok ? "missing-tool" : "needs-endpoint",
      ok: false,
      endpoint,
      command,
      notes: [`${label} endpoint is not reachable.`],
      blockers: [response.error],
    };
  }

  const body = JSON.stringify(response.body).toLowerCase();
  const served = body.includes(modelRef.toLowerCase()) || body.includes(modelRef.split("/").pop()?.toLowerCase() ?? modelRef.toLowerCase());
  return {
    ...base,
    status: served ? "served" : "needs-endpoint",
    ok: served,
    endpoint,
    command,
    notes: served ? [`${label} endpoint is serving a matching model.`] : [`${label} endpoint responded, but no matching model was advertised.`],
    blockers: served ? [] : [`Serve or register ${modelRef} on ${endpoint}.`],
  };
}

function endpointFor(runtime: RuntimeKind): string | undefined {
  const envName = RUNTIME_ENV[runtime];
  const configured = envName ? process.env[envName] : undefined;
  const base = configured ?? DEFAULT_ENDPOINTS[runtime];
  if (!base) {
    return undefined;
  }
  if (base.endsWith("/v1") || base.endsWith("/api")) {
    return `${base}/models`;
  }
  return base;
}

async function fetchJson(url: string): Promise<{ ok: true; body: unknown } | { ok: false; error: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      return { ok: false, error: `${response.status} ${response.statusText}` };
    }
    return { ok: true, body: await response.json() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

function inspectFolder(folderPath: string): { ok: boolean; files: string[]; fileCount: number; sizeBytes: number } {
  if (!existsSync(folderPath)) {
    return { ok: false, files: [], fileCount: 0, sizeBytes: 0 };
  }
  const files = collectFiles(folderPath);
  const sizeBytes = files.reduce((total, filePath) => total + statSync(filePath).size, 0);
  return { ok: true, files, fileCount: files.length, sizeBytes };
}

function collectFiles(folderPath: string): string[] {
  return readdirSync(folderPath, { withFileTypes: true }).flatMap((entry) => {
    const childPath = join(folderPath, entry.name);
    if (entry.isDirectory()) {
      return collectFiles(childPath);
    }
    return entry.isFile() ? [childPath] : [];
  });
}

function finish<T extends Omit<RuntimeProbe, "latencyMs">>(started: number, probe: T): RuntimeProbe {
  return {
    ...probe,
    latencyMs: Date.now() - started,
  };
}
