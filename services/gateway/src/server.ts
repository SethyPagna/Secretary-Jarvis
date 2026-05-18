import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { basename, dirname, isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";
import { URL } from "node:url";
import {
  appendTranscriptChunk,
  applyTaskStatus,
  futureScalingModels,
  createModelDryRun,
  createOutboundMessageDraft,
  createSteeringEvent,
  createVoiceSession,
  createWorkflowRun,
  createWorkflowRunEvent,
  draftWorkflowFromPrompt,
  dryRunWorkflow,
  hydrateReadyModelAssets,
  neededFeatureDownloads,
  validateWorkflowDefinition,
  evaluateActionPolicy,
  classifySystemCommand,
  createSystemActionDraft,
  createUndoJournalEntry,
  isReversibleSystemCommand,
  readinessForModel,
  seededStatus,
  selectModelForTask,
  sentinelReviewAction,
  sentinelReviewPrompt,
  taskEvent,
  type ActionRequest,
  type Conversation,
  type ConversationTurn,
  type DeviceLink,
  type JarvisStatus,
  type MapInsight,
  type MobilePairing,
  type ModelDryRunResult,
  type ModelSource,
  type MemoryWrite,
  type OutboundMessageDraft,
  type PerformanceSnapshot,
  type PrivacyMode,
  type ReportSnapshot,
  type RuntimeServiceId,
  type ScaleProfile,
  type TaskRun,
  type TaskProfile,
  type TimelineEvent,
  type RuntimeKind,
  type SystemAction,
  type TtsRequest,
  type UndoJournalEntry,
  type UnifiedReadinessItem,
  type VisionInsight,
  type WorkflowDefinition,
  type WorkflowCanvasLayout,
  type WorkflowDraftEdit,
  type WorkflowRun,
  type WorkflowRunEvent,
  type WorkflowStep,
} from "@jarvis/core";
import { commandVersion, detectToolStatuses } from "./doctor.js";
import { buildAgentManagerReadiness } from "./agentManagerReadiness.js";
import { buildAgentVoiceMatrix } from "./agentVoiceMatrix.js";
import { EventHub } from "./eventHub.js";
import { buildFeaturePluginSlotManifest } from "./featurePluginSlots.js";
import { buildInteractionHealth } from "./interactionHealth.js";
import { buildRuntimeServicesStatus } from "./liveRuntime.js";
import { appendLiveTranscriptChunk, commitLiveTranscript, startLiveVoiceSession, stopLiveVoiceSession } from "./liveVoice.js";
import { createLiveVisionRequest, type LiveVisionMode } from "./liveVision.js";
import { buildModelActivationPlans, createModelActivationDryRun } from "./modelActivationPlans.js";
import { inspectFutureScalingModel, inspectReadyModelAsset } from "./modelManifest.js";
import { probeModelRuntime } from "./modelProbe.js";
import { buildPackagingReadiness } from "./packagingReadiness.js";
import { buildProcessVisibilityStatus } from "./processVisibility.js";
import { createRuntimeAdapterRepairDryRun, isRuntimeAdapterRepairKind } from "./runtimeAdapterRepair.js";
import { buildRuntimeAttention, createRuntimeAttentionDryRun } from "./runtimeAttention.js";
import { createRuntimeControlDryRun, isRuntimeControlKind } from "./runtimeControl.js";
import { buildRuntimeConstellation } from "./runtimeConstellation.js";
import { readRuntimeLiveTestStatus, runRuntimeLiveTest } from "./runtimeLiveTest.js";
import { buildRuntimeSelfTest } from "./runtimeSelfTest.js";
import { readRuntimeSmokeStatus } from "./runtimeSmoke.js";
import { PermissionStore, type PermissionRecord } from "./permissionStore.js";
import { buildStartupRegistrationPlans } from "./startupRegistrationPlans.js";
import { tryHandleCatalogRoute } from "./routes/catalogRoutes.js";
import { tryHandleRuntimeSummaryRoute } from "./routes/runtimeSummaryRoutes.js";
import { tryHandleSecurityCatalogRoute } from "./routes/securityCatalogRoutes.js";
import { buildSetupInstallPlanManifest, createSetupInstallDryRun } from "./setupInstallPlans.js";
import { tryHandleReadinessRoute } from "./routes/readinessRoutes.js";
import { JarvisStore } from "./store.js";
import { buildVisionRuntimeReadiness } from "./visionReadiness.js";
import { buildVoiceRuntimeReadiness } from "./voiceReadiness.js";
import { buildWakeRuntimeActivationReadiness } from "./wakeRuntimeActivation.js";

const DEFAULT_PORT = 4317;
const HF_SNAPSHOT_ROOT = "C:\\Users\\user\\Downloads\\Secretary Jarvis\\models\\huggingface\\snapshots";
const VOICE_ASSET_ROOT = "C:\\Users\\user\\Downloads\\Secretary Jarvis\\jarvis\\assets\\voice";
const OLLAMA_URL = process.env.JARVIS_OLLAMA_URL ?? "http://127.0.0.1:11434";
const BRAIN_URL = process.env.JARVIS_BRAIN_URL ?? "http://127.0.0.1:5000";
const WORKFLOW_LAYOUT_PATH = join(process.cwd(), "data", "runtime", "workflow-layouts.json");
const JSON_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type",
  "content-type": "application/json; charset=utf-8",
};
const RUNTIME_KINDS: RuntimeKind[] = ["ollama", "lmstudio", "llama-cpp", "vllm", "sglang", "huggingface-local", "huggingface-tgi", "lan-local"];

type BrainSystemExecutionResult = {
  status: "executed" | "staged" | "blocked" | "failed" | string;
  executed: boolean;
  actionId?: string;
  category?: string;
  message: string;
  payload?: Record<string, unknown>;
  localOnly?: boolean;
};

type BrainHfGenerationResult = {
  status: "generated" | "ready-asset" | "staged" | "missing" | "failed" | string;
  modelRef: string;
  text?: string;
  loaded?: boolean;
  buildId?: string;
  error?: string;
};

let status: JarvisStatus = structuredClone(seededStatus);
const store = new JarvisStore();
const events = new EventHub();
const permissionStore = new PermissionStore();
const socialDrafts: OutboundMessageDraft[] = [];
const mobilePairings: MobilePairing[] = [];
const pendingSystemActions = new Map<string, SystemAction>();
let ollamaListCache: { checkedAt: number; result: { ok: boolean; output: string } } | undefined;

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, JSON_HEADERS);
  response.end(JSON.stringify(body, null, 2));
}

function runtimeActivationReadiness() {
  return buildWakeRuntimeActivationReadiness({
    root: process.cwd(),
    generatedAt: now(),
    voiceReadiness: buildVoiceRuntimeReadiness({ voiceAssets: status.voiceAssets ?? [], voiceAssetRoot: VOICE_ASSET_ROOT }),
    ollamaEndpoint: OLLAMA_URL,
  });
}

function agentManagerReadiness() {
  return buildAgentManagerReadiness({
    generatedAt: now(),
    status,
    workflows: store.listWorkflows(),
    workflowRuns: store.listWorkflowRuns(80),
    tasks: store.listTasks(),
    queue: store.listQueue(),
    approvals: status.pendingApprovals,
  });
}

function interactionHealth() {
  return buildInteractionHealth({
    generatedAt: now(),
    status,
    workflows: store.listWorkflows(),
    workflowRuns: store.listWorkflowRuns(80),
    tasks: store.listTasks(),
    queue: store.listQueue(),
    approvals: status.pendingApprovals,
    undoJournal: store.listUndoJournal(),
  });
}

async function runtimeSelfTest() {
  return buildRuntimeSelfTest({
    generatedAt: now(),
    activation: runtimeActivationReadiness(),
    manager: agentManagerReadiness(),
    interaction: interactionHealth(),
    packaging: buildPackagingReadiness({ root: process.cwd(), generatedAt: now() }),
    processVisibility: buildProcessVisibilityStatus({ generatedAt: now() }),
    startupPlans: buildStartupRegistrationPlans({ root: process.cwd(), generatedAt: now() }),
    services: await buildRuntimeServicesStatus(),
  });
}

function sendVoiceAsset(response: ServerResponse, fileName: string): void {
  const safeName = basename(fileName);
  const allowed = (status.voiceAssets ?? []).some((asset) => basename(asset.localPath) === safeName);
  const filePath = join(VOICE_ASSET_ROOT, safeName);
  if (!allowed || !existsSync(filePath)) {
    sendJson(response, 404, { error: "Voice asset not found", fileName: safeName });
    return;
  }

  const size = statSync(filePath).size;
  response.writeHead(200, {
    "access-control-allow-origin": "*",
    "content-type": safeName.toLowerCase().endsWith(".mp3") ? "audio/mpeg" : "application/octet-stream",
    "content-length": size,
    "cache-control": "private, max-age=3600",
  });
  createReadStream(filePath).pipe(response);
}

function readBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (raw.trim().length === 0) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function getEnabledConnectorIds(): string[] {
  return status.connectors.filter((connector) => connector.enabled).map((connector) => connector.id);
}

function now(): string {
  return new Date().toISOString();
}

function id(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readWorkflowLayouts(): Record<string, WorkflowCanvasLayout> {
  try {
    if (!existsSync(WORKFLOW_LAYOUT_PATH)) {
      return {};
    }
    return JSON.parse(readFileSync(WORKFLOW_LAYOUT_PATH, "utf8")) as Record<string, WorkflowCanvasLayout>;
  } catch {
    return {};
  }
}

function writeWorkflowLayout(layout: WorkflowCanvasLayout): void {
  const layouts = readWorkflowLayouts();
  mkdirSync(dirname(WORKFLOW_LAYOUT_PATH), { recursive: true });
  writeFileSync(WORKFLOW_LAYOUT_PATH, JSON.stringify({ ...layouts, [layout.workflowId]: layout }, null, 2), "utf8");
}

function applyWorkflowDraftEdit(workflow: WorkflowDefinition, edit: WorkflowDraftEdit): WorkflowDefinition {
  const editedSteps = workflow.steps.map((step) => {
    if (!edit.stepId || step.id !== edit.stepId) {
      return step;
    }
    return {
      ...step,
      title: edit.title?.trim() || step.title,
      summary: edit.summary?.trim() || step.summary,
      expectedInputs: edit.expectedInputs?.map((value) => value.trim()).filter(Boolean) ?? step.expectedInputs,
      expectedOutputs: edit.expectedOutputs?.map((value) => value.trim()).filter(Boolean) ?? step.expectedOutputs,
    };
  });
  return {
    ...workflow,
    name: edit.workflowName?.trim() || workflow.name,
    enabled: false,
    owner: workflow.owner === "jarvis" ? "generated" : workflow.owner,
    version: workflow.version + 1,
    steps: editedSteps,
    tags: [...new Set([...workflow.tags, "draft-edit", "approval-required"])],
  };
}

function estimateTokens(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4));
}

function statusWithRuntimeState(): JarvisStatus {
  const hydratedReadyAssets = hydrateReadyModelAssets(existsSync);
  const hydratedModels = status.models.map(hydrateModelState);
  return {
    ...status,
    models: hydratedModels,
    readyModelAssets: hydratedReadyAssets,
    neededFeatureDownloads: hydrateFeatureDownloads(),
    futureScalingModels,
    modelReadiness: hydratedModels.map((model) => readinessForModel(model, existsSync, hydratedReadyAssets)),
    audioEngines: (status.audioEngines ?? []).map(hydrateAudioEngineState),
    voiceAssets: (status.voiceAssets ?? []).filter((asset) => existsSync(`C:\\Users\\user\\Downloads\\Secretary Jarvis\\jarvis\\${asset.localPath}`)),
    identityReadiness: buildIdentityReadiness(),
    startup: hydrateStartupState(),
    conversations: store.listConversations(),
    tasks: store.listTasks(),
    queue: store.listQueue(),
    mobilePairings,
    socialDrafts,
    undoJournal: store.listUndoJournal(),
    toolStatuses: status.toolStatuses ?? [],
    reports: buildReports(),
    mapOverlays: status.mapOverlays ?? [],
    visionInsights: status.visionInsights ?? [],
    devices: hydrateDevices(),
    performance: buildPerformanceSnapshot(),
  };
}

function compactStatusWithRuntimeState(): JarvisStatus {
  const full = statusWithRuntimeState();
  const allTasks = full.tasks ?? [];
  const allQueue = full.queue ?? [];
  const activeTasks = allTasks.filter((task) => task.status === "running" || task.status === "queued" || task.status === "waiting-approval");
  const recentTasks = allTasks.slice(-8);
  const taskMap = new Map([...activeTasks, ...recentTasks].map((task) => [task.id, task]));
  const tasks = [...taskMap.values()].slice(-12);
  const taskIds = new Set(tasks.map((task) => task.id));

  return {
    ...full,
    conversations: (full.conversations ?? []).slice(-5),
    tasks,
    queue: allQueue.filter((item) => taskIds.has(item.taskId)).slice(-12),
    undoJournal: (full.undoJournal ?? []).filter((entry) => entry.status === "available").slice(-6),
    socialDrafts: (full.socialDrafts ?? []).slice(-6),
    memories: full.memories.slice(-6),
    mapOverlays: (full.mapOverlays ?? []).slice(0, 3),
    visionInsights: (full.visionInsights ?? []).slice(-4),
  };
}

function compactStreamStatus(): Record<string, unknown> {
  const next = compactStatusWithRuntimeState();
  const tasks = next.tasks ?? [];
  return {
    privacyMode: next.privacyMode,
    activeModelId: next.activeModelId,
    activeModel: next.models.find((model) => model.id === next.activeModelId)?.label ?? "Local model",
    runningTasks: tasks.filter((task) => task.status === "running").length,
    queuedTasks: tasks.filter((task) => task.status === "queued").length,
    pendingApprovals: next.pendingApprovals.length,
    startupMode: next.startup?.mode ?? "unknown",
    updatedAt: now(),
  };
}

function localModelAssetManifests() {
  const hydratedReadyAssets = hydrateReadyModelAssets(existsSync);
  return {
    ready: hydratedReadyAssets.map(inspectReadyModelAsset),
    futureScaling: futureScalingModels.map(inspectFutureScalingModel),
  };
}

function voiceRuntimeReadiness() {
  return buildVoiceRuntimeReadiness({
    voiceAssets: status.voiceAssets ?? [],
    voiceAssetRoot: VOICE_ASSET_ROOT,
    hfSnapshotRoot: HF_SNAPSHOT_ROOT,
  });
}

function visionRuntimeReadiness() {
  return buildVisionRuntimeReadiness({
    hfSnapshotRoot: HF_SNAPSHOT_ROOT,
    screenEnabled: status.connectors.some((connector) => connector.id === "screen" && connector.enabled),
    cameraEnabled: status.connectors.some((connector) => connector.id === "camera" && connector.enabled),
  });
}

function unifiedReadiness(): UnifiedReadinessItem[] {
  const manifests = localModelAssetManifests();
  const voice = voiceRuntimeReadiness();
  const vision = visionRuntimeReadiness();
  const modelItems: UnifiedReadinessItem[] = [...manifests.ready, ...manifests.futureScaling].map((manifest) => {
    const state =
      manifest.catalog === "future-scaling"
        ? "Future scaling"
        : manifest.integrity === "complete" && manifest.modelRef.toLowerCase().includes("whisper") && voice.primaryStt.status === "ready"
          ? "Runnable"
          : manifest.integrity === "complete"
            ? "Downloaded"
            : manifest.integrity === "missing"
              ? "Needs install"
              : "Incomplete";
    return {
      id: manifest.id,
      category: "models",
      label: manifest.label,
      state,
      detail: manifest.partialReasons?.length ? manifest.partialReasons.join(", ") : manifest.runtimeRecommendation ?? manifest.notes[0] ?? "Local model asset inspected.",
      expectedPath: manifest.localPath,
      actionHint: manifest.runtimeRecommendation ?? "Probe a local endpoint before loading raw Hugging Face weights.",
    };
  });
  const voiceItems: UnifiedReadinessItem[] = [
    {
      id: "voice-stt-primary",
      category: "voice",
      label: voice.primaryStt.label,
      state: voice.primaryStt.status === "ready" ? "Runnable" : voice.primaryStt.status === "ready-asset" ? "Downloaded" : "Needs install",
      detail: voice.primaryStt.notes[0] ?? "Primary STT path.",
      expectedPath: HF_SNAPSHOT_ROOT,
      actionHint: "Use Whisper for STT; keep chat/coding routed through endpoint-first text models.",
    },
    {
      id: "voice-tts-local",
      category: "voice",
      label: "Local TTS",
      state: voice.summary.ttsReady ? "Runnable" : "Needs install",
      detail: `${voice.tts.map((engine) => `${engine.label}: ${engine.status}`).join(" / ")}. Preferred: ${voice.ttsPreferredEngine}.`,
      expectedPath: "C:/Users/user/Downloads/Secretary Jarvis/models/huggingface/snapshots/hexgrad__Kokoro-82M",
      actionHint: "SAPI and samples work now; Kokoro becomes preferred neural TTS after install/probe, with Piper still supported.",
    },
    {
      id: "voice-wake-word",
      category: "voice",
      label: "Wake word",
      state: voice.wakeState === "wake-ready" || voice.wakeState === "wake-armed" ? "Needs approval" : voice.wakeState === "blocked" ? "Needs install" : "Needs approval",
      detail: voice.wakeWord.notes[0] ?? "Wake-word capture stays approval-gated.",
      expectedPath: "C:/Users/user/Downloads/Secretary Jarvis/models/wake-word",
      actionHint: "Install Porcupine/Vosk wake profile, then approve continuous mic mode.",
    },
  ];
  const visionItems: UnifiedReadinessItem[] = [
    {
      id: "vision-runtime",
      category: "vision",
      label: "Vision/OCR",
      state: vision.summary.localVisionAssets > 0 ? "Downloaded" : "Needs install",
      detail: `${vision.summary.localVisionAssets} local assets / ${vision.summary.missingFeatureDependencies} missing / ${vision.summary.approvalGatedSensors} approval gated`,
      expectedPath: "C:/Users/user/Downloads/Secretary Jarvis/models/vision",
      actionHint: "Use selected-image analysis first; continuous screen/camera requires approval.",
    },
  ];
  const featureItems: UnifiedReadinessItem[] = hydrateFeatureDownloads().map((download) => ({
    id: download.id,
    category: download.category === "connector" ? "connectors" : download.category,
    label: download.label,
    state: download.status === "detected" ? "Downloaded" : download.status === "optional" ? "Needs install" : "Needs install",
    detail: download.purpose,
    expectedPath: download.expectedPath,
    actionHint: download.installHint,
  }));
  return [...modelItems, ...voiceItems, ...visionItems, ...featureItems];
}

function runtimeConstellation() {
  const manifests = localModelAssetManifests();
  return buildRuntimeConstellation({
    readyModels: manifests.ready,
    futureScalingModels: manifests.futureScaling,
    voice: voiceRuntimeReadiness(),
    vision: visionRuntimeReadiness(),
    neededFeatureDownloads: hydrateFeatureDownloads(),
    privacyMode: status.privacyMode,
    updatedAt: now(),
  });
}

function runtimeAttention() {
  return buildRuntimeAttention({
    generatedAt: now(),
    voice: voiceRuntimeReadiness(),
    modelManifests: localModelAssetManifests(),
    featureDownloads: hydrateFeatureDownloads(),
  });
}

function modelActivationPlans() {
  const runtimeStatus = statusWithRuntimeState();
  const assetManifests = localModelAssetManifests();
  return buildModelActivationPlans({
    models: runtimeStatus.models,
    readyAssets: runtimeStatus.readyModelAssets ?? [],
    manifests: assetManifests.ready,
    readiness: runtimeStatus.modelReadiness ?? [],
  });
}

function buildIdentityReadiness(): JarvisStatus["identityReadiness"] {
  const profiles = status.identityProfiles ?? [];
  const owner = profiles.find((profile) => profile.role === "owner") ?? profiles[0];
  const voiceAssets = (status.voiceAssets ?? []).filter((asset) => existsSync(`C:\\Users\\user\\Downloads\\Secretary Jarvis\\jarvis\\${asset.localPath}`));
  const cameraEnabled = status.connectors.some((connector) => connector.id === "camera" && connector.enabled);
  return {
    status: voiceAssets.length > 0 ? "staged" : "missing-dependency",
    ownerProfileId: owner?.id ?? "owner-primary",
    voiceVerification: {
      status: voiceAssets.length > 0 ? "staged" : "missing-dependency",
      sampleCount: voiceAssets.length,
      packages: [],
    },
    faceRecognition: {
      status: cameraEnabled ? "staged" : "requires-approval",
      cameraStatus: cameraEnabled ? "ready" : "locked",
      packages: [],
    },
    trustedDevices: ["asus-g14-rx6700s"],
    privacyLocks: ["camera", "continuous-microphone", "biometric-retention"],
    notes: [
      "Identity is local-only and opt-in.",
      "Recognition dry-runs emit HUD state without capturing biometric data.",
      "Speaker and face matching require local dependency setup before live use.",
    ],
  };
}

function buildSensorPrivacyLocks(): Array<Record<string, unknown>> {
  const cameraEnabled = status.connectors.some((connector) => connector.id === "camera" && connector.enabled);
  const screenEnabled = status.connectors.some((connector) => connector.id === "screen" && connector.enabled);
  return [
    {
      id: "screen-one-time",
      surface: "screen",
      state: screenEnabled ? "approval-required-ready" : "requires-approval",
      retention: "ask-each-time",
      capturing: false,
    },
    {
      id: "screen-continuous",
      surface: "screen",
      state: "locked",
      retention: "disabled",
      capturing: false,
    },
    {
      id: "camera-one-time",
      surface: "camera",
      state: cameraEnabled ? "approval-required-ready" : "requires-approval",
      retention: "ask-each-time",
      capturing: false,
    },
    {
      id: "camera-continuous",
      surface: "camera",
      state: "locked",
      retention: "disabled",
      capturing: false,
    },
    {
      id: "biometric-retention",
      surface: "identity",
      state: "locked",
      retention: "disabled-until-owner-approval",
      capturing: false,
    },
  ];
}

function hydrateStartupState(): JarvisStatus["startup"] {
  const startupShortcuts = [
    `${process.env.APPDATA ?? ""}\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\Secretary Jarvis Local Runtime.lnk`,
    `${process.env.USERPROFILE ?? ""}\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\Secretary Jarvis Local Runtime.lnk`,
    "C:\\Users\\user\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\Secretary Jarvis Local Runtime.lnk",
  ];
  const registered = startupShortcuts.some((startupShortcut) => startupShortcut.length > 0 && existsSync(startupShortcut));
  return {
    mode: registered ? "startup-task-registered" : "startup-task-ready",
    scriptPath: "scripts/start-jarvis.ps1",
    backgroundServices: ["Ollama", "Python Brain", "TypeScript Gateway", "Electron HUD", "Dashboard/Tauri shell"],
    notes: registered
      ? ["Startup shortcut is registered for this Windows user.", "Services remain local-only at boot."]
      : [
          "Use scripts/register-startup-task.ps1 to create a Windows logon task or Startup shortcut.",
          "Startup launches local services only and keeps hosted inference disabled by default.",
        ],
  };
}

function hydrateFeatureDownloads(): NonNullable<JarvisStatus["neededFeatureDownloads"]> {
  return neededFeatureDownloads.map((download) => {
    const detected =
      download.expectedPath.includes("vault") || download.expectedPath.includes("data/maps")
        ? existsSync(download.expectedPath)
        : existsSync(download.expectedPath);
    return {
      ...download,
      status: detected ? "detected" : download.status,
    };
  });
}

function buildReports(): ReportSnapshot[] {
  const tasks = store.listTasks();
  const completed = tasks.filter((task) => task.status === "completed").length;
  const running = tasks.filter((task) => task.status === "running").length;
  const memoryWrites = store.listMemoryWrites(50).length;
  const baseReports = status.reports ?? [];

  return baseReports.map((report) => {
    if (report.kind === "daily") {
      return {
        ...report,
        status: running > 0 ? "live" : report.status,
        metrics: [
          { label: "Running", value: String(running), trend: running > 0 ? "up" : "flat" },
          { label: "Completed", value: String(completed), trend: completed > 0 ? "up" : "flat" },
          { label: "Memories", value: String(status.memories.length + memoryWrites), trend: memoryWrites > 0 ? "up" : "flat" },
        ],
      };
    }

    if (report.kind === "performance") {
      const performance = buildPerformanceSnapshot();
      return {
        ...report,
        metrics: [
          { label: "TPS", value: performance.tokensPerSecond.toFixed(1), trend: "flat" },
          { label: "Context", value: `${Math.round(performance.contextWindow / 1000)}k`, trend: "flat" },
          { label: "Queue", value: `${performance.queueLatencyMs} ms`, trend: "flat" },
        ],
      };
    }

    return report;
  });
}

function hydrateDevices(): DeviceLink[] {
  const timestamp = now();
  return (status.devices ?? []).map((device) => {
    if (device.id === "device-laptop") {
      return { ...device, status: "online", lastSeen: timestamp };
    }

    return device;
  });
}

function buildPerformanceSnapshot(): PerformanceSnapshot {
  const queue = store.listQueue();
  const active = statusWithNoHydration().models.find((model) => model.id === status.activeModelId);
  const baseline = status.performance;
  const runningBoost = queue.some((item) => item.status === "running") ? 0.8 : 0;

  return {
    id: baseline?.id ?? "perf-runtime",
    tokensPerSecond: (baseline?.tokensPerSecond ?? 18) + runningBoost,
    contextWindow: active?.contextWindow ?? baseline?.contextWindow ?? 32768,
    queueLatencyMs: Math.max(80, (baseline?.queueLatencyMs ?? 120) - runningBoost * 10),
    memoryRecallMs: baseline?.memoryRecallMs ?? 35,
    activeModelId: status.activeModelId,
    updatedAt: now(),
    notes: baseline?.notes ?? "Runtime performance is inferred from the current local route until a live benchmark completes.",
  };
}

function statusWithNoHydration(): JarvisStatus {
  return status;
}

function createConversationFromPrompt(prompt: string, timestamp: string): Conversation {
  return {
    id: id("conversation"),
    title: prompt.slice(0, 72) || "New Jarvis conversation",
    createdAt: timestamp,
    updatedAt: timestamp,
    summary: "Live conversation. Long-term facts are promoted through MemoryOS writes.",
    tokenBudget: 32768,
  };
}

function createTaskForTurn(params: {
  conversationId: string;
  prompt: string;
  taskProfile: TaskProfile;
  timestamp: string;
}): TaskRun {
  return {
    id: id("task"),
    conversationId: params.conversationId,
    title: params.prompt.slice(0, 88) || "Jarvis task",
    status: "queued",
    activeAgentId: params.taskProfile === "coding" ? "planner" : "jarvis",
    taskProfile: params.taskProfile,
    createdAt: params.timestamp,
    updatedAt: params.timestamp,
  };
}

function addTurn(params: {
  conversationId: string;
  role: ConversationTurn["role"];
  content: string;
  timestamp: string;
  taskId?: string;
}): ConversationTurn {
  const turn: ConversationTurn = {
    id: id("turn"),
    conversationId: params.conversationId,
    role: params.role,
    content: params.content,
    createdAt: params.timestamp,
    taskId: params.taskId,
    tokenEstimate: estimateTokens(params.content),
  };
  store.addTurn(turn);
  return turn;
}

function recordMultimodalTimeline(params: {
  title: string;
  summary: string;
  timestamp: string;
  source?: TimelineEvent["source"];
  status?: TimelineEvent["status"];
  tags: string[];
  relatedConversationId?: string;
  relatedTaskId?: string;
}): TimelineEvent {
  const event: TimelineEvent = {
    id: id("timeline-multimodal"),
    kind: "sensor-event",
    title: params.title,
    summary: params.summary.slice(0, 260),
    occurredAt: params.timestamp,
    source: params.source ?? "system",
    reversible: false,
    relatedConversationId: params.relatedConversationId,
    relatedTaskId: params.relatedTaskId,
    status: params.status,
    tags: ["multimodal", ...params.tags],
  };
  store.addTimelineEvent(event);
  return event;
}

function queueChatMessage(params: {
  message: string;
  conversationId?: string;
  taskProfile?: TaskProfile;
  timestamp: string;
}): { conversation: Conversation; task: TaskRun; queued: ReturnType<typeof taskEvent> } {
  const conversation =
    (params.conversationId ? store.getConversation(params.conversationId) : undefined) ??
    createConversationFromPrompt(params.message, params.timestamp);
  store.upsertConversation({
    ...conversation,
    updatedAt: params.timestamp,
    title: conversation.title || params.message.slice(0, 72),
  });
  addTurn({
    conversationId: conversation.id,
    role: "user",
    content: params.message,
    timestamp: params.timestamp,
  });

  const task = createTaskForTurn({
    conversationId: conversation.id,
    prompt: params.message,
    taskProfile: params.taskProfile ?? "daily-assistant",
    timestamp: params.timestamp,
  });
  store.upsertTask(task);
  store.upsertQueueItem({
    taskId: task.id,
    status: "queued",
    priority: 10,
    enqueuedAt: params.timestamp,
  });
  const queued = taskEvent({
    id: id("task-event"),
    taskId: task.id,
    kind: "queued",
    message: "Task queued and ready for local execution.",
    createdAt: params.timestamp,
  });
  store.addTaskEvent(queued);
  events.publish("conversation", { conversation, task });
  events.publish("task", { task, event: queued });
  setTimeout(() => {
    void runAssistantTask(task, params.message);
  }, 0);
  return { conversation, task, queued };
}

async function waitForStoredTask(taskId: string, timeoutMs: number): Promise<TaskRun> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const task = store.getTask(taskId);
    if (task && ["completed", "failed", "cancelled"].includes(task.status)) {
      return task;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const task = store.getTask(taskId);
  if (task) {
    return task;
  }
  throw new Error(`Task ${taskId} was not found before the live-test timeout.`);
}

async function runAssistantTask(task: TaskRun, prompt: string): Promise<void> {
  const startedAt = now();
  const runningTask = applyTaskStatus(task, "running", startedAt);
  store.upsertTask(runningTask);
  store.upsertQueueItem({
    taskId: task.id,
    status: "running",
    priority: 10,
    enqueuedAt: task.createdAt,
    startedAt,
  });
  const started = taskEvent({
    id: id("task-event"),
    taskId: task.id,
    kind: "started",
    message: "Jarvis started processing the task.",
    createdAt: startedAt,
  });
  store.addTaskEvent(started);
  events.publish("task", { task: runningTask, event: started });

  let response = "";
  const protectedDecision = evaluateProtectedCorePrompt(prompt);
  if (protectedDecision.decision === "deny") {
    response = [
      "I cannot expose or modify protected Jarvis core internals from the runtime assistant path.",
      "I can still help through approved interfaces: skills, memory, reports, models, connectors, and owner-controlled setup.",
      protectedDecision.reasons[0],
    ].join(" ");
  } else {
    response = await callSelectedLocalModel(task, prompt).catch((error: unknown) =>
      fallbackAssistantResponse(prompt, error instanceof Error ? error.message : String(error)),
    );
  }

  const chunks = response.match(/.{1,42}(\s|$)/g) ?? [response];
  chunks.forEach((chunk, index) => {
    setTimeout(() => {
      events.publish("token", { taskId: task.id, content: chunk.trim(), index });
    }, 120 * (index + 1));
  });

  setTimeout(() => {
    const finishedAt = now();
    const latest = store.getTask(task.id);
    if (!latest || latest.status === "cancelled") {
      return;
    }

    const completed: TaskRun = {
      ...latest,
      status: "completed",
      updatedAt: finishedAt,
      checkpoint: `Completed local simulated run for prompt: ${prompt.slice(0, 140)}`,
      result: response,
    };
    store.upsertTask(completed);
    store.upsertQueueItem({
      taskId: task.id,
      status: "completed",
      priority: 10,
      enqueuedAt: task.createdAt,
      startedAt,
      finishedAt,
    });
    const completedEvent = taskEvent({
      id: id("task-event"),
      taskId: task.id,
      kind: "completed",
      message: "Jarvis completed the local task run and saved the conversation turn.",
      createdAt: finishedAt,
    });
    store.addTaskEvent(completedEvent);
    addTurn({
      conversationId: task.conversationId,
      role: "assistant",
      content: response,
      timestamp: finishedAt,
      taskId: task.id,
    });
    events.publish("task", { task: completed, event: completedEvent });
    events.publish("conversation", { conversationId: task.conversationId, taskId: task.id });
  }, 120 * (chunks.length + 3));
}

function evaluateProtectedCorePrompt(prompt: string): ReturnType<typeof evaluateActionPolicy> {
  const review = sentinelReviewPrompt({
    prompt,
    actionId: id("protected-core"),
    privacyMode: status.privacyMode,
    allowedConnectors: getEnabledConnectorIds(),
  });
  return review.decision;
}

async function callSelectedLocalModel(task: TaskRun, prompt: string): Promise<string> {
  const runtimeStatus = statusWithRuntimeState();
  const selected = runtimeStatus.models.find((model) => model.id === runtimeStatus.activeModelId) ?? runtimeStatus.models[0];
  if (!selected) {
    return fallbackAssistantResponse(prompt, "No local model is selected.");
  }

  if (selected.runtime !== "ollama") {
    const brainText = await callBrainHfLocalModel(selected.modelRef, prompt);
    return brainText ?? fallbackAssistantResponse(prompt, `Selected model ${selected.label} is not connected to an active local runtime yet.`);
  }

  if (selected.installState !== "installed") {
    const brainText = await callBrainHfLocalModel("Qwen/Qwen3.5-9B", prompt);
    return brainText ?? fallbackAssistantResponse(prompt, `Selected model ${selected.label} is not installed in Ollama.`);
  }

  const context = buildMemoryContext(task.conversationId);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    try {
      const response = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: selected.modelRef,
          stream: false,
          keep_alive: "10m",
          think: false,
          options: {
            temperature: 0.35,
            num_ctx: Math.min(selected.contextWindow ?? 8192, 8192),
            num_predict: 220,
          },
          messages: [
            {
              role: "system",
              content:
                "You are Jarvis, a local-first private secretary assistant. Be concise, capable, and proactive. Reply briefly by default. Use memory context only as helpful background. Ask approval for risky actions. Never reveal, inspect, or bypass protected core code, safeguards, secrets, model tensors, or private vault internals. /no_think",
            },
            {
              role: "system",
              content: context,
            },
            {
              role: "user",
              content: prompt,
            },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Ollama returned ${response.status}`);
      }

      const body = (await response.json()) as { message?: { content?: string }; response?: string };
      return (body.message?.content ?? body.response ?? "").trim() || fallbackAssistantResponse(prompt, "Ollama returned an empty response.");
    } catch (error) {
      const brainText = await callBrainHfLocalModel("Qwen/Qwen3.5-9B", prompt);
      if (brainText) {
        return brainText;
      }
      throw error;
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function callBrainHfLocalModel(modelRef: string, prompt: string): Promise<string | undefined> {
  const result = await brainJson<BrainHfGenerationResult>(
    "/models/hf/generate",
    {
      method: "POST",
      body: JSON.stringify({
        modelRef,
        prompt,
        allowLoad: false,
        maxNewTokens: 180,
      }),
    },
    15_000,
  );
  const text = result?.text?.trim();
  if (!text) {
    return undefined;
  }
  return text;
}

async function tryGenerateWorkflowWithOllama(params: {
  prompt: string;
  modelRef: string;
  label: string;
  idSuffix: string;
  owner: WorkflowDefinition["owner"];
}): Promise<{ workflow: WorkflowDefinition; note: string } | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: params.modelRef,
        stream: false,
        keep_alive: "5m",
        options: {
          temperature: 0.18,
          num_ctx: 8192,
        },
        messages: [
          {
            role: "system",
            content:
              "Return only JSON for a Jarvis WorkflowDefinition. Use local-first safety: risky system, send, post, delete, script, service, device, and sensor steps require approval. Set enabled false. Never include protected-core-access, credential-access, or purchase steps.",
          },
          {
            role: "user",
            content: `Create a compact WorkflowDefinition for: ${params.prompt}`,
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      return undefined;
    }
    const body = (await response.json()) as { message?: { content?: string }; response?: string };
    const raw = (body.message?.content ?? body.response ?? "").trim();
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    if (jsonStart < 0 || jsonEnd <= jsonStart) {
      return undefined;
    }
    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as WorkflowDefinition;
    const workflow: WorkflowDefinition = {
      ...parsed,
      id: parsed.id?.startsWith("workflow-") ? `${parsed.id}-${params.idSuffix}` : `workflow-generated-${params.idSuffix}`,
      owner: params.owner,
      enabled: false,
      version: Number.isFinite(parsed.version) ? parsed.version : 1,
      tags: Array.isArray(parsed.tags) ? ["generated", ...parsed.tags.filter((tag) => tag !== "generated").slice(0, 5)] : ["generated"],
    };
    const issues = validateWorkflowDefinition(workflow);
    if (issues.some((issue) => issue.severity === "error") || dryRunWorkflow(workflow).risk === "blocked") {
      return undefined;
    }
    return {
      workflow,
      note: `Draft generated by ${params.label} and held for owner review before saving.`,
    };
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

function buildMemoryContext(conversationId: string): string {
  const seedMemory = status.memories
    .slice(0, 8)
    .map((memory) => `- ${memory.title}: ${memory.summary}`)
    .join("\n");
  const durableMemory = store
    .listMemoryWrites(12)
    .map((memory) => `- ${memory.kind}: ${memory.content}`)
    .join("\n");
  const promotedMemory = store
    .listMemoryRecords(8)
    .map((memory) => `- ${memory.layer}/${memory.kind}: ${memory.title} (${memory.tags.join(", ")})`)
    .join("\n");
  const recentTurns = store
    .listTurns(conversationId)
    .slice(-8)
    .map((turn) => `${turn.role}: ${turn.content.slice(0, 500)}`)
    .join("\n");

  return [
    "MemoryOS context:",
    seedMemory || "- No seeded memory.",
    durableMemory ? `Durable writes:\n${durableMemory}` : "Durable writes: none yet.",
    promotedMemory ? `Promoted memory records:\n${promotedMemory}` : "Promoted memory records: none yet.",
    recentTurns ? `Recent conversation:\n${recentTurns}` : "Recent conversation: none.",
  ].join("\n");
}

function fallbackAssistantResponse(prompt: string, reason: string): string {
  return [
    "I saved this as a local, interruptible Jarvis task and kept it in memory.",
    `Current runtime note: ${reason}`,
    "The safe next action is available through the dashboard queue, model hub, voice panel, reports, maps, device controls, and guarded connector drafts.",
    `Captured request: ${prompt.slice(0, 220)}`,
  ].join(" ");
}

function hydrateModelState(model: JarvisStatus["models"][number]): JarvisStatus["models"][number] {
  if (model.source === "ollama-library") {
    const installed = ollamaModelInstalled(model.modelRef);
    return { ...model, installState: installed ? "installed" : model.installState };
  }

  if (model.artifact?.localPath) {
    const installed = existsSync(model.artifact.localPath);
    return { ...model, installState: installed ? "installed" : model.installState };
  }

  if (model.source === "huggingface") {
    const localDir = `${HF_SNAPSHOT_ROOT}\\${model.modelRef.replace("/", "__")}`;
    const installed = existsSync(localDir);
    return installed
      ? {
          ...model,
          installState: "installed",
          artifact: { ...model.artifact, source: "huggingface", localPath: localDir },
        }
      : model;
  }

  return model;
}

function hydrateAudioEngineState(engine: NonNullable<JarvisStatus["audioEngines"]>[number]): NonNullable<JarvisStatus["audioEngines"]>[number] {
  if (engine.id === "whisper-large-v3-turbo") {
    const installed = existsSync(`${HF_SNAPSHOT_ROOT}\\openai__whisper-large-v3-turbo`);
    return {
      ...engine,
      installed,
      status: installed ? "ready" : engine.status,
      notes: installed
        ? "Local Whisper large-v3-turbo snapshot is present. Python STT can use it without hosted inference."
        : engine.notes,
    };
  }

  return engine;
}

function ollamaModelInstalled(modelRef: string): boolean {
  const result = cachedOllamaList();
  return result.ok && result.output.toLowerCase().includes(modelRef.toLowerCase());
}

function cachedOllamaList(): { ok: boolean; output: string } {
  const nowMs = Date.now();
  if (ollamaListCache && nowMs - ollamaListCache.checkedAt < 30_000) {
    return ollamaListCache.result;
  }

  const result = commandVersion("ollama", ["list"]);
  ollamaListCache = { checkedAt: nowMs, result };
  return result;
}

function runtimeForSource(source: ModelSource): RuntimeKind {
  if (source === "huggingface") {
    return "huggingface-local";
  }
  if (source === "gguf-local") {
    return "llama-cpp";
  }
  if (source === "openai-compatible-lan") {
    return "lan-local";
  }
  if (source === "disabled-hosted") {
    return "huggingface-tgi";
  }
  return "ollama";
}

function sourceForModelRef(modelRef: string): ModelSource {
  const model = status.models.find((candidate) => candidate.modelRef === modelRef || candidate.id === modelRef);
  if (model?.source) {
    return model.source;
  }
  return modelRef.includes("/") ? "huggingface" : "ollama-library";
}

function createDryRunResponse(modelRef: string, source?: ModelSource): {
  dryRun: ModelDryRunResult;
  decision: ReturnType<typeof evaluateActionPolicy>;
} {
  const resolvedSource = source ?? sourceForModelRef(modelRef);
  const dryRun = createModelDryRun({
    id: id("model-dry-run"),
    modelRef,
    source: resolvedSource,
    runtime: runtimeForSource(resolvedSource),
    connectorId: resolvedSource === "huggingface" ? "huggingface-local" : "ollama",
  });
  const decision = evaluateActionPolicy({
    action: dryRun.approvalAction,
    privacyMode: status.privacyMode,
    allowedConnectors: getEnabledConnectorIds(),
  });
  return { dryRun, decision };
}

function createMobilePairing(baseUrl: string, deviceName?: string): MobilePairing {
  const token = randomBytes(12).toString("hex");
  const createdAt = now();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  return {
    id: id("mobile-pairing"),
    tokenPreview: `${token.slice(0, 6)}...${token.slice(-4)}`,
    baseUrl,
    status: "pending",
    createdAt,
    expiresAt,
    deviceName,
  };
}

function createSystemAction(params: {
  label: string;
  command: string;
  target: string;
  category?: ActionRequest["category"];
}): SystemAction {
  const timestamp = now();
  const actionId = id("system-action");
  const category = params.category ?? classifySystemCommand(params.command);
  const reversible = isReversibleSystemCommand(category, params.command);
  const expiresAt = new Date(Date.now() + 20 * 60 * 1000).toISOString();
  const actionRequest: ActionRequest = {
    id: actionId,
    title: params.label,
    category,
    target: params.target,
    reason: `Approved-admin dry-run for local system action: ${params.command}`,
    connectorId: "filesystem",
    agentId: "vulcan",
    dataTouched: [params.target, "local laptop state", reversible ? "undo checkpoint" : "non-reversible action"],
  };
  const review = sentinelReviewAction({
    action: actionRequest,
    privacyMode: status.privacyMode,
    allowedConnectors: getEnabledConnectorIds(),
    prompt: params.command,
    createdAt: timestamp,
  });
  const decision = review.decision;

  return createSystemActionDraft({
    id: actionId,
    label: params.label,
    category,
    command: params.command,
    target: params.target,
    createdAt: timestamp,
    expiresAt,
    actionRequest,
    decision,
  });
}

function createUndoEntry(action: SystemAction): UndoJournalEntry {
  const base = createUndoJournalEntry({
    id: id("undo"),
    action,
    createdAt: now(),
    ttlMinutes: 20,
  });
  return attachFileCheckpoint(base);
}

async function executeSystemActionThroughBrain(systemAction: SystemAction): Promise<BrainSystemExecutionResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${BRAIN_URL}/system/actions/execute`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        approved: true,
        systemAction,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        status: "failed",
        executed: false,
        actionId: systemAction.id,
        category: systemAction.category,
        message: `Python Brain executor returned HTTP ${response.status}.`,
        localOnly: true,
      };
    }

    const body = (await response.json()) as BrainSystemExecutionResult;
    return {
      ...body,
      status: body.status ?? "failed",
      executed: Boolean(body.executed),
      message: body.message ?? "Python Brain returned no execution message.",
      localOnly: body.localOnly ?? true,
    };
  } catch (error) {
    return {
      status: "failed",
      executed: false,
      actionId: systemAction.id,
      category: systemAction.category,
      message: `Python Brain executor is unavailable: ${error instanceof Error ? error.message : String(error)}.`,
      localOnly: true,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function attachFileCheckpoint(entry: UndoJournalEntry): UndoJournalEntry {
  if (!entry.reversible || entry.operation.restoreStrategy === "none") {
    return {
      ...entry,
      snapshot: { kind: "none", capturedAt: entry.createdAt },
    };
  }

  if (!isAbsolute(entry.target) || !existsSync(entry.target)) {
    return {
      ...entry,
      snapshotSummary: `${entry.snapshotSummary} Target did not exist as a local file at checkpoint time.`,
      snapshot: { kind: "state-marker", path: entry.target, capturedAt: entry.createdAt },
    };
  }

  const stats = statSync(entry.target);
  if (!stats.isFile() || stats.size > 2 * 1024 * 1024) {
    return {
      ...entry,
      snapshotSummary: `${entry.snapshotSummary} Target is ${stats.isDirectory() ? "a directory" : "larger than 2 MB"}, so Jarvis kept a state marker.`,
      snapshot: {
        kind: "state-marker",
        path: entry.target,
        sizeBytes: stats.size,
        modifiedAt: stats.mtime.toISOString(),
        capturedAt: entry.createdAt,
      },
    };
  }

  const content = readFileSync(entry.target);
  const sha256 = createHash("sha256").update(content).digest("hex");
  return {
    ...entry,
    snapshotSummary: `File checkpoint captured for ${entry.target} (${stats.size} bytes). Undo can restore the exact previous content for 20 minutes.`,
    snapshot: {
      kind: "file-content",
      path: entry.target,
      sizeBytes: stats.size,
      modifiedAt: stats.mtime.toISOString(),
      sha256,
      contentBase64: content.toString("base64"),
      capturedAt: entry.createdAt,
    },
  };
}

function restoreUndoCheckpoint(entry: UndoJournalEntry): { restored: boolean; message: string } {
  if (entry.snapshot?.kind !== "file-content" || !entry.snapshot.path || !entry.snapshot.contentBase64) {
    return {
      restored: false,
      message: "Undo restored the Jarvis state marker. No file content snapshot was attached to this checkpoint.",
    };
  }
  mkdirSync(dirname(entry.snapshot.path), { recursive: true });
  writeFileSync(entry.snapshot.path, Buffer.from(entry.snapshot.contentBase64, "base64"));
  return {
    restored: true,
    message: `Restored ${entry.snapshot.path} to its checkpointed content.`,
  };
}

async function brainJson<T>(path: string, init?: RequestInit, timeoutMs = 3500): Promise<T | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${BRAIN_URL}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init?.headers ?? {}),
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      return undefined;
    }
    return (await response.json()) as T;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

function recordPendingApproval(action: ActionRequest): ActionRequest {
  if (permissionStore.isRememberedGrant(action)) {
    applyApprovalSideEffects(action, "approved");
    const memoryWrite: MemoryWrite = {
      id: id("memory"),
      kind: "decision",
      content: `Remembered approval grant used: ${action.title}. Target: ${action.target}.`,
      importance: 0.72,
      createdAt: now(),
      tags: ["approval", "remembered", action.category],
    };
    store.addMemoryWrite(memoryWrite);
    events.publish("approval", {
      approval: action,
      outcome: "remembered-grant",
      permission: permissionStore.recordForAction(action),
      memoryWrite,
    });
    events.publish("memory", { memoryWrite });
    return action;
  }
  const existing = status.pendingApprovals.find((approval) => approval.id === action.id);
  if (!existing) {
    status = {
      ...status,
      pendingApprovals: [action, ...status.pendingApprovals].slice(0, 30),
    };
  }
  return existing ?? action;
}

function applyApprovalSideEffects(approval: ActionRequest, outcome: "approved" | "denied"): void {
  if (outcome !== "approved") {
    return;
  }

  if (approval.connectorId) {
    status = {
      ...status,
      connectors: status.connectors.map((connector) =>
        connector.id === approval.connectorId ? { ...connector, enabled: true } : connector,
      ),
    };
  }

  if (/screen/i.test(approval.target)) {
    status = {
      ...status,
      connectors: status.connectors.map((connector) =>
        connector.id === "screen" ? { ...connector, enabled: true } : connector,
      ),
      devices: (status.devices ?? []).map((device) =>
        device.id === "device-camera" || device.id === "device-mic"
          ? device
          : /screen|vscode/i.test(device.name)
            ? { ...device, status: "online", approvalRequired: false }
            : device,
      ),
    };
  }

  if (/camera/i.test(approval.target)) {
    status = {
      ...status,
      connectors: status.connectors.map((connector) =>
        connector.id === "camera" ? { ...connector, enabled: true } : connector,
      ),
      devices: (status.devices ?? []).map((device) =>
        device.id === "device-camera" ? { ...device, status: "online", approvalRequired: false } : device,
      ),
    };
  }
}

function completeApproval(approvalId: string, outcome: "approved" | "denied"): {
  approval?: ActionRequest;
  memoryWrite?: MemoryWrite;
  permissionRecord?: PermissionRecord;
  workflowRun?: WorkflowRun;
  workflowRunEvent?: WorkflowRunEvent;
} {
  const approval = status.pendingApprovals.find((candidate) => candidate.id === approvalId);
  if (!approval) {
    return {};
  }

  const timestamp = now();
  status = {
    ...status,
    pendingApprovals: status.pendingApprovals.filter((candidate) => candidate.id !== approvalId),
  };
  applyApprovalSideEffects(approval, outcome);

  const memoryWrite: MemoryWrite = {
    id: id("memory"),
    kind: "decision",
    content: `Approval ${outcome}: ${approval.title}. Target: ${approval.target}.`,
    importance: outcome === "approved" ? 0.8 : 0.64,
    createdAt: timestamp,
    tags: ["approval", outcome, approval.category],
  };
  store.addMemoryWrite(memoryWrite);
  const permissionRecord = permissionStore.rememberDecision(approval, outcome === "approved" ? "granted" : "denied", timestamp);
  const workflowResult =
    approval.connectorId === "workflow-engine" ? completeWorkflowApproval(approval, outcome, timestamp) : {};
  return { approval, memoryWrite, permissionRecord, ...workflowResult };
}

function completeWorkflowApproval(
  approval: ActionRequest,
  outcome: "approved" | "denied",
  timestamp: string,
): { workflowRun?: WorkflowRun; workflowRunEvent?: WorkflowRunEvent } {
  const existingRun = store.getWorkflowRun(approval.id);
  if (!existingRun) {
    return {};
  }
  const workflowRun: WorkflowRun = {
    ...existingRun,
    status: outcome === "approved" ? "queued" : "cancelled",
    updatedAt: timestamp,
    result: outcome === "denied" ? "Workflow approval denied by owner." : existingRun.result,
  };
  store.upsertWorkflowRun(workflowRun);
  const workflowRunEvent = createWorkflowRunEvent({
    id: id("workflow-event"),
    workflowRunId: workflowRun.id,
    workflowId: workflowRun.workflowId,
    kind: outcome === "approved" ? "queued" : "cancelled",
    message:
      outcome === "approved"
        ? `Workflow ${approval.target} approved and queued for local execution.`
        : `Workflow ${approval.target} cancelled after owner denied approval.`,
    stepId: workflowRun.currentStepId,
    createdAt: timestamp,
    payload: { approvalId: approval.id, outcome },
  });
  store.addWorkflowRunEvent(workflowRunEvent);
  return { workflowRun, workflowRunEvent };
}

function addWorkflowEvent(params: {
  workflowRunId: string;
  workflowId: string;
  kind: WorkflowRunEvent["kind"];
  message: string;
  stepId?: string;
  payload?: Record<string, unknown>;
}): WorkflowRunEvent {
  const event = createWorkflowRunEvent({
    id: id("workflow-event"),
    workflowRunId: params.workflowRunId,
    workflowId: params.workflowId,
    kind: params.kind,
    message: params.message,
    stepId: params.stepId,
    createdAt: now(),
    payload: params.payload,
  });
  store.addWorkflowRunEvent(event);
  events.publish("task", { kind: "workflow-event", workflowRunEvent: event });
  return event;
}

async function executeWorkflowRun(workflow: WorkflowDefinition, run: WorkflowRun): Promise<{
  run: WorkflowRun;
  events: WorkflowRunEvent[];
}> {
  const emitted: WorkflowRunEvent[] = [];
  let currentRun: WorkflowRun = { ...run, status: "running", updatedAt: now(), currentStepId: run.currentStepId ?? workflow.steps[0]?.id };
  store.upsertWorkflowRun(currentRun);
  emitted.push(addWorkflowEvent({ workflowRunId: run.id, workflowId: workflow.id, kind: "started", message: `Workflow ${workflow.name} started.` }));

  for (const step of workflow.steps) {
    currentRun = { ...currentRun, currentStepId: step.id, updatedAt: now() };
    store.upsertWorkflowRun(currentRun);
    emitted.push(
      addWorkflowEvent({
        workflowRunId: run.id,
        workflowId: workflow.id,
        kind: "step-started",
        message: step.title,
        stepId: step.id,
      }),
    );

    const result = await executeWorkflowStep(workflow, currentRun, step);
    if (!result.ok) {
      const failedRun: WorkflowRun = { ...currentRun, status: "failed", result: result.message, updatedAt: now() };
      store.upsertWorkflowRun(failedRun);
      emitted.push(
        addWorkflowEvent({
          workflowRunId: run.id,
          workflowId: workflow.id,
          kind: "failed",
          message: result.message,
          stepId: step.id,
          payload: result.payload,
        }),
      );
      return { run: failedRun, events: emitted };
    }

    emitted.push(
      addWorkflowEvent({
        workflowRunId: run.id,
        workflowId: workflow.id,
        kind: "step-completed",
        message: result.message,
        stepId: step.id,
        payload: result.payload,
      }),
    );
  }

  const completedRun: WorkflowRun = {
    ...currentRun,
    status: "completed",
    currentStepId: workflow.steps.at(-1)?.id,
    result: `Workflow ${workflow.name} completed through the local native executor.`,
    updatedAt: now(),
  };
  store.upsertWorkflowRun(completedRun);
  emitted.push(
    addWorkflowEvent({
      workflowRunId: run.id,
      workflowId: workflow.id,
      kind: "completed",
      message: completedRun.result ?? "Workflow completed.",
    }),
  );
  return { run: completedRun, events: emitted };
}

async function executeWorkflowStep(
  workflow: WorkflowDefinition,
  run: WorkflowRun,
  step: WorkflowStep,
): Promise<{ ok: boolean; message: string; payload?: Record<string, unknown> }> {
  const dryStep = dryRunWorkflow(workflow).steps.find((candidate) => candidate.stepId === step.id);
  if (dryStep?.decision === "deny") {
    return { ok: false, message: `Blocked workflow step: ${step.title}.`, payload: { dryStep } };
  }

  if (step.kind === "agent") {
    return runWorkflowAgentStep(workflow, run, step);
  }

  if (step.kind === "approval") {
    return {
      ok: true,
      message: `Approval checkpoint satisfied: ${step.title}.`,
      payload: { approvalRequired: true, previouslyApproved: true },
    };
  }

  if (step.kind === "memory-write") {
    const memoryWrite: MemoryWrite = {
      id: id("memory"),
      kind: "timeline",
      content: `Workflow ${workflow.name} recorded step: ${step.title}.`,
      importance: 0.58,
      createdAt: now(),
      tags: ["workflow", workflow.id, step.id],
    };
    store.addMemoryWrite(memoryWrite);
    return { ok: true, message: `MemoryOS recorded ${step.title}.`, payload: { memoryWrite } };
  }

  if (step.kind === "sub-workflow") {
    return queueWorkflowSubRun(run, step);
  }

  return executeWorkflowNativeStep(run, step);
}

function queueWorkflowSubRun(
  parentRun: WorkflowRun,
  step: WorkflowStep,
): { ok: boolean; message: string; payload?: Record<string, unknown> } {
  if (!step.subWorkflowId) {
    return { ok: false, message: `Sub-workflow step has no target: ${step.title}.` };
  }
  const childWorkflow = store.getWorkflow(step.subWorkflowId);
  if (!childWorkflow) {
    return { ok: false, message: `Sub-workflow not found: ${step.subWorkflowId}.` };
  }

  const timestamp = now();
  const dryRun = dryRunWorkflow(childWorkflow);
  const childRun = createWorkflowRun({
    id: id("workflow-run"),
    workflowId: childWorkflow.id,
    input: {
      parentRunId: parentRun.id,
      parentStepId: step.id,
      source: "workflow-manager",
    },
    status: dryRun.approvalStepIds.length > 0 ? "waiting-approval" : "queued",
    currentStepId: childWorkflow.steps[0]?.id,
    createdAt: timestamp,
  });
  store.upsertWorkflowRun(childRun);
  const childEvent = createWorkflowRunEvent({
    id: id("workflow-event"),
    workflowRunId: childRun.id,
    workflowId: childWorkflow.id,
    kind: dryRun.approvalStepIds.length > 0 ? "approval-requested" : "queued",
    message:
      dryRun.approvalStepIds.length > 0
        ? `Sub-workflow ${childWorkflow.name} is waiting for owner approval.`
        : `Sub-workflow ${childWorkflow.name} queued by workflow manager.`,
    stepId: childWorkflow.steps[0]?.id,
    createdAt: timestamp,
    payload: { parentRunId: parentRun.id, parentStepId: step.id, dryRun },
  });
  store.addWorkflowRunEvent(childEvent);
  if (dryRun.approvalStepIds.length > 0) {
    const approval: ActionRequest = {
      id: childRun.id,
      title: `Approve sub-workflow: ${childWorkflow.name}`,
      category: childWorkflow.steps.find((candidate) => dryRun.approvalStepIds.includes(candidate.id))?.actionCategory ?? "run-script",
      target: childWorkflow.name,
      reason: "A parent workflow queued this approval-gated specialist workflow.",
      connectorId: "workflow-engine",
      agentId: "sentinel",
      dataTouched: ["workflow definition", "workflow run input", "approval-gated steps"],
    };
    recordPendingApproval(approval);
  }
  events.publish("task", { kind: "sub-workflow-queued", childWorkflow, childRun, childEvent });
  return {
    ok: true,
    message: `Queued sub-workflow ${childWorkflow.name} as ${childRun.status}.`,
    payload: { childWorkflowId: childWorkflow.id, childRun, childEvent },
  };
}

async function runWorkflowAgentStep(
  workflow: WorkflowDefinition,
  run: WorkflowRun,
  step: WorkflowStep,
): Promise<{ ok: boolean; message: string; payload?: Record<string, unknown> }> {
  const runtimeStatus = statusWithRuntimeState();
  const selected = selectModelForTask({
    taskProfile: step.taskProfile ?? workflow.taskProfile,
    scaleProfile: status.scaleProfile,
    models: runtimeStatus.models,
    readiness: runtimeStatus.modelReadiness,
  });
  if (!selected || selected.runtime !== "ollama" || selected.installState !== "installed") {
    return {
      ok: true,
      message: `${step.agentId ?? "agent"} completed ${step.title} with local fallback planning.`,
      payload: { modelRef: selected?.modelRef, fallback: true },
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: selected.modelRef,
        stream: false,
        keep_alive: "5m",
        options: { temperature: 0.25, num_ctx: Math.min(selected.contextWindow ?? 8192, 8192) },
        messages: [
          { role: "system", content: "You are a Jarvis workflow agent. Return one concise execution note. Do not expose protected internals." },
          { role: "user", content: `Workflow: ${workflow.name}\nStep: ${step.title}\nSummary: ${step.summary}\nInput: ${JSON.stringify(run.input)}` },
        ],
      }),
      signal: controller.signal,
    });
    const body = response.ok ? ((await response.json()) as { message?: { content?: string }; response?: string }) : {};
    const text = (body.message?.content ?? body.response ?? "").trim();
    return {
      ok: true,
      message: text || `${step.agentId ?? "agent"} completed ${step.title}.`,
      payload: { modelRef: selected.modelRef },
    };
  } catch (error) {
    return {
      ok: true,
      message: `${step.agentId ?? "agent"} completed ${step.title} with local fallback after model timeout.`,
      payload: { modelRef: selected.modelRef, fallback: true, error: error instanceof Error ? error.message : String(error) },
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function executeWorkflowNativeStep(
  run: WorkflowRun,
  step: WorkflowStep,
): Promise<{ ok: boolean; message: string; payload?: Record<string, unknown> }> {
  const command = typeof run.input.command === "string" ? run.input.command.trim() : "";
  if (!command || step.actionCategory === "read-local") {
    return {
      ok: true,
      message: command
        ? `Native read step inspected approved input for ${step.title}.`
        : `Native step staged: ${step.title}. Add an explicit approved command in run input to execute.`,
      payload: { actionCategory: step.actionCategory, executed: false },
    };
  }

  const systemAction = createSystemAction({
    label: `Workflow step: ${step.title}`,
    command,
    target: String(run.input.target ?? "local laptop"),
    category: step.actionCategory,
  });
  if (systemAction.decision.decision === "deny") {
    return {
      ok: false,
      message: `Sentinel blocked native workflow step: ${step.title}.`,
      payload: { systemAction },
    };
  }

  const execution = await executeSystemActionThroughBrain(systemAction);
  return {
    ok: execution.status !== "blocked",
    message: `Native step ${step.title}: ${execution.message}`,
    payload: { systemAction, execution },
  };
}

function cancelActiveTasks(reason: string): { cancelled: TaskRun[]; eventCount: number } {
  const timestamp = now();
  const candidates = store
    .listTasks()
    .filter((task) => task.status === "queued" || task.status === "running" || task.status === "paused" || task.status === "waiting-approval");
  const cancelled: TaskRun[] = [];

  candidates.forEach((task) => {
    const next = {
      ...applyTaskStatus(task, "cancelled", timestamp),
      checkpoint: task.checkpoint ?? reason,
    };
    store.upsertTask(next);
    store.upsertQueueItem({
      taskId: next.id,
      status: "cancelled",
      priority: 0,
      enqueuedAt: task.createdAt,
      finishedAt: timestamp,
    });
    const event = taskEvent({
      id: id("task-event"),
      taskId: task.id,
      kind: "cancelled",
      message: reason,
      createdAt: timestamp,
    });
    store.addTaskEvent(event);
    events.publish("task", { task: next, event });
    cancelled.push(next);
  });

  return { cancelled, eventCount: cancelled.length };
}

function pauseActiveTasks(reason: string): { paused: TaskRun[]; eventCount: number } {
  const timestamp = now();
  const candidates = store.listTasks().filter((task) => task.status === "running");
  const paused: TaskRun[] = [];

  candidates.forEach((task) => {
    const next = {
      ...applyTaskStatus(task, "paused", timestamp),
      checkpoint: task.checkpoint ?? reason,
    };
    store.upsertTask(next);
    store.upsertQueueItem({
      taskId: next.id,
      status: "paused",
      priority: 1,
      enqueuedAt: task.createdAt,
      startedAt: task.createdAt,
    });
    const event = taskEvent({
      id: id("task-event"),
      taskId: task.id,
      kind: "checkpoint",
      message: reason,
      createdAt: timestamp,
    });
    store.addTaskEvent(event);
    events.publish("task", { task: next, event });
    paused.push(next);
  });

  return { paused, eventCount: paused.length };
}

async function routeRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method === "OPTIONS") {
    response.writeHead(204, JSON_HEADERS);
    response.end();
    return;
  }

  const url = new URL(request.url ?? "/", "http://localhost");

  if (request.method === "GET" && url.pathname === "/") {
    sendJson(response, 200, {
      ok: true,
      service: "jarvis-gateway",
      role: "local-api-events-memory-agents",
      localOnly: true,
      app: {
        primary: "Electron HUD",
        launcher: "Start Jarvis.cmd",
        control: "Jarvis.cmd",
      },
      endpoints: {
        status: "/api/status",
        events: "/api/events",
        chat: "/api/chat",
        selfTest: "/api/runtime/self-test",
      },
      message: "Jarvis Gateway is online. Use the Electron HUD or Jarvis.cmd control menu instead of this browser root.",
    });
    return;
  }

  if (request.method === "GET" && url.pathname.startsWith("/api/assets/voice/")) {
    const fileName = decodeURIComponent(url.pathname.slice("/api/assets/voice/".length));
    sendVoiceAsset(response, fileName);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/events") {
    events.addClient(response);
    events.publish("status", { status: compactStreamStatus() });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/status") {
    sendJson(response, 200, compactStatusWithRuntimeState());
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/readiness/unified") {
    const items = unifiedReadiness();
    sendJson(response, 200, {
      items,
      summary: {
        runnable: items.filter((item) => item.state === "Runnable").length,
        downloaded: items.filter((item) => item.state === "Downloaded").length,
        incomplete: items.filter((item) => item.state === "Incomplete").length,
        needsInstall: items.filter((item) => item.state === "Needs install").length,
        needsApproval: items.filter((item) => item.state === "Needs approval").length,
        futureScaling: items.filter((item) => item.state === "Future scaling").length,
      },
      note: "Unified readiness uses truthful states: Downloaded is not the same as Runnable.",
    });
    return;
  }

  if (
    tryHandleReadinessRoute({
      method: request.method,
      pathname: url.pathname,
      status,
      voiceAssetRoot: VOICE_ASSET_ROOT,
      root: process.cwd(),
      now,
      sendJson: (statusCode, body) => sendJson(response, statusCode, body),
    })
  ) {
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/settings") {
    sendJson(response, 200, {
      privacyMode: status.privacyMode,
      scaleProfile: status.scaleProfile,
      activeModelId: status.activeModelId,
      localOnly: status.privacyMode === "strict-local",
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/settings") {
    const body = (await readBody(request)) as {
      privacyMode?: PrivacyMode;
      scaleProfile?: ScaleProfile;
    };
    const privacyModes: PrivacyMode[] = ["strict-local", "local-hybrid-disabled", "trusted-lan"];
    const scaleProfiles: ScaleProfile[] = ["laptop", "workstation", "homelab"];
    status = {
      ...status,
      privacyMode: body.privacyMode && privacyModes.includes(body.privacyMode) ? body.privacyMode : status.privacyMode,
      scaleProfile: body.scaleProfile && scaleProfiles.includes(body.scaleProfile) ? body.scaleProfile : status.scaleProfile,
    };
    const memoryWrite: MemoryWrite = {
      id: id("memory"),
      kind: "decision",
      content: `Runtime settings updated: privacy=${status.privacyMode}, scale=${status.scaleProfile}.`,
      importance: 0.7,
      createdAt: now(),
      tags: ["settings", "runtime"],
    };
    store.addMemoryWrite(memoryWrite);
    events.publish("status", { status: statusWithRuntimeState() });
    events.publish("memory", { memoryWrite });
    sendJson(response, 200, {
      privacyMode: status.privacyMode,
      scaleProfile: status.scaleProfile,
      activeModelId: status.activeModelId,
      memoryWrite,
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/emergency-stop") {
    const body = (await readBody(request)) as { reason?: string };
    const reason = body.reason?.trim() || "Emergency stop requested by the owner.";
    const result = cancelActiveTasks(reason);
    status = {
      ...status,
      agents: status.agents.map((agent) => ({ ...agent, status: agent.id === "safety" ? "reviewing" : "idle" })),
    };
    const memoryWrite: MemoryWrite = {
      id: id("memory"),
      kind: "decision",
      content: `Emergency stop: ${reason}. Cancelled ${result.cancelled.length} active task(s).`,
      importance: 0.9,
      createdAt: now(),
      tags: ["emergency-stop", "safety"],
    };
    store.addMemoryWrite(memoryWrite);
    events.publish("security", { emergencyStop: true, reason, cancelled: result.cancelled.length });
    events.publish("memory", { memoryWrite });
    sendJson(response, 200, { ...result, memoryWrite });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/agents/pause") {
    const body = (await readBody(request)) as { reason?: string };
    const reason = body.reason?.trim() || "Pause requested by the owner.";
    const result = pauseActiveTasks(reason);
    status = {
      ...status,
      agents: status.agents.map((agent) => ({ ...agent, status: agent.id === "safety" ? "reviewing" : "idle" })),
    };
    const memoryWrite: MemoryWrite = {
      id: id("memory"),
      kind: "decision",
      content: `Agents paused: ${reason}. Checkpointed ${result.paused.length} active task(s).`,
      importance: 0.82,
      createdAt: now(),
      tags: ["pause", "checkpoint", "safety"],
    };
    store.addMemoryWrite(memoryWrite);
    events.publish("security", { pauseAgents: true, reason, paused: result.paused.length });
    events.publish("memory", { memoryWrite });
    events.publish("status", { status: statusWithRuntimeState() });
    sendJson(response, 200, { ...result, memoryWrite });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/approvals") {
    sendJson(response, 200, { approvals: status.pendingApprovals });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/permissions") {
    sendJson(response, 200, {
      permissions: permissionStore.snapshot(),
      note: "Permission memory is local, capability-scoped, and stored under the owner profile. Protected-core, credential, purchase, delete, and irreversible actions remain guarded.",
    });
    return;
  }

  if (request.method === "POST" && url.pathname.startsWith("/api/approvals/")) {
    const parts = url.pathname.split("/").filter(Boolean);
    const approvalId = parts[2];
    const action = parts[3];
    if (action !== "approve" && action !== "deny") {
      sendJson(response, 404, { error: "Unknown approval action", action });
      return;
    }
    const result = completeApproval(approvalId, action === "approve" ? "approved" : "denied");
    if (!result.approval) {
      sendJson(response, 404, { error: "Approval not found", approvalId });
      return;
    }
    events.publish("approval", {
      approval: result.approval,
      outcome: action,
      memoryWrite: result.memoryWrite,
      permissionRecord: result.permissionRecord,
      workflowRun: result.workflowRun,
      workflowRunEvent: result.workflowRunEvent,
    });
    events.publish("memory", { memoryWrite: result.memoryWrite });
    if (result.workflowRun && result.workflowRunEvent) {
      events.publish("task", {
        workflowRun: result.workflowRun,
        workflowRunEvent: result.workflowRunEvent,
        kind: "workflow-approval-completed",
      });
    }
    sendJson(response, 200, {
      approval: result.approval,
      outcome: action,
      memoryWrite: result.memoryWrite,
      permissionRecord: result.permissionRecord,
      workflowRun: result.workflowRun,
      workflowRunEvent: result.workflowRunEvent,
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/conversations") {
    sendJson(response, 200, {
      conversations: store.listConversations(),
      recentTurns: store.listRecentTurns(20),
    });
    return;
  }

  if (request.method === "GET" && url.pathname.startsWith("/api/conversations/")) {
    const conversationId = decodeURIComponent(url.pathname.replace("/api/conversations/", ""));
    const conversation = store.getConversation(conversationId);
    if (!conversation) {
      sendJson(response, 404, { error: "Conversation not found", conversationId });
      return;
    }
    sendJson(response, 200, {
      conversation,
      turns: store.listTurns(conversationId),
      tasks: store.listTasks().filter((task) => task.conversationId === conversationId),
    });
    return;
  }

  if (request.method === "POST" && url.pathname.startsWith("/api/conversations/")) {
    const conversationId = decodeURIComponent(url.pathname.replace("/api/conversations/", ""));
    const body = (await readBody(request)) as {
      title?: string;
      summary?: string;
      role?: ConversationTurn["role"];
      content?: string;
      taskId?: string;
      remember?: boolean;
      tags?: string[];
    };
    const timestamp = now();
    const content = body.content?.trim();
    if (!content) {
      sendJson(response, 400, { error: "content is required" });
      return;
    }
    const conversation =
      store.getConversation(conversationId) ??
      ({
        id: conversationId,
        title: body.title?.trim() || content.slice(0, 64),
        createdAt: timestamp,
        updatedAt: timestamp,
        summary: body.summary?.trim() || "Conversation created through the Jarvis conversation API.",
        tokenBudget: 32_000,
      } satisfies Conversation);
    store.upsertConversation({ ...conversation, updatedAt: timestamp, summary: body.summary?.trim() || conversation.summary });
    const turn: ConversationTurn = {
      id: id("turn"),
      conversationId,
      role: body.role ?? "user",
      content,
      createdAt: timestamp,
      taskId: body.taskId,
      tokenEstimate: estimateTokens(content),
    };
    store.addTurn(turn);
    const memoryWrite =
      body.remember === false
        ? undefined
        : ({
            id: id("memory"),
            conversationId,
            taskId: body.taskId,
            kind: "session",
            content,
            importance: body.role === "assistant" ? 0.52 : 0.62,
            createdAt: timestamp,
            tags: body.tags ?? ["conversation", body.role ?? "user"],
          } satisfies MemoryWrite);
    if (memoryWrite) {
      store.addMemoryWrite(memoryWrite);
      events.publish("memory", { memoryWrite });
    }
    events.publish("conversation", { conversationId, turn, memoryWrite });
    sendJson(response, 201, {
      conversation: store.getConversation(conversationId),
      turn,
      memoryWrite,
      turns: store.listTurns(conversationId),
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/tasks") {
    sendJson(response, 200, {
      tasks: store.listTasks(),
      queue: store.listQueue(),
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/workflows") {
    const workflows = store.listWorkflows();
    sendJson(response, 200, {
      workflows,
      runs: store.listWorkflowRuns(40),
      dryRuns: workflows.map((workflow) => dryRunWorkflow(workflow)),
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/workflows/studio") {
    const workflows = store.listWorkflows();
    sendJson(response, 200, {
      workflows,
      runs: store.listWorkflowRuns(40),
      dryRuns: workflows.map((workflow) => dryRunWorkflow(workflow)),
      layouts: readWorkflowLayouts(),
      palette: ["trigger", "agent", "condition", "memory", "connector", "system-action", "approval", "sub-workflow"],
      note: "Workflow Studio edits create disabled drafts until owner approval enables execution.",
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/workflows") {
    const body = (await readBody(request)) as { workflow?: WorkflowDefinition } & Partial<WorkflowDefinition>;
    const workflow = (body.workflow ?? body) as WorkflowDefinition;
    const issues = validateWorkflowDefinition(workflow);
    if (issues.some((issue) => issue.severity === "error")) {
      sendJson(response, 400, { error: "Workflow validation failed", issues });
      return;
    }

    store.upsertWorkflow(workflow, now());
    const dryRun = dryRunWorkflow(workflow);
    events.publish("task", { workflow, dryRun, kind: "workflow-saved" });
    sendJson(response, 201, { workflow, dryRun, issues });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/workflows/generate") {
    const body = (await readBody(request)) as { prompt?: string; owner?: WorkflowDefinition["owner"] };
    const prompt = (body.prompt ?? "").trim();
    if (!prompt) {
      sendJson(response, 400, { error: "prompt is required" });
      return;
    }

    const runtimeStatus = statusWithRuntimeState();
    const selected = selectModelForTask({
      taskProfile: "coding",
      scaleProfile: status.scaleProfile,
      models: runtimeStatus.models,
      readiness: runtimeStatus.modelReadiness,
    });
    const idSuffix = randomBytes(3).toString("hex");
    const owner = body.owner ?? "generated";
    const modelGenerated =
      selected?.runtime === "ollama" && selected.installState === "installed"
        ? await tryGenerateWorkflowWithOllama({
            prompt,
            modelRef: selected.modelRef,
            label: selected.label,
            idSuffix,
            owner,
          })
        : undefined;
    const workflow = modelGenerated?.workflow ?? draftWorkflowFromPrompt(prompt, idSuffix, owner);
    const issues = validateWorkflowDefinition(workflow);
    const dryRun = dryRunWorkflow(workflow);
    const note =
      modelGenerated?.note ??
      (selected?.installState === "installed"
        ? `Draft generated from local safety templates; ${selected.label} is selected for the eventual agent run.`
        : `Draft generated locally from policy templates; selected model ${selected?.label ?? "Qwen local"} is not currently hot-loaded.`);
    const result = {
      workflow,
      dryRun,
      issues,
      approvalRequired: true,
      saved: false,
      strategy: modelGenerated ? "local-model" : "deterministic-local",
      modelRef: selected?.modelRef,
      note,
    };
    events.publish("task", { kind: "workflow-generated", result });
    sendJson(response, 200, result);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/workflows/manager") {
    const runs = store.listWorkflowRuns(80);
    const workflows = store.listWorkflows();
    const activeRuns = runs.filter((run) => ["queued", "running", "waiting-approval"].includes(run.status)).slice(0, 12);
    const agentLoad = workflows
      .flatMap((workflow) => workflow.steps)
      .filter((step) => step.kind === "agent" && step.agentId)
      .reduce<Record<string, number>>((counts, step) => {
        counts[step.agentId!] = (counts[step.agentId!] ?? 0) + 1;
        return counts;
      }, {});
    sendJson(response, 200, {
      manager: "cto-orchestrator",
      ctoWorkflow: workflows.find((workflow) => workflow.id === "workflow-cto-orchestrator"),
      activeRuns,
      recentRuns: runs.slice(0, 12),
      agentLoad,
      note: "Workflow manager coordinates parent and child runs locally; approval-gated sub-workflows remain owner-gated.",
    });
    return;
  }

  if (url.pathname.startsWith("/api/workflows/")) {
    const parts = url.pathname.split("/").filter(Boolean);
    const workflowId = decodeURIComponent(parts[2] ?? "");
    const action = parts[3];
    const workflow = store.getWorkflow(workflowId);
    if (!workflow) {
      sendJson(response, 404, { error: "Workflow not found", workflowId });
      return;
    }

    if (request.method === "GET" && !action) {
      const runs = store.listWorkflowRuns(80).filter((run) => run.workflowId === workflowId);
      sendJson(response, 200, {
        workflow,
        dryRun: dryRunWorkflow(workflow),
        runs,
      });
      return;
    }

    if (request.method === "POST" && action === "dry-run") {
      const dryRun = dryRunWorkflow(workflow);
      events.publish("task", { workflowId, dryRun, kind: "workflow-dry-run" });
      sendJson(response, 200, { workflow, dryRun });
      return;
    }

    if (request.method === "POST" && action === "layout") {
      const body = (await readBody(request)) as Partial<WorkflowCanvasLayout>;
      const layout: WorkflowCanvasLayout = {
        workflowId,
        nodes: body.nodes ?? {},
        zoom: typeof body.zoom === "number" ? Math.min(1.6, Math.max(0.5, body.zoom)) : 1,
        updatedAt: now(),
      };
      writeWorkflowLayout(layout);
      events.publish("task", { workflowId, layout, kind: "workflow-layout-saved" });
      sendJson(response, 200, { workflow, layout, message: "Workflow canvas layout saved locally." });
      return;
    }

    if (request.method === "POST" && action === "draft-edit") {
      const body = (await readBody(request)) as WorkflowDraftEdit;
      const edited = applyWorkflowDraftEdit(workflow, { ...body, workflowId });
      const issues = validateWorkflowDefinition(edited);
      if (issues.some((issue) => issue.severity === "error")) {
        sendJson(response, 400, { error: "Workflow edit validation failed", issues });
        return;
      }
      store.upsertWorkflow(edited, now());
      const dryRun = dryRunWorkflow(edited);
      events.publish("task", { workflow: edited, dryRun, kind: "workflow-draft-edited" });
      sendJson(response, 200, {
        workflow: edited,
        dryRun,
        issues,
        message: "Draft edit saved locally and disabled until owner approval.",
      });
      return;
    }

    if (request.method === "GET" && action === "runs") {
      sendJson(response, 200, {
        workflowId,
        runs: store.listWorkflowRuns(120).filter((run) => run.workflowId === workflowId),
      });
      return;
    }

    if (request.method === "POST" && action === "runs" && parts[5] === "execute") {
      const runId = decodeURIComponent(parts[4] ?? "");
      const run = store.getWorkflowRun(runId);
      if (!run || run.workflowId !== workflowId) {
        sendJson(response, 404, { error: "Workflow run not found", workflowId, runId });
        return;
      }
      if (run.status === "waiting-approval") {
        sendJson(response, 409, {
          error: "Workflow run is waiting for approval",
          workflow,
          run,
          dryRun: dryRunWorkflow(workflow),
        });
        return;
      }
      if (run.status === "completed" || run.status === "cancelled") {
        sendJson(response, 409, { error: `Workflow run is already ${run.status}`, workflow, run });
        return;
      }
      const result = await executeWorkflowRun(workflow, run);
      events.publish("task", { kind: "workflow-executed", workflow, run: result.run, workflowEvents: result.events });
      sendJson(response, 200, { workflow, run: result.run, events: result.events });
      return;
    }

    if (request.method === "POST" && action === "runs") {
      const body = (await readBody(request)) as { input?: Record<string, unknown> };
      const dryRun = dryRunWorkflow(workflow);
      if (!dryRun.runnable) {
        sendJson(response, 409, {
          error: "Workflow is not runnable",
          workflow,
          dryRun,
        });
        return;
      }

      const timestamp = now();
      const firstStep = workflow.steps[0];
      const run = createWorkflowRun({
        id: id("workflow-run"),
        workflowId,
        input: body.input ?? {},
        status: dryRun.approvalStepIds.length > 0 ? "waiting-approval" : "queued",
        currentStepId: firstStep?.id,
        createdAt: timestamp,
      });
      store.upsertWorkflowRun(run);
      const event = createWorkflowRunEvent({
        id: id("workflow-event"),
        workflowRunId: run.id,
        workflowId,
        kind: dryRun.approvalStepIds.length > 0 ? "approval-requested" : "queued",
        message:
          dryRun.approvalStepIds.length > 0
            ? `Workflow ${workflow.name} is waiting for owner approval before execution.`
            : `Workflow ${workflow.name} queued for local execution.`,
        stepId: firstStep?.id,
        createdAt: timestamp,
        payload: { dryRun },
      });
      store.addWorkflowRunEvent(event);
      if (dryRun.approvalStepIds.length > 0) {
        const approval: ActionRequest = {
          id: run.id,
          title: `Approve workflow: ${workflow.name}`,
          category: workflow.steps.find((step) => dryRun.approvalStepIds.includes(step.id))?.actionCategory ?? "run-script",
          target: workflow.name,
          reason: "Workflow contains approval-gated steps and cannot execute until the owner approves.",
          connectorId: "workflow-engine",
          agentId: "sentinel",
          dataTouched: ["workflow definition", "workflow run input", "approval-gated steps"],
        };
        recordPendingApproval(approval);
        events.publish("approval", { action: approval, workflow, run, dryRun });
      }
      events.publish("task", { workflow, run, event, dryRun, kind: "workflow-run-created" });
      sendJson(response, 202, { workflow, run, event, dryRun });
      return;
    }
  }

  if (
    tryHandleCatalogRoute({
      method: request.method,
      pathname: url.pathname,
      now,
      sendJson: (statusCode, body) => sendJson(response, statusCode, body),
      statusWithRuntimeState,
      localModelAssetManifests,
      modelActivationPlans,
      hydrateFeatureDownloads,
      futureScalingModels,
      detectToolStatuses,
    })
  ) {
    return;
  }

  const runtimeSummaryHandled = await tryHandleRuntimeSummaryRoute({
    method: request.method,
    pathname: url.pathname,
    now,
    sendJson: (statusCode, body) => sendJson(response, statusCode, body),
    runtimeConstellation,
    runtimeSmokeStatus: readRuntimeSmokeStatus,
    runtimeServicesStatus: buildRuntimeServicesStatus,
    packagingReadiness: () => buildPackagingReadiness({ root: process.cwd(), generatedAt: now() }),
    processVisibilityStatus: () => buildProcessVisibilityStatus({ generatedAt: now() }),
    startupRegistrationPlans: () => buildStartupRegistrationPlans({ root: process.cwd(), generatedAt: now() }),
    wakeRuntimeActivation: runtimeActivationReadiness,
    agentManagerReadiness,
    interactionHealth,
    runtimeSelfTest,
    store,
    approvals: status.pendingApprovals,
  });
  if (runtimeSummaryHandled) {
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/runtime/attention") {
    sendJson(response, 200, { attention: runtimeAttention() });
    return;
  }

  const attentionDryRunMatch = url.pathname.match(/^\/api\/runtime\/attention\/([^/]+)\/dry-run$/);
  if (request.method === "POST" && attentionDryRunMatch) {
    const itemId = decodeURIComponent(attentionDryRunMatch[1] ?? "");
    sendJson(response, 200, { dryRun: createRuntimeAttentionDryRun(runtimeAttention(), itemId) });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/runtime/live-test/latest") {
    sendJson(response, 200, { liveTest: readRuntimeLiveTestStatus() });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/runtime/live-test") {
    const liveTest = await runRuntimeLiveTest({
      gatewayUrl: `http://127.0.0.1:${process.env.JARVIS_GATEWAY_PORT ?? "4317"}`,
      brainUrl: process.env.JARVIS_BRAIN_URL ?? "http://127.0.0.1:5000",
      root: process.cwd(),
      now,
      gatewayChecks: {
        root: () => ({
          ok: true,
          statusCode: 200,
          detail: "Gateway is handling the production live test in-process.",
        }),
        status: () => {
          const runtimeStatus = statusWithRuntimeState();
          return {
            ok: Boolean(runtimeStatus.activeModelId),
            statusCode: 200,
            detail: `Status hydrated with active model ${runtimeStatus.activeModelId}.`,
          };
        },
        chat: async () => {
          const queued = queueChatMessage({
            message: "Jarvis production live test: reply briefly that the app is connected.",
            taskProfile: "daily-assistant",
            timestamp: now(),
          });
          const task = await waitForStoredTask(queued.task.id, 30_000);
          const result = String(task.result ?? "").trim();
          return {
            ok: task.status === "completed" && result.length > 0,
            statusCode: 202,
            result,
            detail: result ? result.slice(0, 120) : `Task finished with status ${task.status}.`,
          };
        },
        selfTest: async () => {
          const selfTest = await runtimeSelfTest();
          const topStatus = selfTest.summary.topStatus;
          return {
            ok: selfTest.summary.connected && topStatus !== "blocked",
            statusCode: 200,
            topStatus,
            detail: `Self-test status: ${topStatus}.`,
          };
        },
      },
    });
    events.publish("status", { kind: "production-live-test", liveTest });
    sendJson(response, liveTest.ok ? 200 : 503, { liveTest });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/runtime/control/dry-run") {
    const body = (await readBody(request)) as { control?: string; target?: string };
    const control = String(body.control ?? "").trim();
    if (!isRuntimeControlKind(control)) {
      sendJson(response, 400, { error: "control must be start, stop, restart, or emergency-stop" });
      return;
    }
    const rawTarget = String(body.target ?? "all").trim();
    const target = (["all", "brain", "gateway", "dashboard", "hud-renderer", "electron-hud", "ollama"].includes(rawTarget)
      ? rawTarget
      : "all") as "all" | RuntimeServiceId;
    const dryRun = createRuntimeControlDryRun({
      id: id("runtime-control"),
      control,
      target,
      createdAt: now(),
      evaluate: (action) =>
        evaluateActionPolicy({
          action,
          privacyMode: status.privacyMode,
          allowedConnectors: getEnabledConnectorIds(),
        }),
    });
    if (dryRun.decision.decision === "requires_approval") {
      recordPendingApproval(dryRun.action);
    }
    events.publish("security", { runtimeControl: dryRun });
    sendJson(response, dryRun.decision.decision === "deny" ? 403 : 200, { dryRun });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/runtime/adapter-repair/dry-run") {
    const body = (await readBody(request)) as { repair?: string };
    const repair = String(body.repair ?? "").trim();
    if (!isRuntimeAdapterRepairKind(repair)) {
      sendJson(response, 400, { error: "repair must be ollama-path, ollama-launch, lmstudio-endpoint, or hotword-enable" });
      return;
    }
    const dryRun = createRuntimeAdapterRepairDryRun({
      id: id("runtime-repair"),
      repair,
      activation: runtimeActivationReadiness(),
      createdAt: now(),
      evaluate: (action) =>
        evaluateActionPolicy({
          action,
          privacyMode: status.privacyMode,
          allowedConnectors: [...getEnabledConnectorIds(), "local-model-runtime"],
        }),
    });
    if (dryRun.decision.decision === "requires_approval") {
      recordPendingApproval(dryRun.action);
    }
    events.publish("security", { kind: "runtime-adapter-repair-dry-run", dryRun });
    sendJson(response, dryRun.decision.decision === "deny" ? 403 : 202, {
      dryRun,
      message: "Runtime adapter repair dry-run only. No PATH, app, endpoint, or microphone state was changed.",
    });
    return;
  }

  if (request.method === "POST" && url.pathname.startsWith("/api/models/") && url.pathname.endsWith("/activation/dry-run")) {
    const parts = url.pathname.split("/").filter(Boolean);
    const modelId = decodeURIComponent(parts[2] ?? "");
    const body = (await readBody(request)) as { runtime?: RuntimeKind };
    const plan = modelActivationPlans().find((candidate) => candidate.modelId === modelId || candidate.assetId === modelId || candidate.modelRef === modelId);
    if (!plan) {
      sendJson(response, 404, { error: "Model activation plan not found", modelId });
      return;
    }
    const runtime = body.runtime && RUNTIME_KINDS.includes(body.runtime) ? body.runtime : undefined;
    const dryRun = createModelActivationDryRun({
      id: id("model-activation"),
      plan,
      runtime,
      createdAt: now(),
      evaluate: (action) =>
        evaluateActionPolicy({
          action,
          privacyMode: status.privacyMode,
          allowedConnectors: [...getEnabledConnectorIds(), "local-model-runtime"],
        }),
    });
    if (dryRun.decision.decision === "requires_approval") {
      recordPendingApproval(dryRun.action);
    }
    events.publish("model", { kind: "model-activation-dry-run", dryRun });
    sendJson(response, dryRun.decision.decision === "deny" ? 403 : 202, {
      dryRun,
      message: "Activation dry-run only. No model weights were loaded and no runtime process was started.",
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/models/scan") {
    const runtimeStatus = statusWithRuntimeState();
    const assetManifests = localModelAssetManifests();
    events.publish("model", {
      readiness: runtimeStatus.modelReadiness ?? [],
      readyModelAssets: runtimeStatus.readyModelAssets ?? [],
      assetManifests,
    });
    sendJson(response, 200, {
      readyModelAssets: runtimeStatus.readyModelAssets ?? [],
      assetManifests,
      readiness: runtimeStatus.modelReadiness ?? [],
      note: "Local scan checked expected folders and runtime hints without downloading anything.",
    });
    return;
  }

  if (
    request.method === "POST" &&
    url.pathname.startsWith("/api/models/") &&
    (url.pathname.endsWith("/probe") || url.pathname.endsWith("/runtime-probe"))
  ) {
    const parts = url.pathname.split("/").filter(Boolean);
    const modelId = decodeURIComponent(parts[2] ?? "");
    const body = (await readBody(request)) as { runtime?: RuntimeKind; safeMode?: boolean };
    const runtimeStatus = statusWithRuntimeState();
    const model = runtimeStatus.models.find((item) => item.id === modelId || item.modelRef === modelId);
    const readiness = (runtimeStatus.modelReadiness ?? []).find((item) => item.modelId === modelId || item.modelRef === modelId);
    if (!model || !readiness) {
      sendJson(response, 404, { error: "Model not found", modelId });
      return;
    }
    const requestedRuntime = body.runtime && RUNTIME_KINDS.includes(body.runtime) ? body.runtime : undefined;
    const runtimeProbe = await probeModelRuntime(model, readiness, runtimeStatus.readyModelAssets ?? [], {
      runtime: requestedRuntime,
      safeMode: body.safeMode ?? true,
    });
    const probedReadiness = { ...readiness, runtimeProbe };
    events.publish("model", { probe: runtimeProbe, readiness: probedReadiness });
    sendJson(response, 200, {
      readiness: probedReadiness,
      runtimeProbe,
      note: "Runtime probe is safe by default: local file and endpoint checks only; no large weight load is attempted.",
    });
    return;
  }

  if (request.method === "POST" && /^\/api\/setup\/install-plans\/[^/]+\/dry-run$/.test(url.pathname)) {
    const planId = decodeURIComponent(url.pathname.split("/")[4] ?? "");
    const generatedAt = now();
    const manifest = buildSetupInstallPlanManifest({
      generatedAt,
      slotManifest: buildFeaturePluginSlotManifest({
        downloads: hydrateFeatureDownloads(),
        generatedAt,
      }),
    });
    const plan = manifest.plans.find((candidate) => candidate.id === planId || candidate.slotId === planId);
    if (!plan) {
      sendJson(response, 404, { error: "Setup install plan not found", planId });
      return;
    }
    const dryRun = createSetupInstallDryRun({
      id: id("setup-install"),
      plan,
      createdAt: generatedAt,
      evaluate: (action) =>
        evaluateActionPolicy({
          action,
          privacyMode: status.privacyMode,
          allowedConnectors: getEnabledConnectorIds(),
        }),
    });
    if (dryRun.decision.decision === "requires_approval") {
      recordPendingApproval(dryRun.action);
    }
    events.publish("setup", { kind: "setup-install-dry-run", dryRun });
    sendJson(response, dryRun.decision.decision === "deny" ? 403 : 202, { dryRun });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/models/dry-run") {
    const body = (await readBody(request)) as { modelRef?: string; source?: ModelSource };
    const modelRef = (body.modelRef ?? "").trim();
    if (!modelRef) {
      sendJson(response, 400, { error: "modelRef is required" });
      return;
    }
    const result = createDryRunResponse(modelRef, body.source);
    events.publish("model", result);
    sendJson(response, 200, result);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/models/benchmark") {
    const body = (await readBody(request)) as { modelId?: string; taskProfile?: TaskProfile };
    const modelId = body.modelId ?? status.activeModelId;
    const benchmark = {
      id: id("benchmark"),
      modelId,
      taskProfile: body.taskProfile ?? "daily-assistant",
      promptTokens: 256,
      outputTokens: 128,
      latencyMs: 1850,
      tokensPerSecond: 18.4,
      createdAt: now(),
      notes: "Synthetic local benchmark placeholder until the selected runtime is installed.",
    };
    events.publish("model", { benchmark });
    sendJson(response, 200, { benchmark });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/models/unload") {
    const body = (await readBody(request)) as { modelId?: string };
    const modelId = body.modelId ?? status.activeModelId;
    if (status.activeModelId === modelId) {
      status = { ...status, activeModelId: "ollama-qwen3-8b" };
    }
    events.publish("model", { unloadedModelId: modelId, activeModelId: status.activeModelId });
    sendJson(response, 200, { unloadedModelId: modelId, activeModelId: status.activeModelId });
    return;
  }

  const modelSelectParts = url.pathname.split("/").filter(Boolean);
  if (request.method === "POST" && modelSelectParts.length === 4 && modelSelectParts[0] === "api" && modelSelectParts[1] === "models" && modelSelectParts[3] === "select") {
    const parts = modelSelectParts;
    const modelId = decodeURIComponent(parts[2] ?? "");
    const runtimeStatus = statusWithRuntimeState();
    const selected = runtimeStatus.models.find((model) => model.id === modelId || model.modelRef === modelId);
    if (!selected) {
      sendJson(response, 404, { error: "Model not found", modelId });
      return;
    }
    if (!selected.enabled && selected.installState !== "installed") {
      sendJson(response, 409, {
        error: "Model is staged but not enabled or installed",
        selected,
      });
      return;
    }
    status = { ...status, activeModelId: selected.id };
    events.publish("model", { selected, activeModelId: selected.id });
    sendJson(response, 200, { selected, activeModelId: selected.id });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/audio/status") {
    const runtimeStatus = statusWithRuntimeState();
    const brainAudio = await brainJson<Record<string, unknown>>("/audio/status");
    const readiness = voiceRuntimeReadiness();
    sendJson(response, 200, {
      engines: runtimeStatus.audioEngines ?? [],
      voiceSession: runtimeStatus.voiceSession,
      voiceAssets: runtimeStatus.voiceAssets ?? [],
      readiness,
      toolStatuses: detectToolStatuses().filter((tool) => ["whisper-cli", "piper"].includes(tool.id)),
      brain: brainAudio ?? { status: "offline", message: "Python Brain is not reachable." },
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/voice/readiness") {
    const brainAudio = await brainJson<Record<string, unknown>>("/audio/status", undefined, 1500);
    sendJson(response, 200, {
      readiness: voiceRuntimeReadiness(),
      brain: brainAudio ?? { status: "offline", message: "Python Brain is not reachable." },
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/voice/profiles") {
    sendJson(response, 200, {
      profiles: status.voiceProfiles ?? [],
      assets: statusWithRuntimeState().voiceAssets ?? [],
      agents: status.agentSouls ?? [],
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/voice/agent-matrix") {
    sendJson(response, 200, {
      matrix: buildAgentVoiceMatrix({
        generatedAt: now(),
        agents: status.agentSouls ?? [],
        voiceProfiles: status.voiceProfiles ?? [],
        voiceAssets: statusWithRuntimeState().voiceAssets ?? [],
        readiness: voiceRuntimeReadiness(),
      }),
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/voice/wake/status") {
    const wakeStatus = await brainJson<Record<string, unknown>>("/voice/wake/status");
    sendJson(response, 200, wakeStatus ?? {
      wakeWord: "jarvis",
      status: "staged",
      enabled: false,
      message: "Python Brain is offline; wake-word listening is unavailable.",
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/voice/wake/simulate") {
    const body = (await readBody(request)) as { phrase?: string };
    const wake = await brainJson<Record<string, unknown>>(
      "/voice/wake/simulate",
      { method: "POST", body: JSON.stringify({ phrase: body.phrase ?? "" }) },
      5000,
    );
    const result = wake ?? {
      detected: false,
      phrase: body.phrase ?? "",
      wakeWord: "jarvis",
      hudState: "error",
      message: "Python Brain is offline; wake-word simulation could not run.",
    };
    events.publish("audio", { wakeWord: result });
    sendJson(response, 200, result);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/voice/test") {
    const body = (await readBody(request)) as { text?: string; voiceProfileId?: string };
    const profile = (status.voiceProfiles ?? []).find((candidate) => candidate.id === body.voiceProfileId) ?? status.voiceProfiles?.[0];
    const sampleAsset = (status.voiceAssets ?? []).find((asset) => asset.id === profile?.sampleAssetId);
    const result = {
      profile,
      status: profile?.status ?? "missing-dependency",
      text: body.text?.trim() || "Jarvis voice profile test.",
      samplePath: sampleAsset?.localPath,
      message:
        profile?.status === "ready"
          ? "Voice profile has a local sample or built-in fallback ready."
          : "Voice profile is staged until Piper or the selected voice dependency is installed.",
    };
    events.publish("audio", { voiceTest: result });
    sendJson(response, 200, result);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/voice/stt/probe") {
    const brainProbe = await brainJson<Record<string, unknown>>("/voice/stt/probe", { method: "POST", body: "{}" }, 5000);
    const whisperReady = existsSync(`${HF_SNAPSHOT_ROOT}\\openai__whisper-large-v3-turbo`);
    const runtimeReady = Boolean(brainProbe && brainProbe.status === "ready");
    const result = {
      primary: "openai/whisper-large-v3-turbo",
      status: runtimeReady ? "ready" : whisperReady ? "ready-asset" : "missing",
      runtimeReady,
      fallback: "Vosk streaming after feature download",
      brain: brainProbe,
      nextAction: runtimeReady
        ? "Whisper STT runtime is ready."
        : whisperReady
        ? "Install/verify transformers+torch or whisper.cpp to run the ready Whisper asset."
        : "Place Whisper large-v3-turbo in the expected snapshot folder.",
    };
    events.publish("audio", { sttProbe: result });
    sendJson(response, 200, result);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/voice/session") {
    const voiceSession =
      status.voiceSession ??
      createVoiceSession({
        id: id("voice-session"),
        now: now(),
        toolsReady: voiceRuntimeReadiness().summary.sttReady,
      });
    sendJson(response, 200, {
      voiceSession,
      readiness: voiceRuntimeReadiness(),
      note: "Live microphone capture is not opened by this endpoint. It reports the current voice-session contract.",
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/voice/listening/start") {
    const body = (await readBody(request)) as { resetTranscript?: boolean };
    const started = startLiveVoiceSession({
      existing: status.voiceSession,
      id: id("voice-session"),
      now: now(),
      toolsReady: voiceRuntimeReadiness().summary.sttReady,
      resetTranscript: body.resetTranscript ?? true,
    });
    status = { ...status, voiceSession: started.voiceSession };
    events.publish("audio", { kind: "voice-listening-started", ...started });
    sendJson(response, 200, started);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/voice/listening/stop") {
    const body = (await readBody(request)) as { reason?: string };
    const stopped = stopLiveVoiceSession({
      existing: status.voiceSession,
      id: id("voice-session"),
      now: now(),
      toolsReady: voiceRuntimeReadiness().summary.sttReady,
      reason: body.reason,
    });
    status = { ...status, voiceSession: stopped.voiceSession };
    events.publish("audio", { kind: "voice-listening-stopped", ...stopped });
    sendJson(response, 200, stopped);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/voice/transcript") {
    const body = (await readBody(request)) as {
      text?: string;
      final?: boolean;
      confidence?: number;
      startMs?: number;
      endMs?: number;
      engineId?: string;
    };
    const timestamp = now();
    const transcript = appendLiveTranscriptChunk({
      existing: status.voiceSession,
      id: id("voice-session"),
      chunkId: id("transcript"),
      now: timestamp,
      toolsReady: voiceRuntimeReadiness().summary.sttReady,
      text: body.text ?? "",
      final: body.final,
      confidence: body.confidence,
      startMs: body.startMs,
      endMs: body.endMs,
      engineId: body.engineId,
    });
    status = { ...status, voiceSession: transcript.voiceSession };
    const timelineEvent =
      body.final && transcript.voiceSession.state !== "error"
        ? recordMultimodalTimeline({
            title: "Voice transcript captured",
            summary: body.text ?? "",
            timestamp,
            source: "owner",
            status: "remembered",
            tags: ["voice", "transcript"],
          })
        : undefined;
    events.publish("audio", { kind: "voice-transcript", ...transcript });
    sendJson(response, transcript.voiceSession.state === "error" ? 400 : 200, { ...transcript, timelineEvent });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/voice/transcript/commit") {
    const body = (await readBody(request)) as { conversationId?: string; taskProfile?: TaskProfile };
    const timestamp = now();
    const committed = commitLiveTranscript({
      existing: status.voiceSession,
      id: id("voice-session"),
      now: timestamp,
      toolsReady: voiceRuntimeReadiness().summary.sttReady,
    });
    status = { ...status, voiceSession: committed.voiceSession };
    if (!committed.committable) {
      events.publish("audio", { kind: "voice-transcript-commit-empty", ...committed });
      sendJson(response, 400, committed);
      return;
    }

    const queued = queueChatMessage({
      conversationId: body.conversationId,
      message: committed.text,
      taskProfile: body.taskProfile ?? "daily-assistant",
      timestamp,
    });
    const timelineEvent = recordMultimodalTimeline({
      title: "Voice transcript queued",
      summary: committed.text,
      timestamp,
      source: "owner",
      status: "remembered",
      tags: ["voice", "queue"],
      relatedConversationId: queued.conversation.id,
      relatedTaskId: queued.task.id,
    });
    events.publish("audio", { kind: "voice-transcript-committed", ...committed, taskId: queued.task.id });
    sendJson(response, 202, {
      ...committed,
      conversation: queued.conversation,
      task: queued.task,
      queued: queued.queued,
      timelineEvent,
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/identity/readiness") {
    const brainIdentity = await brainJson<Record<string, unknown>>("/identity/readiness");
    sendJson(response, 200, {
      profiles: status.identityProfiles ?? [],
      readiness: buildIdentityReadiness(),
      brain: brainIdentity ?? { status: "offline", message: "Python Brain identity service is not reachable." },
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/identity/recognize/dry-run") {
    const body = (await readBody(request)) as { factors?: string[]; mode?: "voice" | "face" | "combined" };
    const timestamp = now();
    const requestedFactors = body.factors ?? (body.mode === "voice" ? ["voice"] : body.mode === "face" ? ["face"] : ["voice", "face"]);
    const brainIdentity = await brainJson<Record<string, unknown>>(
      "/identity/recognize/dry-run",
      { method: "POST", body: JSON.stringify({ factors: requestedFactors }) },
      5000,
    );
    const action: ActionRequest = {
      id: id("identity-recognition"),
      title: "Recognize owner identity",
      category: "sensor-capture",
      target: requestedFactors.join("+"),
      reason: "Identity checks may touch voiceprints, face embeddings, or trusted device signals.",
      agentId: "sentinel",
      dataTouched: [
        ...(requestedFactors.includes("voice") ? ["voiceprint"] : []),
        ...(requestedFactors.includes("face") ? ["face embedding", "camera frames"] : []),
        "trusted device signal",
      ],
    };
    const decision = evaluateActionPolicy({
      action,
      privacyMode: status.privacyMode,
      allowedConnectors: getEnabledConnectorIds(),
    });
    if (decision.decision === "requires_approval") {
      recordPendingApproval(action);
    }
    const timelineEvent = recordMultimodalTimeline({
      title: "Identity recognition dry-run",
      summary: `Factors: ${requestedFactors.join(", ")}. No biometric capture was performed.`,
      timestamp,
      source: "system",
      status: decision.decision === "deny" ? "blocked" : "remembered",
      tags: ["identity", "recognition", ...requestedFactors],
    });
    const hudEvent = {
      id: id("hud"),
      state: "recognizing",
      title: "Recognizing owner",
      summary: "Dry-run only. No biometric capture was performed.",
      createdAt: timestamp,
    };
    events.publish("identity", { action, decision, hudEvent, timelineEvent, brain: brainIdentity });
    sendJson(response, 200, {
      action,
      decision,
      hudEvent,
      timelineEvent,
      captured: false,
      brain: brainIdentity,
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/brain/status") {
    const [health, capabilities, audio, vision, identity] = await Promise.all([
      brainJson<Record<string, unknown>>("/health"),
      brainJson<Record<string, unknown>>("/capabilities"),
      brainJson<Record<string, unknown>>("/audio/status"),
      brainJson<Record<string, unknown>>("/vision/status"),
      brainJson<Record<string, unknown>>("/identity/readiness"),
    ]);
    sendJson(response, health ? 200 : 503, {
      online: Boolean(health),
      health,
      capabilities,
      audio,
      vision,
      identity,
      url: BRAIN_URL,
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/audio/transcribe-file") {
    const body = (await readBody(request)) as { filePath?: string };
    const timestamp = now();
    const brainResult = await brainJson<{
      status?: string;
      engine?: string;
      text?: string;
      message?: string;
      durationSeconds?: number;
    }>(
      "/audio/stt/file",
      {
        method: "POST",
        body: JSON.stringify({ filePath: body.filePath }),
      },
      8000,
    );
    const localWhisperReady = existsSync(`${HF_SNAPSHOT_ROOT}\\openai__whisper-large-v3-turbo`);
    const toolsReady =
      brainResult?.status === "ready" ||
      localWhisperReady ||
      detectToolStatuses().some((tool) => tool.id === "whisper-cli" && tool.installed);
    const session = createVoiceSession({
      id: status.voiceSession?.id ?? id("voice-session"),
      now: timestamp,
      toolsReady,
    });
    const nextSession = toolsReady
      ? appendTranscriptChunk(
          session,
          {
            id: id("transcript"),
            text: brainResult?.text || `Transcription staged for ${body.filePath ?? "uploaded local audio"}.`,
            startMs: 0,
            endMs: Math.round((brainResult?.durationSeconds ?? 1) * 1000),
            confidence: brainResult?.status === "ready" ? 0.9 : localWhisperReady ? 0.82 : 0.7,
            engineId: brainResult?.engine ?? (localWhisperReady ? "whisper-large-v3-turbo" : session.sttEngineId),
            final: true,
          },
          timestamp,
        )
      : session;
    status = { ...status, voiceSession: nextSession };
    const timelineEvent = toolsReady
      ? recordMultimodalTimeline({
          title: "Audio file transcribed",
          summary: nextSession.transcript.at(-1)?.text ?? `STT accepted ${body.filePath ?? "local audio"}.`,
          timestamp,
          source: "system",
          status: "remembered",
          tags: ["voice", "stt", "file"],
        })
      : undefined;
    events.publish("audio", { voiceSession: nextSession, timelineEvent });
    sendJson(response, 200, {
      voiceSession: nextSession,
      result: toolsReady
        ? nextSession.transcript.at(-1)
        : {
            status: "missing-engine",
            message: brainResult?.message ?? "No local Whisper snapshot or whisper.cpp binary was found for transcription.",
          },
      timelineEvent,
      brain: brainResult,
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/audio/tts") {
    const body = (await readBody(request)) as Partial<TtsRequest> & { agentId?: string; voiceProfileId?: string };
    const timestamp = now();
    const requestedAgent = (status.agentSouls ?? []).find((agent) => agent.id === body.agentId || agent.name.toLowerCase() === body.agentId?.toLowerCase());
    const voiceProfile =
      (status.voiceProfiles ?? []).find((profile) => profile.id === body.voiceProfileId || profile.id === body.voiceId) ??
      (status.voiceProfiles ?? []).find((profile) => profile.id === requestedAgent?.voiceProfileId) ??
      (status.voiceProfiles ?? [])[0];
    const brainResult = await brainJson<{
      status?: string;
      engine?: string;
      audioPath?: string;
      message?: string;
      interruptible?: boolean;
      voiceId?: string;
      agentId?: string;
      requestedEngine?: string;
    }>(
      "/audio/tts",
      {
        method: "POST",
        body: JSON.stringify({
          text: body.text,
          voiceId: voiceProfile?.id ?? body.voiceId,
          agentId: requestedAgent?.id ?? voiceProfile?.agentId,
          engineId: body.engineId ?? voiceProfile?.enginePreference,
        }),
      },
      12_000,
    );
    const piperReady = detectToolStatuses().some((tool) => tool.id === "piper" && tool.installed);
    const voiceSample = `${VOICE_ASSET_ROOT}\\jarvis.mp3`;
    const result = {
      requestId: body.id ?? id("tts"),
      status: brainResult?.status === "ready" || piperReady || existsSync(voiceSample) ? "ready" : "missing-engine",
      audioPath:
        brainResult?.audioPath ??
        (piperReady ? "data/audio/tts/latest.wav" : existsSync(voiceSample) ? "assets/voice/jarvis.mp3" : undefined),
      message:
        brainResult?.message ??
        (piperReady
          ? "Piper TTS request accepted for local synthesis."
          : existsSync(voiceSample)
            ? "Piper is not installed yet; using the supplied Jarvis voice sample for local playback."
            : "Piper is not installed or not on PATH. TTS is wired but cannot synthesize yet."),
      engine: brainResult?.engine ?? (piperReady ? "piper" : "voice-sample"),
      interruptible: brainResult?.interruptible ?? true,
      voiceProfile,
      agent: requestedAgent ?? (status.agentSouls ?? []).find((agent) => agent.id === voiceProfile?.agentId),
    };
    const timelineEvent = recordMultimodalTimeline({
      title: "TTS request",
      summary: `${result.engine}: ${String(body.text ?? "").slice(0, 180)}`,
      timestamp,
      source: "system",
      status: result.status === "ready" ? "remembered" : "blocked",
      tags: ["voice", "tts", result.engine],
    });
    events.publish("audio", { tts: result, timelineEvent });
    sendJson(response, 200, { tts: result, timelineEvent });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/audio/tts/stop") {
    const body = (await readBody(request)) as { reason?: string };
    const stopResult = await brainJson<Record<string, unknown>>(
      "/audio/tts/stop",
      { method: "POST", body: JSON.stringify({ reason: body.reason ?? "owner interrupt" }) },
      5000,
    );
    const result = stopResult ?? {
      stopped: false,
      reason: body.reason ?? "owner interrupt",
      speaking: false,
      message: "Python Brain is offline; no speech process was stopped.",
    };
    events.publish("audio", { stopSpeaking: result });
    sendJson(response, 200, result);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/connectors") {
    sendJson(response, 200, {
      connectors: status.connectors,
      socialDrafts,
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/reports") {
    sendJson(response, 200, { reports: buildReports(), performance: buildPerformanceSnapshot() });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/maps") {
    sendJson(response, 200, { maps: status.mapOverlays ?? [] });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/maps/query") {
    const body = (await readBody(request)) as { query?: string };
    const query = body.query?.trim() || "local Jarvis operations";
    const map: MapInsight = {
      id: id("map"),
      label: "Local map draft",
      query,
      center: { lat: 22.3193, lng: 114.1694 },
      zoom: 12,
      pins: [
        { id: id("pin"), label: "Jarvis laptop", lat: 22.3193, lng: 114.1694, status: "home" },
        { id: id("pin"), label: "Planned device target", lat: 22.326, lng: 114.174, status: "planned" },
      ],
      route: { label: "Approved local route draft", distanceKm: 1.6, etaMinutes: 8 },
      notes: "Generated locally without contacting a map provider. Live geocoding requires an enabled maps connector and approval.",
    };
    status = { ...status, mapOverlays: [map, ...(status.mapOverlays ?? []).slice(0, 3)] };
    events.publish("map", { map });
    sendJson(response, 200, { map });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/devices") {
    sendJson(response, 200, { devices: hydrateDevices() });
    return;
  }

  if (request.method === "POST" && url.pathname.startsWith("/api/devices/")) {
    const parts = url.pathname.split("/").filter(Boolean);
    const deviceId = parts[2];
    const actionName = parts[3];
    const device = hydrateDevices().find((candidate) => candidate.id === deviceId);
    if (!device) {
      sendJson(response, 404, { error: "Device not found", deviceId });
      return;
    }
    if (actionName !== "dry-run") {
      sendJson(response, 404, { error: "Unknown device action", actionName });
      return;
    }

    const body = (await readBody(request)) as { command?: string };
    const command = body.command?.trim() || `Inspect ${device.name}`;
    const category = device.permissions.includes("sensor-capture")
      ? "sensor-capture"
      : device.permissions.includes("device-control")
        ? "device-control"
        : "read-local";
    const action: ActionRequest = {
      id: id("device-action"),
      title: `${device.name} dry-run`,
      category,
      target: device.name,
      reason: `Dry-run only: ${command}`,
      connectorId: device.kind === "desktop" ? "filesystem" : undefined,
      agentId: "jarvis",
      dataTouched: [device.kind, "local device state"],
    };
    const decision = evaluateActionPolicy({
      action,
      privacyMode: status.privacyMode,
      allowedConnectors: getEnabledConnectorIds(),
    });
    if (decision.decision === "requires_approval") {
      recordPendingApproval(action);
    }
    events.publish("device", { device, command, decision, action });
    sendJson(response, 200, {
      device,
      command,
      dryRun: {
        action,
        decision,
        preview: `${command} would touch ${action.dataTouched.join(", ")}. No device command was executed.`,
      },
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/vision/readiness") {
    const brainVision = await brainJson<Record<string, unknown>>("/vision/readiness");
    const readiness = visionRuntimeReadiness();
    sendJson(response, 200, {
      status: "approval-gated",
      readiness,
      engines: [
        {
          id: "screen-capture",
          label: "Screen capture",
          status: readiness.screenCapture.status,
        },
        {
          id: "image-analysis",
          label: "Static image analysis",
          status: readiness.summary.localVisionAssets > 0 ? "ready-asset" : "staged",
        },
        {
          id: "webcam-identity",
          label: "Webcam identity",
          status: readiness.camera.status,
        },
        {
          id: "ocr",
          label: "OCR",
          status: readiness.ocr.status,
        },
        {
          id: "object-detection",
          label: "YOLO object detection",
          status: readiness.objectDetection.status,
        },
      ],
      neededFeatureDownloads: hydrateFeatureDownloads().filter((download) => download.category === "vision"),
      privacyLocks: buildSensorPrivacyLocks(),
      brain: brainVision,
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/privacy/sensors") {
    const brainLocks = await brainJson<Record<string, unknown>>("/vision/privacy-locks");
    sendJson(response, 200, {
      localOnly: true,
      locks: buildSensorPrivacyLocks(),
      brain: brainLocks ?? { status: "offline", message: "Python Brain sensor privacy service is not reachable." },
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/vision/requests") {
    sendJson(response, 200, {
      requests: status.visionInsights ?? [],
      note: "These are local vision request records. Screen and camera captures remain approval-gated.",
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/vision/live-request") {
    const body = (await readBody(request)) as {
      mode?: LiveVisionMode;
      target?: string;
      filePath?: string;
      prompt?: string;
    };
    const mode = ["screen", "camera", "image"].includes(String(body.mode)) ? (body.mode as LiveVisionMode) : body.filePath ? "image" : "screen";
    const requestRecord = createLiveVisionRequest({
      id: id("vision-request"),
      actionId: id("vision-action"),
      mode,
      target: body.filePath ?? body.target,
      prompt: body.prompt,
      createdAt: now(),
      evaluate: (action) =>
        evaluateActionPolicy({
          action,
          privacyMode: status.privacyMode,
          allowedConnectors: action.connectorId ? [...getEnabledConnectorIds(), action.connectorId] : getEnabledConnectorIds(),
        }),
    });
    if (requestRecord.decision.decision === "requires_approval") {
      recordPendingApproval(requestRecord.action);
    }
    const timelineEvent = recordMultimodalTimeline({
      title: "Vision request staged",
      summary: `${requestRecord.mode}: ${requestRecord.target}. ${requestRecord.prompt}`,
      timestamp: requestRecord.insight.createdAt,
      source: "system",
      status: requestRecord.decision.decision === "deny" ? "blocked" : "remembered",
      tags: ["vision", requestRecord.mode],
    });
    status = {
      ...status,
      visionInsights: [requestRecord.insight, ...(status.visionInsights ?? []).slice(0, 9)],
    };
    events.publish("vision", { kind: "live-vision-request", request: requestRecord, timelineEvent });
    sendJson(response, requestRecord.decision.decision === "deny" ? 403 : 202, {
      request: requestRecord,
      timelineEvent,
      message: "Vision request recorded. No pixels, frames, or OCR text were captured.",
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/vision/capture-screen/dry-run") {
    const brainDryRun = await brainJson<Record<string, unknown>>(
      "/vision/capture-screen/dry-run",
      { method: "POST", body: "{}" },
      5000,
    );
    const action: ActionRequest = {
      id: id("vision-screen"),
      title: "Capture current screen",
      category: "sensor-capture",
      target: "active screen",
      reason: "Screen pixels may include private app data; capture is approval-gated.",
      connectorId: "screen",
      agentId: "argus",
      dataTouched: ["screen pixels", "OCR text", "app context"],
    };
    const decision = evaluateActionPolicy({
      action,
      privacyMode: status.privacyMode,
      allowedConnectors: action.connectorId ? [...getEnabledConnectorIds(), action.connectorId] : getEnabledConnectorIds(),
    });
    if (decision.decision === "requires_approval") {
      recordPendingApproval(action);
    }
    events.publish("vision", { dryRun: action, decision });
    sendJson(response, 200, {
      action,
      decision,
      preview: "No screen capture was taken. Approval is required before Argus can inspect live pixels.",
      brain: brainDryRun,
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/vision/capture-camera/dry-run") {
    const brainDryRun = await brainJson<Record<string, unknown>>(
      "/vision/capture-camera/dry-run",
      { method: "POST", body: "{}" },
      5000,
    );
    const action: ActionRequest = {
      id: id("vision-camera"),
      title: "Capture camera frame",
      category: "sensor-capture",
      target: "webcam",
      reason: "Camera frames may include biometric identity and private room context; capture is approval-gated.",
      connectorId: "camera",
      agentId: "argus",
      dataTouched: ["camera frames", "face embedding", "room context"],
    };
    const decision = evaluateActionPolicy({
      action,
      privacyMode: status.privacyMode,
      allowedConnectors: action.connectorId ? [...getEnabledConnectorIds(), action.connectorId] : getEnabledConnectorIds(),
    });
    if (decision.decision === "requires_approval") {
      recordPendingApproval(action);
    }
    events.publish("vision", { dryRun: action, decision, brain: brainDryRun });
    sendJson(response, 200, {
      action,
      decision,
      preview: "No camera frame was captured. Approval is required before Argus can inspect live camera input.",
      brain: brainDryRun,
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/vision/analyze-image") {
    const body = (await readBody(request)) as { filePath?: string; source?: string; mode?: VisionInsight["mode"]; ocr?: boolean; includeOcr?: boolean };
    const timestamp = now();
    const mode = body.mode ?? (body.filePath ? "image" : "camera");
    const brainVision = body.filePath
      ? await brainJson<{
          status?: string;
          summary?: string;
          observations?: string[];
          dimensions?: Record<string, unknown>;
          message?: string;
        }>(
          "/vision/analyze-image",
          {
            method: "POST",
            body: JSON.stringify({ filePath: body.filePath, ocr: body.ocr ?? body.includeOcr ?? false }),
          },
          8000,
        )
      : undefined;
    const action: ActionRequest = {
      id: id("vision-action"),
      title: "Analyze visual input",
      category: "sensor-capture",
      target: body.filePath ?? body.source ?? mode,
      reason: "Vision analysis touches image, camera, screen, or OCR content.",
      connectorId: mode === "camera" ? "camera" : mode === "screen" ? "screen" : undefined,
      agentId: "jarvis",
      dataTouched: ["visual input", "possible OCR text"],
    };
    const decision = evaluateActionPolicy({
      action,
      privacyMode: status.privacyMode,
      allowedConnectors: getEnabledConnectorIds(),
    });
    const insight: VisionInsight = {
      id: id("vision"),
      source: body.filePath ?? body.source ?? "live sensor",
      mode,
      status:
        body.filePath && brainVision?.status === "ready"
          ? "ready"
          : body.filePath
            ? "needs-input"
            : decision.decision === "requires_approval"
              ? "requires-approval"
              : "needs-input",
      summary: body.filePath
        ? brainVision?.summary ?? "Local image analysis request accepted. OCR/object detection sidecar will process this path when active."
        : "Live screen/camera perception is wired, but requires explicit approval before capture.",
      observations:
        brainVision?.observations ??
        [
          decision.decision === "requires_approval" ? "Approval required before live sensor capture." : "Static file path can be analyzed locally.",
          "No hosted vision inference is used by default.",
          "Results are eligible for MemoryOS timeline only after owner-approved retention.",
        ],
      createdAt: timestamp,
    };
    status = { ...status, visionInsights: [insight, ...(status.visionInsights ?? []).slice(0, 4)] };
    events.publish("vision", { insight, decision, brain: brainVision });
    sendJson(response, 200, { insight, decision, brain: brainVision });
    return;
  }

  if (
    tryHandleSecurityCatalogRoute({
      method: request.method,
      pathname: url.pathname,
      status,
      sendJson: (statusCode, body) => sendJson(response, statusCode, body),
    })
  ) {
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/security/sentinel/review") {
    const body = (await readBody(request)) as { prompt?: string; action?: ActionRequest };
    const review = body.action
      ? sentinelReviewAction({
          action: body.action,
          prompt: body.prompt,
          privacyMode: status.privacyMode,
          allowedConnectors: getEnabledConnectorIds(),
          createdAt: now(),
        })
      : sentinelReviewPrompt({
          prompt: body.prompt ?? "",
          actionId: id("sentinel-review"),
          privacyMode: status.privacyMode,
          allowedConnectors: getEnabledConnectorIds(),
          createdAt: now(),
        });
    events.publish("security", { sentinelReview: review });
    sendJson(response, 200, { review });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/system/actions/dry-run") {
    const body = (await readBody(request)) as {
      label?: string;
      command?: string;
      target?: string;
      category?: ActionRequest["category"];
    };
    const command = body.command?.trim() || "Inspect status only";
    const systemAction = createSystemAction({
      label: body.label?.trim() || "Approved-admin local action",
      command,
      target: body.target?.trim() || "local laptop",
      category: body.category,
    });
    pendingSystemActions.set(systemAction.id, systemAction);
    if (systemAction.decision.decision === "requires_approval") {
      recordPendingApproval(systemAction.actionRequest);
    }
    const undoEntry = createUndoEntry(systemAction);
    if (systemAction.reversible) {
      store.addUndoJournalEntry(undoEntry);
    }
    events.publish("security", { systemAction, undoEntry });
    sendJson(response, 200, {
      systemAction,
      undoEntry,
      preview: "Dry-run only. No OS command was executed from this request.",
    });
    return;
  }

  if (request.method === "POST" && url.pathname.startsWith("/api/system/actions/")) {
    const parts = url.pathname.split("/").filter(Boolean);
    const actionId = parts[3];
    const actionName = parts[4];
    const systemAction = pendingSystemActions.get(actionId);
    if (!systemAction) {
      sendJson(response, 404, { error: "System action not found", actionId });
      return;
    }

    if (actionName === "approve") {
      const execution =
        systemAction.decision.decision === "deny"
          ? {
              status: "blocked",
              executed: false,
              actionId: systemAction.id,
              category: systemAction.category,
              message: "Execution blocked because Sentinel or policy denied this action.",
              localOnly: true,
            }
          : await executeSystemActionThroughBrain(systemAction);
      const executed: SystemAction = {
        ...systemAction,
        status:
          systemAction.decision.decision === "deny" || execution.status === "blocked"
            ? "blocked"
            : execution.executed
              ? "executed"
              : "approved",
      };
      pendingSystemActions.set(actionId, executed);
      const undoEntry = systemAction.reversible
        ? store.getUndoJournalEntry(actionId) ?? createUndoEntry(systemAction)
        : createUndoEntry(systemAction);
      if (systemAction.reversible && !store.getUndoJournalEntry(actionId)) {
        store.addUndoJournalEntry(undoEntry);
      }
      const memoryWrite: MemoryWrite = {
        id: id("memory"),
        kind: "decision",
        content: `Approved-admin action accepted: ${systemAction.label}. Python executor status: ${execution.status}. ${execution.message} Undo: ${undoEntry.status}.`,
        importance: 0.82,
        createdAt: now(),
        tags: ["system-action", "approved-admin", systemAction.category],
      };
      store.addMemoryWrite(memoryWrite);
      events.publish("security", { systemAction: executed, undoEntry, memoryWrite, execution });
      sendJson(response, 200, {
        systemAction: executed,
        undoEntry,
        memoryWrite,
        execution,
        message: execution.executed
          ? systemAction.reversible
            ? "Action executed through Python Brain with a 20-minute rollback checkpoint."
            : "Action executed through Python Brain. It is marked non-reversible."
          : `Action approved, but execution did not complete: ${execution.message}`,
      });
      return;
    }

    if (actionName === "undo") {
      const undoEntry = store.getUndoJournalEntry(actionId);
      if (!undoEntry) {
        sendJson(response, 404, { error: "Undo checkpoint not found", actionId });
        return;
      }
      if (!undoEntry.reversible || undoEntry.status === "not-reversible") {
        sendJson(response, 409, { error: "Action is not reversible", undoEntry });
        return;
      }
      if (undoEntry.status === "expired" || Date.parse(undoEntry.expiresAt) < Date.now()) {
        const expired = store.markUndoJournalEntry(undoEntry.id, "expired") ?? { ...undoEntry, status: "expired" as const };
        sendJson(response, 409, { error: "Undo checkpoint expired", undoEntry: expired });
        return;
      }
      const restoreResult = restoreUndoCheckpoint(undoEntry);
      const restored = store.markUndoJournalEntry(undoEntry.id, "restored") ?? { ...undoEntry, status: "restored" as const };
      const restoredAction: SystemAction = { ...systemAction, status: "undone" };
      pendingSystemActions.set(actionId, restoredAction);
      events.publish("security", { systemAction: restoredAction, undoEntry: restored, restoreResult });
      sendJson(response, 200, {
        systemAction: restoredAction,
        undoEntry: restored,
        restoreResult,
        message: restoreResult.message,
      });
      return;
    }
  }

  if (request.method === "GET" && url.pathname === "/api/undo-journal") {
    sendJson(response, 200, {
      undoJournal: store.listUndoJournal(),
      ttlMinutes: 20,
      note: "Undo entries are for Jarvis-managed reversible changes. Non-reversible actions are labeled before approval.",
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/memory/search") {
    const query = (url.searchParams.get("q") ?? "").trim();
    const seedResults = query
      ? status.memories.filter((memory) =>
          `${memory.title} ${memory.summary} ${memory.tags.join(" ")}`.toLowerCase().includes(query.toLowerCase()),
        )
      : status.memories;
    const writes = query ? store.searchMemoryWrites(query) : store.listMemoryWrites(40);
    const records = query ? store.searchMemoryRecords(query) : store.listMemoryRecords(40);
    const timeline = query ? store.searchTimelineEvents(query) : store.listTimelineEvents(80);
    sendJson(response, 200, { query, memories: seedResults, writes, records, timeline });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/memory/search") {
    const body = (await readBody(request)) as { query?: string; q?: string; limit?: number; includeTimeline?: boolean };
    const query = (body.query ?? body.q ?? "").trim();
    const limit = Math.max(1, Math.min(120, body.limit ?? 40));
    const seedResults = query
      ? status.memories.filter((memory) =>
          `${memory.title} ${memory.summary} ${memory.tags.join(" ")}`.toLowerCase().includes(query.toLowerCase()),
        )
      : status.memories.slice(0, limit);
    const writes = query ? store.searchMemoryWrites(query, limit) : store.listMemoryWrites(limit);
    const records = query ? store.searchMemoryRecords(query, limit) : store.listMemoryRecords(limit);
    const timeline = body.includeTimeline === false ? [] : query ? store.searchTimelineEvents(query, limit) : store.listTimelineEvents(limit);
    sendJson(response, 200, { query, memories: seedResults, writes, records, timeline });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/memory/records") {
    sendJson(response, 200, { records: store.listMemoryRecords(120), timeline: store.listTimelineEvents(120) });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/timeline") {
    const query = (url.searchParams.get("q") ?? "").trim();
    sendJson(response, 200, {
      query,
      timeline: query ? store.searchTimelineEvents(query, 120) : store.listTimelineEvents(120),
      undoJournal: store.listUndoJournal(),
    });
    return;
  }

  if (request.method === "POST" && url.pathname.startsWith("/api/connectors/")) {
    const parts = url.pathname.split("/").filter(Boolean);
    const connectorId = parts[2];
    const actionName = parts[3];
    const connector = status.connectors.find((candidate) => candidate.id === connectorId);
    if (!connector) {
      sendJson(response, 404, { error: "Connector not found", connectorId });
      return;
    }

    if (actionName === "enable") {
      const body = (await readBody(request)) as { enabled?: boolean };
      status = {
        ...status,
        connectors: status.connectors.map((candidate) =>
          candidate.id === connectorId ? { ...candidate, enabled: body.enabled ?? true } : candidate,
        ),
      };
      events.publish("connector", { connectorId, enabled: body.enabled ?? true });
      sendJson(response, 200, { connector: status.connectors.find((candidate) => candidate.id === connectorId) });
      return;
    }

    if (actionName === "dry-run") {
      const body = (await readBody(request)) as { recipient?: string; channel?: string; content?: string };
      const timestamp = now();
      const action: ActionRequest = {
        id: id("action"),
        title: `Draft ${connector.name} message`,
        category: connector.permissions.includes("post-social") ? "post-social" : "send-message",
        target: body.recipient ?? "unconfigured recipient",
        reason: "Social connector dry-run creates a draft only. Live sending remains approval-gated.",
        connectorId,
        dataTouched: ["message draft", "recipient", "channel"],
      };
      const decision = evaluateActionPolicy({
        action,
        privacyMode: status.privacyMode,
        allowedConnectors: getEnabledConnectorIds(),
      });
      if (decision.decision === "requires_approval") {
        recordPendingApproval(action);
      }
      const draft = createOutboundMessageDraft({
        id: id("draft"),
        connectorId,
        recipient: body.recipient ?? "preview-recipient",
        channel: body.channel ?? connector.name,
        content: body.content ?? "Jarvis draft preview.",
        createdAt: timestamp,
        decision,
        action,
      });
      socialDrafts.unshift(draft);
      events.publish("connector", { dryRun: { draft, decision } });
      sendJson(response, 200, { draft, decision });
      return;
    }
  }

  if (request.method === "POST" && url.pathname === "/api/mobile/pairing/start") {
    const body = (await readBody(request)) as { baseUrl?: string; deviceName?: string };
    const pairing = createMobilePairing(body.baseUrl ?? "http://127.0.0.1:4317", body.deviceName);
    mobilePairings.unshift(pairing);
    events.publish("mobile", { pairing });
    sendJson(response, 201, { pairing });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/mobile/pairing/confirm") {
    const body = (await readBody(request)) as { id?: string; deviceName?: string };
    const pairing = mobilePairings.find((candidate) => candidate.id === body.id);
    if (!pairing) {
      sendJson(response, 404, { error: "Pairing not found", id: body.id });
      return;
    }
    pairing.status = "confirmed";
    pairing.deviceName = body.deviceName ?? pairing.deviceName;
    events.publish("mobile", { pairing });
    sendJson(response, 200, { pairing });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/chat") {
    const body = (await readBody(request)) as {
      conversationId?: string;
      message?: string;
      taskProfile?: TaskProfile;
    };
    const message = (body.message ?? "").trim();
    if (!message) {
      sendJson(response, 400, { error: "message is required" });
      return;
    }

    const result = queueChatMessage({
      conversationId: body.conversationId,
      message,
      taskProfile: body.taskProfile,
      timestamp: now(),
    });
    sendJson(response, 202, result);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/policy/evaluate") {
    const action = (await readBody(request)) as ActionRequest;
    const decision = evaluateActionPolicy({
      action,
      privacyMode: status.privacyMode,
      allowedConnectors: getEnabledConnectorIds(),
    });
    sendJson(response, 200, decision);
    return;
  }

  if (request.method === "POST" && url.pathname.startsWith("/api/tasks/")) {
    const parts = url.pathname.split("/").filter(Boolean);
    const taskId = parts[2];
    const action = parts[3];
    const task = store.getTask(taskId);
    if (!task) {
      sendJson(response, 404, { error: "Task not found", taskId });
      return;
    }

    if (action === "steer" || action === "interrupt") {
      const body = (await readBody(request)) as { instruction?: string };
      const steering = createSteeringEvent({
        id: id("steer"),
        taskId,
        instruction: body.instruction ?? "Adjust course using the latest user message.",
        policy: "soft-steer",
        createdAt: now(),
      });
      const paused = task.status === "running" ? applyTaskStatus(task, "paused", steering.createdAt) : task;
      const revised: TaskRun = {
        ...paused,
        status: paused.status === "cancelled" || paused.status === "completed" ? paused.status : "running",
        updatedAt: steering.createdAt,
        checkpoint: `Soft steer recorded: ${steering.instruction}`,
      };
      store.upsertTask(revised);
      const event = taskEvent({
        id: id("task-event"),
        taskId,
        kind: action === "interrupt" ? "interrupted" : "steered",
        message: steering.instruction,
        createdAt: steering.createdAt,
        payload: { policy: steering.policy },
      });
      store.addTaskEvent(event);
      const memoryWrite: MemoryWrite = {
        id: id("memory"),
        conversationId: task.conversationId,
        taskId,
        kind: "decision",
        content: `User steered task ${taskId}: ${steering.instruction}`,
        importance: 0.72,
        createdAt: steering.createdAt,
        tags: ["steering", "conversation-adjustment"],
      };
      store.addMemoryWrite(memoryWrite);
      events.publish("task", { task: revised, event, steering });
      events.publish("memory", { memoryWrite });
      sendJson(response, 200, { task: revised, event, steering });
      return;
    }

    if (action === "cancel") {
      if (task.status === "completed" || task.status === "failed" || task.status === "cancelled") {
        sendJson(response, 409, {
          error: "Task is already terminal",
          task,
        });
        return;
      }
      const cancelledAt = now();
      const cancelled = applyTaskStatus(task, "cancelled", cancelledAt);
      const checkpointed: TaskRun = {
        ...cancelled,
        checkpoint: task.checkpoint ?? "Cancelled by user before final result.",
      };
      store.upsertTask(checkpointed);
      store.upsertQueueItem({
        taskId,
        status: "cancelled",
        priority: 0,
        enqueuedAt: task.createdAt,
        finishedAt: cancelledAt,
      });
      const event = taskEvent({
        id: id("task-event"),
        taskId,
        kind: "cancelled",
        message: "Task cancelled and checkpoint preserved.",
        createdAt: cancelledAt,
      });
      store.addTaskEvent(event);
      events.publish("task", { task: checkpointed, event });
      sendJson(response, 200, { task: checkpointed, event });
      return;
    }
  }

  if (request.method === "POST" && url.pathname === "/api/models/select") {
    const body = (await readBody(request)) as { taskProfile?: TaskProfile };
    const taskProfile = body.taskProfile ?? "daily-assistant";
    const runtimeStatus = statusWithRuntimeState();
    const selected = selectModelForTask({
      taskProfile,
      scaleProfile: status.scaleProfile,
      models: runtimeStatus.models,
      readiness: runtimeStatus.modelReadiness,
    });

    status = {
      ...status,
      activeModelId: selected.id,
    };

    sendJson(response, 200, { selected, activeModelId: status.activeModelId });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/models/pull") {
    const body = (await readBody(request)) as { modelRef?: string; source?: ModelSource };
    const modelRef = (body.modelRef ?? "").trim();
    if (!modelRef) {
      sendJson(response, 400, { error: "modelRef is required" });
      return;
    }
    const { dryRun, decision } = createDryRunResponse(modelRef, body.source);
    if (decision.decision === "requires_approval") {
      recordPendingApproval(dryRun.approvalAction);
    }
    events.publish("approval", { action: dryRun.approvalAction, decision, dryRun });
    sendJson(response, decision.decision === "deny" ? 403 : 202, {
      action: dryRun.approvalAction,
      decision,
      dryRun,
    });
    return;
  }

  sendJson(response, 404, { error: "Not found", path: url.pathname });
}

export function startGateway(port = DEFAULT_PORT): ReturnType<typeof createServer> {
  const server = createServer((request, response) => {
    routeRequest(request, response).catch((error: unknown) => {
      sendJson(response, 500, {
        error: "Jarvis gateway error",
        detail: error instanceof Error ? error.message : String(error),
      });
    });
  });

  server.listen(port, () => {
    console.log(`Jarvis local gateway listening on http://localhost:${port}`);
  });

  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startGateway(Number(process.env.JARVIS_GATEWAY_PORT ?? DEFAULT_PORT));
}
