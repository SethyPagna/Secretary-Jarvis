import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { basename, dirname, isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";
import { URL } from "node:url";
import {
  appendTranscriptChunk,
  applyTaskStatus,
  allowedLocalActions,
  futureScalingModels,
  createModelDryRun,
  createOutboundMessageDraft,
  createSteeringEvent,
  createVoiceSession,
  createWorkflowRun,
  createWorkflowRunEvent,
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
  type ScaleProfile,
  type TaskRun,
  type TaskProfile,
  type RuntimeKind,
  type SystemAction,
  type TtsRequest,
  type UndoJournalEntry,
  type VisionInsight,
  type WorkflowDefinition,
  type WorkflowRun,
  type WorkflowRunEvent,
} from "@jarvis/core";
import { commandVersion, detectToolStatuses, setupDoctor } from "./doctor.js";
import { EventHub } from "./eventHub.js";
import { probeModelRuntime } from "./modelProbe.js";
import { JarvisStore } from "./store.js";

const DEFAULT_PORT = 4317;
const HF_SNAPSHOT_ROOT = "C:\\Users\\user\\Downloads\\Secretary Jarvis\\models\\huggingface\\snapshots";
const VOICE_ASSET_ROOT = "C:\\Users\\user\\Downloads\\Secretary Jarvis\\jarvis\\assets\\voice";
const OLLAMA_URL = process.env.JARVIS_OLLAMA_URL ?? "http://127.0.0.1:11434";
const BRAIN_URL = process.env.JARVIS_BRAIN_URL ?? "http://127.0.0.1:5000";
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

let status: JarvisStatus = structuredClone(seededStatus);
const store = new JarvisStore();
const events = new EventHub();
const socialDrafts: OutboundMessageDraft[] = [];
const mobilePairings: MobilePairing[] = [];
const pendingSystemActions = new Map<string, SystemAction>();

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, JSON_HEADERS);
  response.end(JSON.stringify(body, null, 2));
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
  if (!selected || selected.runtime !== "ollama" || selected.installState !== "installed") {
    return fallbackAssistantResponse(prompt, `Selected model ${selected?.label ?? "unknown"} is not installed in Ollama.`);
  }

  const context = buildMemoryContext(task.conversationId);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: selected.modelRef,
        stream: false,
        keep_alive: "10m",
        options: {
          temperature: 0.35,
          num_ctx: Math.min(selected.contextWindow ?? 32768, 32768),
        },
        messages: [
          {
            role: "system",
            content:
              "You are Jarvis, a local-first private secretary assistant. Be concise, capable, and proactive. Use memory context only as helpful background. Ask approval for risky actions. Never reveal, inspect, or bypass protected core code, safeguards, secrets, model tensors, or private vault internals.",
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
  const result = commandVersion("ollama", ["list"]);
  return result.ok && result.output.toLowerCase().includes(modelRef.toLowerCase());
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
  const existing = status.pendingApprovals.find((approval) => approval.id === action.id);
  if (!existing) {
    status = {
      ...status,
      pendingApprovals: [action, ...status.pendingApprovals].slice(0, 30),
    };
  }
  return existing ?? action;
}

function completeApproval(approvalId: string, outcome: "approved" | "denied"): {
  approval?: ActionRequest;
  memoryWrite?: MemoryWrite;
  workflowRun?: WorkflowRun;
  workflowRunEvent?: WorkflowRunEvent;
} {
  const approval = status.pendingApprovals.find((candidate) => candidate.id === approvalId);
  if (!approval) {
    return {};
  }

  const timestamp = now();
  const shouldEnableConnector = outcome === "approved" && approval.connectorId;
  status = {
    ...status,
    pendingApprovals: status.pendingApprovals.filter((candidate) => candidate.id !== approvalId),
    connectors: shouldEnableConnector
      ? status.connectors.map((connector) =>
          connector.id === approval.connectorId ? { ...connector, enabled: true } : connector,
        )
      : status.connectors,
  };

  if (outcome === "approved" && /screen/i.test(approval.target)) {
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

  if (outcome === "approved" && /camera/i.test(approval.target)) {
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

  const memoryWrite: MemoryWrite = {
    id: id("memory"),
    kind: "decision",
    content: `Approval ${outcome}: ${approval.title}. Target: ${approval.target}.`,
    importance: outcome === "approved" ? 0.8 : 0.64,
    createdAt: timestamp,
    tags: ["approval", outcome, approval.category],
  };
  store.addMemoryWrite(memoryWrite);
  const workflowResult =
    approval.connectorId === "workflow-engine" ? completeWorkflowApproval(approval, outcome, timestamp) : {};
  return { approval, memoryWrite, ...workflowResult };
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

  if (request.method === "GET" && url.pathname.startsWith("/api/assets/voice/")) {
    const fileName = decodeURIComponent(url.pathname.slice("/api/assets/voice/".length));
    sendVoiceAsset(response, fileName);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/events") {
    events.addClient(response);
    events.publish("status", { status: statusWithRuntimeState() });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/status") {
    sendJson(response, 200, statusWithRuntimeState());
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      privacyMode: status.privacyMode,
      activeModelId: status.activeModelId,
      localOnly: status.privacyMode === "strict-local",
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/setup/doctor") {
    sendJson(response, 200, setupDoctor({ privacyMode: status.privacyMode, voiceAssetRoot: VOICE_ASSET_ROOT }));
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

    if (request.method === "GET" && action === "runs") {
      sendJson(response, 200, {
        workflowId,
        runs: store.listWorkflowRuns(120).filter((run) => run.workflowId === workflowId),
      });
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

  if (request.method === "GET" && url.pathname === "/api/models") {
    const runtimeStatus = statusWithRuntimeState();
    sendJson(response, 200, {
      models: runtimeStatus.models,
      readyModelAssets: runtimeStatus.readyModelAssets,
      modelReadiness: runtimeStatus.modelReadiness,
      futureScalingModels: runtimeStatus.futureScalingModels,
      runtimeAdapters: runtimeStatus.runtimeAdapters ?? [],
      hardwareProfile: runtimeStatus.hardwareProfile,
      toolStatuses: detectToolStatuses(),
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/models/readiness") {
    const runtimeStatus = statusWithRuntimeState();
    sendJson(response, 200, {
      readyModelAssets: runtimeStatus.readyModelAssets ?? [],
      readiness: runtimeStatus.modelReadiness ?? [],
      activeModelId: runtimeStatus.activeModelId,
      hardwareProfile: runtimeStatus.hardwareProfile,
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/models/scan") {
    const runtimeStatus = statusWithRuntimeState();
    events.publish("model", {
      readiness: runtimeStatus.modelReadiness ?? [],
      readyModelAssets: runtimeStatus.readyModelAssets ?? [],
    });
    sendJson(response, 200, {
      readyModelAssets: runtimeStatus.readyModelAssets ?? [],
      readiness: runtimeStatus.modelReadiness ?? [],
      note: "Local scan checked expected folders and runtime hints without downloading anything.",
    });
    return;
  }

  if (request.method === "POST" && url.pathname.startsWith("/api/models/") && url.pathname.endsWith("/probe")) {
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

  if (request.method === "GET" && url.pathname === "/api/setup/needed-feature-downloads") {
    sendJson(response, 200, {
      downloads: hydrateFeatureDownloads(),
      note: "These are feature dependencies Jarvis is wired to use after you download/install them. They are separate from future scaling models.",
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/models/future-scaling") {
    sendJson(response, 200, {
      models: futureScalingModels,
      note: "These are optional future scale-up targets for model switching and benchmarking, not feature dependency downloads.",
    });
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
    sendJson(response, 200, {
      engines: runtimeStatus.audioEngines ?? [],
      voiceSession: runtimeStatus.voiceSession,
      voiceAssets: runtimeStatus.voiceAssets ?? [],
      toolStatuses: detectToolStatuses().filter((tool) => ["whisper-cli", "piper"].includes(tool.id)),
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
    const result = {
      primary: "openai/whisper-large-v3-turbo",
      status: whisperReady ? "ready-asset" : "missing",
      runtimeReady: Boolean(brainProbe && (brainProbe.status === "ready" || brainProbe.status === "ready-asset")),
      fallback: "Vosk streaming after feature download",
      brain: brainProbe,
      nextAction: whisperReady
        ? "Install/verify transformers+torch or whisper.cpp to run the ready Whisper asset."
        : "Place Whisper large-v3-turbo in the expected snapshot folder.",
    };
    events.publish("audio", { sttProbe: result });
    sendJson(response, 200, result);
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
    const hudEvent = {
      id: id("hud"),
      state: "recognizing",
      title: "Recognizing owner",
      summary: "Dry-run only. No biometric capture was performed.",
      createdAt: now(),
    };
    events.publish("identity", { action, decision, hudEvent, brain: brainIdentity });
    sendJson(response, 200, {
      action,
      decision,
      hudEvent,
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
    events.publish("audio", { voiceSession: nextSession });
    sendJson(response, 200, {
      voiceSession: nextSession,
      result: toolsReady
        ? nextSession.transcript.at(-1)
        : {
            status: "missing-engine",
            message: brainResult?.message ?? "No local Whisper snapshot or whisper.cpp binary was found for transcription.",
          },
      brain: brainResult,
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/audio/tts") {
    const body = (await readBody(request)) as Partial<TtsRequest> & { agentId?: string; voiceProfileId?: string };
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
    events.publish("audio", { tts: result });
    sendJson(response, 200, { tts: result });
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
    sendJson(response, 200, {
      status: "approval-gated",
      engines: [
        {
          id: "screen-capture",
          label: "Screen capture",
          status: status.connectors.find((connector) => connector.id === "screen")?.enabled ? "ready" : "requires-approval",
        },
        {
          id: "image-analysis",
          label: "Static image analysis",
          status: "ready",
        },
        {
          id: "webcam-identity",
          label: "Webcam identity",
          status: status.connectors.find((connector) => connector.id === "camera")?.enabled ? "ready" : "requires-approval",
        },
        {
          id: "ocr",
          label: "OCR",
          status: commandVersion("tesseract", ["--version"]).ok ? "ready" : "missing-dependency",
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

  if (request.method === "GET" && url.pathname === "/api/security/status") {
    sendJson(response, 200, {
      protectedCore: status.protectedCore,
      privacyMode: status.privacyMode,
      sentinel: status.agentSouls?.find((soul) => soul.id === "sentinel"),
      blockedCategories: ["network", "protected-core-access"],
      approvalCategories: [
        "delete-local",
        "send-message",
        "post-social",
        "purchase",
        "credential-access",
        "device-control",
        "model-download",
        "sensor-capture",
        "irreversible-edit",
      ],
    });
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

  if (request.method === "GET" && url.pathname === "/api/system/actions") {
    sendJson(response, 200, {
      actions: allowedLocalActions,
      count: allowedLocalActions.length,
      privacyMode: status.privacyMode,
      mode: "approved-admin",
      defaults: {
        approvalRequired: allowedLocalActions.filter((action) => action.approval === "requires_approval").map((action) => action.id),
        localOnly: true,
        undoWindowMinutes: 20,
      },
    });
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

    const timestamp = now();
    const conversation =
      (body.conversationId ? store.getConversation(body.conversationId) : undefined) ??
      createConversationFromPrompt(message, timestamp);
    store.upsertConversation({
      ...conversation,
      updatedAt: timestamp,
      title: conversation.title || message.slice(0, 72),
    });
    addTurn({
      conversationId: conversation.id,
      role: "user",
      content: message,
      timestamp,
    });

    const task = createTaskForTurn({
      conversationId: conversation.id,
      prompt: message,
      taskProfile: body.taskProfile ?? "daily-assistant",
      timestamp,
    });
    store.upsertTask(task);
    store.upsertQueueItem({
      taskId: task.id,
      status: "queued",
      priority: 10,
      enqueuedAt: timestamp,
    });
    const queued = taskEvent({
      id: id("task-event"),
      taskId: task.id,
      kind: "queued",
      message: "Task queued and ready for local execution.",
      createdAt: timestamp,
    });
    store.addTaskEvent(queued);
    events.publish("conversation", { conversation, task });
    events.publish("task", { task, event: queued });
    void runAssistantTask(task, message);
    sendJson(response, 202, { conversation, task, queued });
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
