export type PrivacyMode = "strict-local" | "local-hybrid-disabled" | "trusted-lan";

export type ScaleProfile = "laptop" | "workstation" | "homelab";

export type Modality =
  | "text"
  | "code"
  | "vision"
  | "image"
  | "video"
  | "audio"
  | "music"
  | "speech"
  | "maps"
  | "research"
  | "embedding";

export type TaskProfile =
  | "daily-assistant"
  | "deep-reasoning"
  | "coding"
  | "research"
  | "rag"
  | "screen-vision"
  | "image-generation"
  | "video-generation"
  | "audio-transcription"
  | "voice-cloning"
  | "tts"
  | "music-generation"
  | "maps-geospatial";

export type RuntimeKind =
  | "ollama"
  | "lmstudio"
  | "llama-cpp"
  | "vllm"
  | "sglang"
  | "huggingface-local"
  | "huggingface-tgi"
  | "lan-local";

export type ModelSafety = "local-only" | "lan-only" | "disabled-cloud";

export type ModelSource =
  | "ollama-library"
  | "huggingface"
  | "gguf-local"
  | "openai-compatible-lan"
  | "docker-model-runner"
  | "disabled-hosted";

export type InstallState = "available" | "missing" | "staged" | "installed" | "disabled";

export type ModelDownloadState = "complete" | "partial" | "missing" | "not-required";

export type ModelRuntimeState =
  | "ready"
  | "ready-asset"
  | "needs-runtime"
  | "too-heavy"
  | "future-scaling"
  | "disabled"
  | "missing";

export type HardwareFit = "laptop-ready" | "laptop-staged" | "workstation" | "homelab" | "external-endpoint";

export interface ModelArtifact {
  source: ModelSource;
  repoId?: string;
  localPath?: string;
  quantization?: string;
  estimatedSizeGb?: number;
  gated?: boolean;
  license?: string;
}

export interface ModelProfile {
  id: string;
  label: string;
  runtime: RuntimeKind;
  modelRef: string;
  modalities: Modality[];
  taskProfiles: TaskProfile[];
  scale: ScaleProfile;
  safety: ModelSafety;
  enabled: boolean;
  recommendedMemoryGb: number;
  recommendedVramGb?: number;
  contextWindow?: number;
  source?: ModelSource;
  installState?: InstallState;
  artifact?: ModelArtifact;
  benchmarkScore?: number;
  notes: string;
}

export interface ReadyModelAsset {
  id: string;
  profileId: string;
  label: string;
  modelRef: string;
  localPath: string;
  primaryUse: string;
  runtimeAdapters: RuntimeKind[];
  hardwareFit: HardwareFit;
  detected?: boolean;
  detectedPath?: string;
  setupNotes?: string[];
}

export interface NeededFeatureDownload {
  id: string;
  category: "voice" | "vision" | "media" | "maps" | "connector";
  label: string;
  purpose: string;
  expectedPath: string;
  installHint: string;
  status: "needed" | "detected" | "optional";
  plugsInto: string[];
}

export interface FutureScalingModel {
  id: string;
  label: string;
  modelRef: string;
  scale: ScaleProfile;
  purpose: string;
  expectedRuntime: RuntimeKind;
  expectedPath?: string;
  notes: string;
}

export interface ModelReadiness {
  modelId: string;
  label: string;
  modelRef: string;
  downloadState: ModelDownloadState;
  runtimeState: ModelRuntimeState;
  hardwareFit: HardwareFit;
  artifactPath?: string;
  runtimePlan: string;
  missingFiles: string[];
  recommendedUse: string;
  nextAction: string;
  runtimeProbe?: RuntimeProbe;
}

export interface ModelAssetManifest {
  id: string;
  catalog: "ready" | "future-scaling";
  label: string;
  modelRef: string;
  localPath?: string;
  exists: boolean;
  status: "complete" | "partial" | "missing" | "metadata-only";
  fileCount: number;
  sizeBytes: number;
  hasConfig: boolean;
  hasTokenizer: boolean;
  hasProcessor: boolean;
  weightFileCount: number;
  indexFileCount: number;
  indexedShardCount: number;
  missingIndexedShards: string[];
  requiredFilesMissing: string[];
  notes: string[];
}

export type RuntimeProbeStatus =
  | "ready"
  | "served"
  | "asset-ready"
  | "missing-tool"
  | "missing-model"
  | "needs-endpoint"
  | "too-heavy"
  | "disabled"
  | "error";

export interface RuntimeProbe {
  id: string;
  modelId: string;
  modelRef: string;
  runtime: RuntimeKind;
  status: RuntimeProbeStatus;
  ok: boolean;
  safeMode: boolean;
  checkedAt: string;
  latencyMs: number;
  endpoint?: string;
  command?: string;
  artifactPath?: string;
  fileCount?: number;
  sizeBytes?: number;
  estimatedMemoryGb?: number;
  notes: string[];
  blockers: string[];
}

export interface RuntimeAdapter {
  id: RuntimeKind;
  label: string;
  source: ModelSource;
  toolCommand?: string;
  localOnly: boolean;
  enabledByDefault: boolean;
}

export interface ModelInstallPlan {
  id: string;
  modelRef: string;
  source: ModelSource;
  runtime: RuntimeKind;
  commandPreview: string;
  localCachePath: string;
  estimatedSizeGb?: number;
  requiresApproval: boolean;
  localOnly: boolean;
  notes: string[];
  blockers: string[];
}

export interface ModelDryRunResult {
  modelRef: string;
  source: ModelSource;
  canEstimate: boolean;
  willDownload: boolean;
  estimatedSizeGb?: number;
  installPlan: ModelInstallPlan;
  approvalAction: ActionRequest;
}

export interface BenchmarkRun {
  id: string;
  modelId: string;
  taskProfile: TaskProfile;
  promptTokens: number;
  outputTokens: number;
  latencyMs: number;
  tokensPerSecond: number;
  createdAt: string;
  notes: string;
}

export interface HardwareProfile {
  id: string;
  label: string;
  totalRamGb: number;
  gpuName: string;
  vramGb: number;
  acceleration: "cpu" | "cuda" | "rocm-optional" | "metal" | "unknown";
  notes: string[];
}

export type RiskLevel = "safe" | "approval-required" | "blocked";

export type ActionCategory =
  | "read-local"
  | "write-local"
  | "delete-local"
  | "run-script"
  | "app-control"
  | "window-control"
  | "service-control"
  | "network"
  | "send-message"
  | "post-social"
  | "purchase"
  | "credential-access"
  | "device-control"
  | "model-download"
  | "sensor-capture"
  | "irreversible-edit"
  | "protected-core-access";

export interface ActionRequest {
  id: string;
  title: string;
  category: ActionCategory;
  target: string;
  reason: string;
  connectorId?: string;
  agentId?: string;
  dataTouched: string[];
}

export interface PolicyDecision {
  actionId: string;
  decision: "allow" | "deny" | "requires_approval";
  risk: RiskLevel;
  reasons: string[];
}

export type MemoryKind =
  | "session"
  | "daily-note"
  | "semantic"
  | "timeline"
  | "identity"
  | "decision"
  | "skill"
  | "soul"
  | "device-event"
  | "screen-event";

export interface MemoryEvent {
  id: string;
  kind: MemoryKind;
  title: string;
  summary: string;
  source: string;
  timestamp: string;
  confidence: number;
  tags: string[];
}

export type ConversationRole = "user" | "assistant" | "system" | "tool";

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  summary: string;
  tokenBudget: number;
}

export interface ConversationTurn {
  id: string;
  conversationId: string;
  role: ConversationRole;
  content: string;
  createdAt: string;
  taskId?: string;
  tokenEstimate: number;
}

export type TaskStatus =
  | "queued"
  | "running"
  | "paused"
  | "waiting-approval"
  | "checkpointed"
  | "completed"
  | "failed"
  | "cancelled";

export type InterruptPolicy = "soft-steer" | "hard-cancel" | "parallel-branch";

export interface TaskRun {
  id: string;
  conversationId: string;
  title: string;
  status: TaskStatus;
  activeAgentId: string;
  taskProfile: TaskProfile;
  createdAt: string;
  updatedAt: string;
  checkpoint?: string;
  result?: string;
}

export interface TaskQueueItem {
  taskId: string;
  status: TaskStatus;
  priority: number;
  enqueuedAt: string;
  startedAt?: string;
  finishedAt?: string;
}

export type TaskEventKind =
  | "queued"
  | "started"
  | "token"
  | "tool"
  | "memory-write"
  | "steered"
  | "interrupted"
  | "checkpoint"
  | "cancelled"
  | "completed"
  | "failed";

export interface TaskEvent {
  id: string;
  taskId: string;
  kind: TaskEventKind;
  message: string;
  createdAt: string;
  payload?: Record<string, unknown>;
}

export interface SteeringEvent {
  id: string;
  taskId: string;
  instruction: string;
  policy: InterruptPolicy;
  createdAt: string;
}

export interface StreamEvent {
  id: string;
  type:
    | "status"
    | "conversation"
    | "task"
    | "memory"
    | "approval"
    | "token"
    | "setup"
    | "model"
    | "audio"
    | "connector"
    | "mobile"
    | "report"
    | "map"
    | "vision"
    | "identity"
    | "device"
    | "security"
    | "performance";
  createdAt: string;
  payload: Record<string, unknown>;
}

export type HudState =
  | "idle"
  | "wake"
  | "listening"
  | "recognizing"
  | "thinking"
  | "planning"
  | "executing"
  | "speaking"
  | "approval"
  | "error";

export interface HudStreamEvent {
  id: string;
  state: HudState;
  brief: string;
  detailRef?: string;
  severity: "info" | "success" | "warning" | "danger";
  icon: string;
  actionButtons: Array<"more-details" | "approve" | "deny" | "undo" | "open-dashboard" | "mute">;
  createdAt: string;
}

export interface MemoryWrite {
  id: string;
  conversationId?: string;
  taskId?: string;
  kind: MemoryKind;
  content: string;
  importance: number;
  createdAt: string;
  tags: string[];
}

export interface AgentProfile {
  id: string;
  name: string;
  role: string;
  soulPath: string;
  modelProfileId: string;
  permissions: ActionCategory[];
  status: "idle" | "listening" | "planning" | "executing" | "reviewing" | "waiting-approval" | "sleeping";
}

export interface AgentSoul {
  id: string;
  name: string;
  role: string;
  personality: string;
  voiceProfileId: string;
  modelPreference: string;
  memoryScope: MemoryKind[];
  permissions: ActionCategory[];
  status: AgentProfile["status"];
}

export interface SkillManifest {
  id: string;
  name: string;
  description: string;
  permissions: ActionCategory[];
  source: "jarvis" | "openclaw-reference" | "ruflo-reference" | "user";
  enabled: boolean;
}

export type ConnectorKind =
  | "filesystem"
  | "local-app"
  | "dev-tool"
  | "discord"
  | "telegram"
  | "whatsapp"
  | "email"
  | "slack"
  | "social-outbox"
  | "iot"
  | "maps"
  | "camera"
  | "screen";

export type ConnectorCredentialStatus = "not-configured" | "configured" | "expired" | "not-required";

export interface ConnectorManifest {
  id: string;
  name: string;
  category: "software" | "device" | "social" | "developer" | "media" | "maps";
  kind?: ConnectorKind;
  credentialStatus?: ConnectorCredentialStatus;
  permissions: ActionCategory[];
  dataTouched: string[];
  approvalRequired: ActionCategory[];
  enabled: boolean;
  rollback: "none" | "best-effort" | "transactional";
}

export interface ConnectorDryRun {
  id: string;
  connectorId: string;
  action: ActionCategory;
  target: string;
  preview: string;
  decision: PolicyDecision;
  createdAt: string;
  auditSummary: string;
}

export interface OutboundMessageDraft {
  id: string;
  connectorId: string;
  recipient: string;
  channel: string;
  content: string;
  createdAt: string;
  status: "draft" | "waiting-approval" | "approved" | "sent" | "blocked";
  approvalActionId: string;
  rollback: "none" | "best-effort";
  auditSummary: string;
}

export type AudioEngineKind = "whisper-transformers" | "whisper-cpp" | "vosk" | "piper";

export interface AudioEngine {
  id: string;
  kind: AudioEngineKind;
  label: string;
  role: "stt" | "tts" | "vad";
  command?: string;
  modelRef?: string;
  installed: boolean;
  status: "ready" | "missing" | "planned";
  notes: string;
}

export interface VadSegment {
  id: string;
  startMs: number;
  endMs: number;
  confidence: number;
}

export interface TranscriptChunk {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  confidence: number;
  engineId: string;
  final: boolean;
}

export interface TtsRequest {
  id: string;
  text: string;
  voiceId: string;
  engineId: string;
  createdAt: string;
}

export interface TtsResult {
  requestId: string;
  status: "ready" | "missing-engine" | "failed";
  audioPath?: string;
  message: string;
}

export interface VoiceSession {
  id: string;
  state: "idle" | "listening" | "transcribing" | "speaking" | "missing-tools" | "error";
  sttEngineId: string;
  ttsEngineId: string;
  vadEnabled: boolean;
  transcript: TranscriptChunk[];
  updatedAt: string;
  message: string;
}

export interface VoiceAsset {
  id: string;
  label: string;
  fileName: string;
  localPath: string;
  role: "intro" | "morning" | "identity" | "sample";
  durationHint?: string;
  notes: string;
}

export interface VoiceProfile {
  id: string;
  agentId: string;
  label: string;
  enginePreference: "windows-sapi" | "piper" | "voice-sample" | "future-clone";
  sampleAssetId?: string;
  style: string;
  status: "ready" | "staged" | "missing-dependency";
}

export type VoiceProbeStatus = "ready" | "ready-asset" | "staged" | "missing" | "unavailable";

export interface VoiceRuntimeProbe {
  id: string;
  label: string;
  kind: "stt" | "tts" | "vad" | "wake-word" | "identity-sample";
  status: VoiceProbeStatus;
  installed: boolean;
  path?: string;
  runtime?: string;
  notes: string[];
}

export interface VoiceRuntimeReadiness {
  primaryStt: VoiceRuntimeProbe;
  tts: VoiceRuntimeProbe[];
  fallbackStt: VoiceRuntimeProbe[];
  vad: VoiceRuntimeProbe;
  wakeWord: VoiceRuntimeProbe;
  identitySamples: VoiceRuntimeProbe[];
  summary: {
    sttReady: boolean;
    ttsReady: boolean;
    sampleCount: number;
    missingRequired: number;
  };
  privacy: {
    micCaptureActive: boolean;
    speakingActive: boolean;
    note: string;
  };
}

export type IdentityFactor = "voice" | "face" | "device" | "passphrase";

export interface IdentityProfile {
  id: string;
  label: string;
  role: "owner" | "trusted-user" | "guest";
  trusted: boolean;
  factors: IdentityFactor[];
  voiceProfileId?: string;
  voiceAssetIds: string[];
  faceModelStatus: "locked" | "staged" | "ready";
  speakerModelStatus: "locked" | "staged" | "ready";
  permissionMode: "owner-approved" | "limited" | "locked";
  privacyNote: string;
  updatedAt: string;
}

export interface IdentityReadiness {
  status: "ready" | "staged" | "requires-approval" | "missing-dependency";
  ownerProfileId: string;
  voiceVerification: {
    status: "ready" | "staged" | "missing-dependency";
    sampleCount: number;
    packages: string[];
  };
  faceRecognition: {
    status: "ready" | "staged" | "requires-approval" | "missing-dependency";
    cameraStatus: "locked" | "requires-approval" | "ready";
    packages: string[];
  };
  trustedDevices: string[];
  privacyLocks: string[];
  notes: string[];
}

export type VisionEngineStatus = "ready" | "ready-asset" | "requires-approval" | "missing-dependency" | "staged" | "locked";

export interface VisionRuntimeProbe {
  id: string;
  label: string;
  kind: "image-understanding" | "ocr" | "object-detection" | "screen-capture" | "camera" | "runtime-package";
  status: VisionEngineStatus;
  installed: boolean;
  path?: string;
  runtime?: string;
  notes: string[];
}

export interface VisionRuntimeReadiness {
  modelAssets: VisionRuntimeProbe[];
  ocr: VisionRuntimeProbe;
  objectDetection: VisionRuntimeProbe;
  packages: VisionRuntimeProbe[];
  screenCapture: VisionRuntimeProbe;
  camera: VisionRuntimeProbe;
  summary: {
    localVisionAssets: number;
    ocrReady: boolean;
    objectDetectionReady: boolean;
    approvalGatedSensors: number;
    missingFeatureDependencies: number;
  };
  privacy: {
    screenCaptureActive: boolean;
    cameraCaptureActive: boolean;
    note: string;
  };
}

export type RuntimeConstellationStatus = "ready" | "ready-asset" | "staged" | "attention" | "locked";

export interface RuntimeConstellationNode {
  id: string;
  label: string;
  kind: "models" | "voice" | "vision" | "privacy" | "setup";
  status: RuntimeConstellationStatus;
  value: string;
  detail: string;
  tone: "cyan" | "green" | "amber" | "magenta";
}

export interface RuntimeConstellation {
  id: string;
  localOnly: boolean;
  updatedAt: string;
  nodes: RuntimeConstellationNode[];
  summary: {
    ready: number;
    staged: number;
    attention: number;
    locked: number;
  };
  note: string;
}

export interface SetupActionItem {
  id: string;
  label: string;
  status: "detected" | "needed" | "optional" | "future" | "disabled";
  purpose: string;
  expectedPath?: string;
  actionLabel: string;
  approvalRequired: boolean;
}

export interface SetupActionGroup {
  id: string;
  label: string;
  kind: "needed-feature-downloads" | "future-scaling-models";
  summary: string;
  items: SetupActionItem[];
}

export interface RuntimeSmokeStatus {
  ok: boolean;
  status: "passed" | "failed" | "missing";
  summaryPath: string;
  createdAt?: string;
  checks: Array<{
    name: string;
    ok: boolean;
    url?: string;
    statusCode?: number;
    error?: string;
  }>;
  message: string;
}

export type RuntimeServiceId = "brain" | "gateway" | "dashboard" | "hud-renderer" | "electron-hud" | "ollama";

export interface RuntimeServiceHeartbeat {
  id: RuntimeServiceId;
  label: string;
  status: "online" | "degraded" | "offline" | "unknown";
  pid?: number;
  pidAlive: boolean;
  url?: string;
  httpOk: boolean;
  checkedAt: string;
  detail: string;
}

export interface RuntimeServicesStatus {
  localOnly: boolean;
  checkedAt: string;
  services: RuntimeServiceHeartbeat[];
  summary: {
    online: number;
    degraded: number;
    offline: number;
    unknown: number;
  };
  note: string;
}

export interface SystemAction {
  id: string;
  label: string;
  category: ActionCategory;
  command: string;
  target: string;
  reversible: boolean;
  approvalRequired: boolean;
  rollbackNote: string;
  status: "draft" | "waiting-approval" | "approved" | "executed" | "undone" | "blocked" | "expired";
  createdAt: string;
  expiresAt?: string;
  actionRequest: ActionRequest;
  decision: PolicyDecision;
}

export interface UndoJournalEntry {
  id: string;
  actionId: string;
  label: string;
  target: string;
  reversible: boolean;
  status: "available" | "restored" | "expired" | "not-reversible";
  createdAt: string;
  expiresAt: string;
  rollbackNote: string;
  snapshotSummary: string;
  snapshot?: {
    kind: "file-content" | "state-marker" | "none";
    path?: string;
    sizeBytes?: number;
    modifiedAt?: string;
    sha256?: string;
    contentBase64?: string;
    capturedAt: string;
  };
  operation: {
    kind: ActionCategory;
    command: string;
    dryRunOnly: boolean;
    restoreStrategy: "copy-back" | "move-back" | "config-restore" | "state-marker" | "none";
  };
}

export interface ReferenceSource {
  id: string;
  name: string;
  kind: "openclaw" | "ruflo" | "jarvis-version" | "tooling";
  localPath: string;
  license: "mit" | "apache-2.0" | "unknown" | "mixed";
  status: "vendored-reference" | "audited" | "adopted";
  adoptedPatterns: string[];
  notes: string;
}

export interface StartupState {
  mode: "manual" | "startup-task-ready" | "startup-task-registered";
  scriptPath: string;
  backgroundServices: string[];
  notes: string[];
}

export interface MobilePairing {
  id: string;
  tokenPreview: string;
  baseUrl: string;
  status: "pending" | "confirmed" | "revoked";
  createdAt: string;
  expiresAt: string;
  deviceName?: string;
}

export interface ToolStatus {
  id: string;
  label: string;
  command: string;
  installed: boolean;
  version?: string;
  path?: string;
  localInstallerPath?: string;
  notes: string;
}

export interface ProtectedCoreStatus {
  mode: "sealed" | "developer-approved";
  protectedPaths: string[];
  deniedPatterns: string[];
  lastDecision: string;
}

export interface ReportMetric {
  label: string;
  value: string;
  trend?: "up" | "down" | "flat";
}

export interface ReportSnapshot {
  id: string;
  title: string;
  kind: "daily" | "project" | "security" | "performance";
  status: "ready" | "live" | "needs-data";
  summary: string;
  metrics: ReportMetric[];
  createdAt: string;
}

export interface MapPin {
  id: string;
  label: string;
  lat: number;
  lng: number;
  status: "home" | "device" | "planned" | "unknown";
}

export interface MapInsight {
  id: string;
  label: string;
  query: string;
  center: { lat: number; lng: number };
  zoom: number;
  pins: MapPin[];
  route?: {
    label: string;
    distanceKm: number;
    etaMinutes: number;
  };
  notes: string;
}

export interface VisionInsight {
  id: string;
  source: string;
  mode: "camera" | "screen" | "image";
  status: "ready" | "needs-input" | "requires-approval" | "blocked";
  summary: string;
  observations: string[];
  createdAt: string;
}

export interface DeviceLink {
  id: string;
  name: string;
  kind: "desktop" | "phone" | "camera" | "microphone" | "speaker" | "browser" | "vscode" | "terminal" | "smart-home";
  status: "online" | "offline" | "locked";
  permissions: ActionCategory[];
  lastSeen: string;
  approvalRequired: boolean;
}

export interface PerformanceSnapshot {
  id: string;
  tokensPerSecond: number;
  contextWindow: number;
  queueLatencyMs: number;
  memoryRecallMs: number;
  activeModelId: string;
  updatedAt: string;
  notes: string;
}

export interface JarvisStatus {
  privacyMode: PrivacyMode;
  scaleProfile: ScaleProfile;
  activeModelId: string;
  models: ModelProfile[];
  readyModelAssets?: ReadyModelAsset[];
  neededFeatureDownloads?: NeededFeatureDownload[];
  futureScalingModels?: FutureScalingModel[];
  modelReadiness?: ModelReadiness[];
  runtimeAdapters?: RuntimeAdapter[];
  hardwareProfile?: HardwareProfile;
  audioEngines?: AudioEngine[];
  voiceSession?: VoiceSession;
  voiceAssets?: VoiceAsset[];
  voiceProfiles?: VoiceProfile[];
  identityProfiles?: IdentityProfile[];
  identityReadiness?: IdentityReadiness;
  agentSouls?: AgentSoul[];
  referenceSources?: ReferenceSource[];
  startup?: StartupState;
  agents: AgentProfile[];
  memories: MemoryEvent[];
  skills: SkillManifest[];
  connectors: ConnectorManifest[];
  pendingApprovals: ActionRequest[];
  conversations?: Conversation[];
  tasks?: TaskRun[];
  queue?: TaskQueueItem[];
  mobilePairings?: MobilePairing[];
  socialDrafts?: OutboundMessageDraft[];
  toolStatuses?: ToolStatus[];
  protectedCore?: ProtectedCoreStatus;
  undoJournal?: UndoJournalEntry[];
  hudEvents?: HudStreamEvent[];
  reports?: ReportSnapshot[];
  mapOverlays?: MapInsight[];
  visionInsights?: VisionInsight[];
  devices?: DeviceLink[];
  performance?: PerformanceSnapshot;
  lastEvolutionReport: string;
}
