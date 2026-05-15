import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { URL } from "node:url";
import {
  appendTranscriptChunk,
  applyTaskStatus,
  createModelDryRun,
  createOutboundMessageDraft,
  createSteeringEvent,
  createVoiceSession,
  evaluateActionPolicy,
  seededStatus,
  selectModelForTask,
  taskEvent,
  type ActionRequest,
  type Conversation,
  type ConversationTurn,
  type JarvisStatus,
  type MobilePairing,
  type ModelDryRunResult,
  type ModelSource,
  type MemoryWrite,
  type OutboundMessageDraft,
  type TaskRun,
  type TaskProfile,
  type RuntimeKind,
  type TtsRequest,
} from "@jarvis/core";
import { EventHub } from "./eventHub.js";
import { JarvisStore } from "./store.js";

const DEFAULT_PORT = 4317;
const HF_SNAPSHOT_ROOT = "C:\\Users\\user\\Downloads\\Secretary Jarvis\\models\\huggingface\\snapshots";
const VOICE_ASSET_ROOT = "C:\\Users\\user\\Downloads\\Secretary Jarvis\\jarvis\\assets\\voice";
const JSON_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type",
  "content-type": "application/json; charset=utf-8",
};

let status: JarvisStatus = structuredClone(seededStatus);
const store = new JarvisStore();
const events = new EventHub();
const socialDrafts: OutboundMessageDraft[] = [];
const mobilePairings: MobilePairing[] = [];

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, JSON_HEADERS);
  response.end(JSON.stringify(body, null, 2));
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
  return {
    ...status,
    models: status.models.map(hydrateModelState),
    audioEngines: (status.audioEngines ?? []).map(hydrateAudioEngineState),
    voiceAssets: (status.voiceAssets ?? []).filter((asset) => existsSync(`C:\\Users\\user\\Downloads\\Secretary Jarvis\\jarvis\\${asset.localPath}`)),
    startup: hydrateStartupState(),
    conversations: store.listConversations(),
    tasks: store.listTasks(),
    queue: store.listQueue(),
    mobilePairings,
    socialDrafts,
    toolStatuses: detectToolStatuses(),
  };
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
    backgroundServices: ["Ollama", "Python Brain", "TypeScript Gateway", "Dashboard/Tauri shell"],
    notes: registered
      ? ["Startup shortcut is registered for this Windows user.", "Services remain local-only at boot."]
      : [
          "Use scripts/register-startup-task.ps1 to create a Windows logon task or Startup shortcut.",
          "Startup launches local services only and keeps hosted inference disabled by default.",
        ],
  };
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

function runSimulatedTask(task: TaskRun, prompt: string): void {
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

  const response =
    "I captured this as an interruptible local task. The next implementation layer will route it through the Python Brain, MemoryOS recall, selected local model, and reviewer agent.";

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

function setupDoctor(): Record<string, unknown> {
  const tools = detectToolStatuses();
  const toolMap = new Map(tools.map((tool) => [tool.id, tool]));
  const tauriCliPaths = [
    "node_modules/.bin/tauri.cmd",
    "../node_modules/.bin/tauri.cmd",
    "../../node_modules/.bin/tauri.cmd",
  ];
  const hasTauriCli = tauriCliPaths.some((candidate) => existsSync(candidate));

  return {
    node: commandVersion("node", ["--version"]),
    python: commandVersion("python", ["--version"]),
    rustc: doctorEntryFromTool(toolMap.get("rustc")),
    cargo: doctorEntryFromTool(toolMap.get("cargo")),
    npm: commandVersion("cmd.exe", ["/d", "/s", "/c", "npm.cmd --version"]),
    ollama: doctorEntryFromTool(toolMap.get("ollama")),
    docker: commandVersion("docker", ["--version"]),
    tauriCli: {
      ok: hasTauriCli,
      output: hasTauriCli ? "local Tauri CLI installed" : "local Tauri CLI missing",
    },
    desktopRuntime: "Tauri-first. Electron is optional fallback and not required for the main Jarvis path.",
    localOnly: status.privacyMode === "strict-local",
    localInstallers: {
      ollama: localInstallerPath("OllamaSetup.exe"),
      rustup: localInstallerPath("rustup-init.exe"),
      cargoArchive: localInstallerPath("cargo-master.zip"),
    },
    tools,
  };
}

function doctorEntryFromTool(tool: NonNullable<JarvisStatus["toolStatuses"]>[number] | undefined): {
  ok: boolean;
  output: string;
} {
  return {
    ok: Boolean(tool?.installed),
    output: tool?.version ?? tool?.path ?? tool?.notes ?? "not detected",
  };
}

function detectToolStatuses(): NonNullable<JarvisStatus["toolStatuses"]> {
  return [
    toolStatus("ollama", "Ollama", "ollama", ["OllamaSetup.exe"], ["$env:LOCALAPPDATA\\Programs\\Ollama\\ollama.exe"]),
    toolStatus("rustc", "Rust compiler", "rustc", ["rustup-init.exe"], ["$env:USERPROFILE\\.cargo\\bin\\rustc.exe"]),
    toolStatus("cargo", "Cargo", "cargo", ["cargo-master.zip"], ["$env:USERPROFILE\\.cargo\\bin\\cargo.exe"]),
    toolStatus("hf", "Hugging Face CLI", "hf", [], [
      "$env:APPDATA\\Python\\Python313\\Scripts\\hf.exe",
      "$env:USERPROFILE\\.local\\bin\\hf.exe",
    ]),
    toolStatus("git-xet", "Git Xet", "git-xet", [], [
      "$env:APPDATA\\Python\\Python313\\site-packages\\hf_xet",
      "$env:LOCALAPPDATA\\Programs\\Git LFS\\git-xet.exe",
    ]),
    toolStatus("whisper-cli", "whisper.cpp", "whisper-cli", [], []),
    toolStatus("piper", "Piper TTS", "piper", [], []),
  ];
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

function toolStatus(
  idValue: string,
  label: string,
  command: string,
  installerNames: string[],
  candidatePaths: string[],
): NonNullable<JarvisStatus["toolStatuses"]>[number] {
  const version = commandVersion(command, ["--version"]);
  const installedPath = version.ok ? command : firstExistingPath(candidatePaths);
  const localInstaller = installerNames.map(localInstallerPath).find((candidate) => candidate !== undefined);
  return {
    id: idValue,
    label,
    command,
    installed: Boolean(installedPath),
    version: version.ok ? version.output : undefined,
    path: installedPath,
    localInstallerPath: localInstaller,
    notes: installedPath
      ? "Tool is available or found in a common local install path."
      : localInstaller
        ? "Tool is not on PATH, but a local installer/archive exists in the project parent directory."
        : "Tool is not available on PATH and no local installer/archive was found.",
  };
}

function firstExistingPath(paths: string[]): string | undefined {
  return paths.map(expandEnvPath).find((candidate) => existsSync(candidate));
}

function localInstallerPath(fileName: string): string | undefined {
  const candidate = `C:\\Users\\user\\Downloads\\Secretary Jarvis\\${fileName}`;
  return existsSync(candidate) ? candidate : undefined;
}

function expandEnvPath(input: string): string {
  return input
    .replace("$env:LOCALAPPDATA", process.env.LOCALAPPDATA ?? "")
    .replace("$env:USERPROFILE", process.env.USERPROFILE ?? "");
}

function commandVersion(command: string, args: string[]): { ok: boolean; output: string } {
  try {
    const output = execFileSync(command, args, { encoding: "utf8", timeout: 5000, windowsHide: true });
    return { ok: true, output: output.trim() };
  } catch (error) {
    return { ok: false, output: error instanceof Error ? error.message : String(error) };
  }
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

async function routeRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method === "OPTIONS") {
    response.writeHead(204, JSON_HEADERS);
    response.end();
    return;
  }

  const url = new URL(request.url ?? "/", "http://localhost");

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
    sendJson(response, 200, setupDoctor());
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

  if (request.method === "GET" && url.pathname === "/api/tasks") {
    sendJson(response, 200, {
      tasks: store.listTasks(),
      queue: store.listQueue(),
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/models") {
    const runtimeStatus = statusWithRuntimeState();
    sendJson(response, 200, {
      models: runtimeStatus.models,
      runtimeAdapters: runtimeStatus.runtimeAdapters ?? [],
      hardwareProfile: runtimeStatus.hardwareProfile,
      toolStatuses: detectToolStatuses(),
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

  if (request.method === "GET" && url.pathname === "/api/audio/status") {
    const runtimeStatus = statusWithRuntimeState();
    sendJson(response, 200, {
      engines: runtimeStatus.audioEngines ?? [],
      voiceSession: runtimeStatus.voiceSession,
      voiceAssets: runtimeStatus.voiceAssets ?? [],
      toolStatuses: detectToolStatuses().filter((tool) => ["whisper-cli", "piper"].includes(tool.id)),
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/audio/transcribe-file") {
    const body = (await readBody(request)) as { filePath?: string };
    const timestamp = now();
    const localWhisperReady = existsSync(`${HF_SNAPSHOT_ROOT}\\openai__whisper-large-v3-turbo`);
    const toolsReady =
      localWhisperReady || detectToolStatuses().some((tool) => tool.id === "whisper-cli" && tool.installed);
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
            text: `Transcription placeholder for ${body.filePath ?? "uploaded local audio"}.`,
            startMs: 0,
            endMs: 1000,
            confidence: localWhisperReady ? 0.9 : 0.82,
            engineId: localWhisperReady ? "whisper-large-v3-turbo" : session.sttEngineId,
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
            message: "No local Whisper snapshot or whisper.cpp binary was found for transcription.",
          },
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/audio/tts") {
    const body = (await readBody(request)) as Partial<TtsRequest>;
    const piperReady = detectToolStatuses().some((tool) => tool.id === "piper" && tool.installed);
    const voiceSample = `${VOICE_ASSET_ROOT}\\jarvis.mp3`;
    const result = {
      requestId: body.id ?? id("tts"),
      status: piperReady || existsSync(voiceSample) ? "ready" : "missing-engine",
      audioPath: piperReady ? "data/audio/tts/latest.wav" : existsSync(voiceSample) ? "assets/voice/jarvis.mp3" : undefined,
      message: piperReady
        ? "Piper TTS request accepted for local synthesis."
        : existsSync(voiceSample)
          ? "Piper is not installed yet; using the supplied Jarvis voice sample for local playback."
          : "Piper is not installed or not on PATH. TTS is wired but cannot synthesize yet.",
    };
    events.publish("audio", { tts: result });
    sendJson(response, 200, { tts: result });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/connectors") {
    sendJson(response, 200, {
      connectors: status.connectors,
      socialDrafts,
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
    runSimulatedTask(task, message);
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
    const selected = selectModelForTask({
      taskProfile,
      scaleProfile: status.scaleProfile,
      models: status.models,
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
