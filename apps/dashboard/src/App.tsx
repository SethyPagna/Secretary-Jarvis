import {
  Activity,
  BarChart3,
  Brain,
  Cable,
  Camera,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Cpu,
  Database,
  Download,
  Eye,
  Fingerprint,
  FolderDown,
  GitBranch,
  Gauge,
  HardDrive,
  Image,
  Layers3,
  ListTree,
  Lock,
  Map,
  MapPin,
  MessageSquare,
  Mic,
  Minimize2,
  Music,
  Navigation,
  Network,
  Play,
  Radar,
  Radio,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TerminalSquare,
  Undo2,
  Video,
  Volume2,
  Wrench,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  evaluateActionPolicy,
  seededStatus,
  type ActionRequest,
  type AgentProfile,
  type ConversationTurn,
  type MobilePairing,
  type MemoryWrite,
  type ModelReadiness,
  type ModelDryRunResult,
  type NeededFeatureDownload,
  type JarvisStatus,
  type ModelProfile,
  type ReadyModelAsset,
  type OutboundMessageDraft,
  type PrivacyMode,
  type ScaleProfile,
  type StreamEvent,
  type FutureScalingModel,
  type UndoJournalEntry,
  type TaskRun,
  type TaskProfile,
} from "@jarvis/core";

const API_BASE_URL = import.meta.env.VITE_JARVIS_GATEWAY_URL ?? "http://127.0.0.1:4317";
const API_STATUS_URL = `${API_BASE_URL}/api/status`;
const TASKS: Array<{ id: TaskProfile; label: string }> = [
  { id: "daily-assistant", label: "Daily" },
  { id: "deep-reasoning", label: "Reason" },
  { id: "coding", label: "Code" },
  { id: "research", label: "Research" },
  { id: "rag", label: "Memory" },
  { id: "screen-vision", label: "Vision" },
  { id: "image-generation", label: "Image" },
  { id: "video-generation", label: "Video" },
  { id: "music-generation", label: "Music" },
  { id: "maps-geospatial", label: "Maps" },
  { id: "tts", label: "Speak" },
];

const MODALITIES = [
  { label: "Text", icon: Brain, state: "wired" },
  { label: "Speech", icon: Mic, state: "planned" },
  { label: "Vision", icon: Eye, state: "planned" },
  { label: "Image", icon: Image, state: "adapter" },
  { label: "Video", icon: Video, state: "adapter" },
  { label: "Audio", icon: Volume2, state: "planned" },
  { label: "Music", icon: Music, state: "adapter" },
  { label: "Maps", icon: Map, state: "adapter" },
];

interface ModelDryRunResponse {
  dryRun: ModelDryRunResult;
  decision: { decision: string; reasons: string[] };
}

interface BrainCapability {
  id: string;
  label: string;
  kind: string;
  status: string;
  installed: boolean;
  details: string;
}

interface BrainStatusResponse {
  online: boolean;
  url: string;
  health?: { buildId?: string; readyCapabilities?: string[] };
  capabilities?: { capabilities?: BrainCapability[] };
  audio?: Record<string, unknown>;
  vision?: Record<string, unknown>;
}

interface DoctorStatus {
  tools?: Array<{ id: string; label: string; installed: boolean; version?: string; path?: string; notes: string }>;
  localOnly?: boolean;
  tauriCli?: { ok: boolean; output: string };
}

interface BenchmarkResponse {
  benchmark: {
    id: string;
    modelId: string;
    taskProfile: TaskProfile;
    latencyMs: number;
    tokensPerSecond: number;
    notes: string;
  };
}

async function loadStatus(): Promise<JarvisStatus> {
  const response = await fetch(API_STATUS_URL);
  if (!response.ok) {
    throw new Error(`Gateway returned ${response.status}`);
  }
  return (await response.json()) as JarvisStatus;
}

function activeModel(status: JarvisStatus): ModelProfile {
  return status.models.find((model) => model.id === status.activeModelId) ?? status.models[0];
}

function localPolicyDecision(action: ActionRequest, status: JarvisStatus) {
  return evaluateActionPolicy({
    action,
    privacyMode: status.privacyMode,
    allowedConnectors: status.connectors.filter((connector) => connector.enabled).map((connector) => connector.id),
  });
}

function FloatingJarvisOrb({ status }: { status: JarvisStatus }) {
  const model = activeModel(status);
  const [minimized, setMinimized] = useState(false);

  return (
    <aside className={minimized ? "floating-orb minimized" : "floating-orb"} aria-label="Jarvis floating presence">
      <div className="orb-core">
        <div className="orb-ring ring-a" />
        <div className="orb-ring ring-b" />
        <div className="orb-pulse" />
        <Brain size={30} aria-hidden="true" />
      </div>
      {!minimized && <div className="orb-label">
        <strong>Jarvis</strong>
        <span>{model.label}</span>
      </div>}
      <button className="orb-minimize" type="button" onClick={() => setMinimized((value) => !value)} aria-label="Toggle floating Jarvis">
        <Minimize2 size={16} aria-hidden="true" />
      </button>
    </aside>
  );
}

function Header({ status, onEmergencyStop }: { status: JarvisStatus; onEmergencyStop: () => Promise<void> }) {
  return (
    <header className="topbar">
      <div className="brand-lockup">
        <div className="brand-mark">
          <Sparkles size={20} aria-hidden="true" />
        </div>
        <div>
          <h1>Jarvis</h1>
          <p>Local intelligence control room</p>
        </div>
      </div>
      <div className="topbar-actions">
        <div className="security-pill">
          <Lock size={16} aria-hidden="true" />
          {status.privacyMode}
        </div>
        <button className="icon-button danger-button" type="button" aria-label="Emergency stop" onClick={onEmergencyStop}>
          <XCircle size={20} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

function SystemSummary({ status }: { status: JarvisStatus }) {
  const enabledModels = status.models.filter((model) => model.enabled).length;
  const enabledConnectors = status.connectors.filter((connector) => connector.enabled).length;

  return (
    <section className="summary-grid" aria-label="System summary">
      <article className="summary-tile accent-cyan">
        <ShieldCheck size={22} aria-hidden="true" />
        <span>Guardrails</span>
        <strong>Core</strong>
      </article>
      <article className="summary-tile accent-green">
        <Cpu size={22} aria-hidden="true" />
        <span>Models enabled</span>
        <strong>{enabledModels}</strong>
      </article>
      <article className="summary-tile accent-amber">
        <GitBranch size={22} aria-hidden="true" />
        <span>Agents online</span>
        <strong>{status.agents.length}</strong>
      </article>
      <article className="summary-tile accent-rose">
        <Cable size={22} aria-hidden="true" />
        <span>Connectors</span>
        <strong>{enabledConnectors}</strong>
      </article>
    </section>
  );
}

function ModeDock({ status }: { status: JarvisStatus }) {
  const modes = [
    { label: "Chat", icon: Brain, active: true },
    { label: "Voice", icon: Mic, active: status.voiceSession?.state === "listening" },
    { label: "Vision", icon: Camera, active: (status.visionInsights ?? []).some((item) => item.status === "ready") },
    { label: "Maps", icon: Navigation, active: (status.mapOverlays ?? []).length > 0 },
    { label: "Reports", icon: BarChart3, active: (status.reports ?? []).some((report) => report.status === "live") },
    { label: "Devices", icon: Network, active: (status.devices ?? []).some((device) => device.status === "online") },
    { label: "Core", icon: ShieldCheck, active: status.protectedCore?.mode === "sealed" },
  ];

  return (
    <nav className="mode-dock" aria-label="Jarvis modes">
      {modes.map((mode) => {
        const Icon = mode.icon;
        return (
          <button className={mode.active ? "active" : ""} type="button" key={mode.label} title={mode.label}>
            <Icon size={19} aria-hidden="true" />
            <span>{mode.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function ModelHub({ status, onTaskSelect }: { status: JarvisStatus; onTaskSelect: (task: TaskProfile) => void }) {
  const model = activeModel(status);

  return (
    <section className="panel model-panel">
      <div className="panel-header">
        <div>
          <h2>Model Hub</h2>
          <p>Automatic local routing with manual override controls.</p>
        </div>
        <Cpu size={22} aria-hidden="true" />
      </div>
      <div className="active-model">
        <div>
          <span>Active runtime</span>
          <strong>{model.runtime}</strong>
        </div>
        <div>
          <span>Model ref</span>
          <strong>{model.modelRef}</strong>
        </div>
        <div>
          <span>Scale</span>
          <strong>{model.scale}</strong>
        </div>
      </div>
      <div className="task-strip" aria-label="Task routing profiles">
        {TASKS.map((task) => (
          <button key={task.id} type="button" onClick={() => onTaskSelect(task.id)}>
            {task.label}
          </button>
        ))}
      </div>
      <div className="model-list">
        {status.models.map((item) => (
          <div className={item.id === model.id ? "model-row selected" : "model-row"} key={item.id}>
            <div>
              <strong>{item.label}</strong>
              <span>{item.notes}</span>
            </div>
            <em>{item.enabled ? "ready" : "staged"}</em>
          </div>
        ))}
      </div>
    </section>
  );
}

function ModelCatalogPanel({ status, onRefresh }: { status: JarvisStatus; onRefresh: () => Promise<void> }) {
  const [dryRun, setDryRun] = useState<ModelDryRunResponse | null>(null);
  const [benchmark, setBenchmark] = useState<BenchmarkResponse["benchmark"] | null>(null);
  const [busyModelRef, setBusyModelRef] = useState<string | null>(null);

  async function runDryRun(model: ModelProfile) {
    setBusyModelRef(model.modelRef);
    try {
      const response = await fetch(`${API_BASE_URL}/api/models/dry-run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ modelRef: model.modelRef, source: model.source }),
      });
      if (!response.ok) {
        throw new Error("Model dry-run failed");
      }
      setDryRun((await response.json()) as ModelDryRunResponse);
    } finally {
      setBusyModelRef(null);
    }
  }

  async function selectModel(model: ModelProfile) {
    const response = await fetch(`${API_BASE_URL}/api/models/${encodeURIComponent(model.id)}/select`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!response.ok) {
      throw new Error("Model select failed");
    }
    await onRefresh();
  }

  async function benchmarkModel(model: ModelProfile) {
    setBusyModelRef(model.modelRef);
    try {
      const response = await fetch(`${API_BASE_URL}/api/models/benchmark`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ modelId: model.id, taskProfile: model.taskProfiles[0] ?? "daily-assistant" }),
      });
      if (!response.ok) {
        throw new Error("Model benchmark failed");
      }
      const body = (await response.json()) as BenchmarkResponse;
      setBenchmark(body.benchmark);
    } finally {
      setBusyModelRef(null);
    }
  }

  return (
    <section className="panel catalog-panel">
      <div className="panel-header">
        <div>
          <h2>Model Catalog</h2>
          <p>Dry-run first. Downloads stay approval-gated and local-cache oriented.</p>
        </div>
        <Download size={22} aria-hidden="true" />
      </div>
      <div className="catalog-table">
        {status.models.map((model) => (
          <article className="catalog-row" key={model.id}>
            <div>
              <strong>{model.label}</strong>
              <span>{model.modelRef}</span>
            </div>
            <em>{model.scale}</em>
            <em>{model.source ?? model.runtime}</em>
            <em>{model.artifact?.estimatedSizeGb ? `${model.artifact.estimatedSizeGb} GB` : "unknown"}</em>
            <div className="catalog-actions">
              <button type="button" onClick={() => selectModel(model)} disabled={!model.enabled && model.installState !== "installed"}>
                Use
              </button>
              <button type="button" onClick={() => benchmarkModel(model)} disabled={busyModelRef === model.modelRef}>
                Bench
              </button>
              <button type="button" onClick={() => runDryRun(model)} disabled={busyModelRef === model.modelRef}>
                {busyModelRef === model.modelRef ? "Checking" : "Dry"}
              </button>
            </div>
          </article>
        ))}
      </div>
      {dryRun && (
        <div className="dry-run-result">
          <strong>{dryRun.dryRun.modelRef}</strong>
          <span>{dryRun.dryRun.installPlan.commandPreview}</span>
          <em>{dryRun.decision.decision} / {dryRun.dryRun.estimatedSizeGb ?? "unknown"} GB</em>
        </div>
      )}
      {benchmark && (
        <div className="dry-run-result benchmark-result">
          <strong>{benchmark.modelId}</strong>
          <span>{benchmark.notes}</span>
          <em>{benchmark.tokensPerSecond} t/s / {benchmark.latencyMs} ms</em>
        </div>
      )}
    </section>
  );
}

function AgentFlow({ agents }: { agents: AgentProfile[] }) {
  return (
    <section className="panel agent-flow">
      <div className="panel-header">
        <div>
          <h2>AgentOS</h2>
          <p>Planner, executor, memory, and safety roles coordinate through a shared task graph.</p>
        </div>
        <Activity size={22} aria-hidden="true" />
      </div>
      <div className="flow-map">
        {agents.map((agent, index) => (
          <div className="agent-node" key={agent.id}>
            <div className="node-orbit" />
            <strong>{agent.name}</strong>
            <span>{agent.status}</span>
            {index < agents.length - 1 && <ChevronRight className="node-link" size={18} aria-hidden="true" />}
          </div>
        ))}
      </div>
    </section>
  );
}

function MemoryTimeline({ status }: { status: JarvisStatus }) {
  const [query, setQuery] = useState("privacy");
  const [writes, setWrites] = useState<MemoryWrite[]>([]);

  async function searchMemory() {
    const response = await fetch(`${API_BASE_URL}/api/memory/search?q=${encodeURIComponent(query)}`);
    if (!response.ok) {
      throw new Error("Memory search failed");
    }
    const body = (await response.json()) as { writes?: MemoryWrite[] };
    setWrites(body.writes ?? []);
  }

  return (
    <section className="panel timeline-panel">
      <div className="panel-header">
        <div>
          <h2>MemoryOS Timeline</h2>
          <p>Past, present, and future signals with provenance and confidence.</p>
        </div>
        <Database size={22} aria-hidden="true" />
      </div>
      <div className="memory-search">
        <input value={query} onChange={(event) => setQuery(event.target.value)} />
        <button type="button" onClick={searchMemory}>Recall</button>
      </div>
      <div className="timeline">
        {writes.map((memory) => (
          <article className="timeline-event memory-write" key={memory.id}>
            <time>{new Date(memory.createdAt).toLocaleString()}</time>
            <div>
              <strong>{memory.kind}</strong>
              <p>{memory.content}</p>
              <span>{memory.tags.join(" / ")}</span>
            </div>
          </article>
        ))}
        {status.memories.map((memory) => (
          <article className="timeline-event" key={memory.id}>
            <time>{new Date(memory.timestamp).toLocaleString()}</time>
            <div>
              <strong>{memory.title}</strong>
              <p>{memory.summary}</p>
              <span>{memory.tags.join(" / ")}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Approvals({ status, onRefresh }: { status: JarvisStatus; onRefresh: () => Promise<void> }) {
  async function decideApproval(approvalId: string, action: "approve" | "deny") {
    const response = await fetch(`${API_BASE_URL}/api/approvals/${approvalId}/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!response.ok) {
      throw new Error(`Approval ${action} failed`);
    }
    await onRefresh();
  }

  return (
    <section className="panel approvals-panel">
      <div className="panel-header">
        <div>
          <h2>Approvals</h2>
          <p>Every risky action explains why it is blocked or gated.</p>
        </div>
        <ShieldCheck size={22} aria-hidden="true" />
      </div>
      <div className="approval-list">
        {status.pendingApprovals.map((approval) => {
          const decision = localPolicyDecision(approval, status);
          return (
            <article className="approval-card" key={approval.id}>
              <div>
                <strong>{approval.title}</strong>
                <p>{approval.reason}</p>
                <span>{decision.reasons.join(" ")}</span>
              </div>
              <div className="approval-actions">
                <button className="approve" type="button" onClick={() => decideApproval(approval.id, "approve")}>
                  <CheckCircle2 size={16} aria-hidden="true" />
                  Approve
                </button>
                <button className="deny" type="button" onClick={() => decideApproval(approval.id, "deny")}>
                  <XCircle size={16} aria-hidden="true" />
                  Deny
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ConnectorsAndSkills({ status, onRefresh }: { status: JarvisStatus; onRefresh: () => Promise<void> }) {
  async function toggleConnector(connectorId: string, enabled: boolean) {
    const response = await fetch(`${API_BASE_URL}/api/connectors/${connectorId}/enable`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    if (!response.ok) {
      throw new Error("Connector toggle failed");
    }
    await onRefresh();
  }

  return (
    <section className="panel connectors-panel">
      <div className="panel-header">
        <div>
          <h2>Skills + Connectors</h2>
          <p>Each integration declares permissions, data touched, and rollback behavior.</p>
        </div>
        <Cable size={22} aria-hidden="true" />
      </div>
      <div className="connector-grid">
        {status.connectors.map((connector) => (
          <article className="connector-card" key={connector.id}>
            <div>
              <strong>{connector.name}</strong>
              <span>{connector.category}</span>
            </div>
            <div className="connector-actions">
              <em>{connector.enabled ? "enabled" : "locked"}</em>
              <button type="button" onClick={() => toggleConnector(connector.id, !connector.enabled)}>
                {connector.enabled ? "Lock" : "Enable"}
              </button>
            </div>
          </article>
        ))}
      </div>
      <div className="skill-list">
        {status.skills.map((skill) => (
          <div className="skill-row" key={skill.id}>
            <TerminalSquare size={18} aria-hidden="true" />
            <div>
              <strong>{skill.name}</strong>
              <span>{skill.description}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ModalityStudio() {
  return (
    <section className="panel modality-panel">
      <div className="panel-header">
        <div>
          <h2>Modality Studio</h2>
          <p>Text, voice, image, video, audio, music, maps, and sensors share one routing layer.</p>
        </div>
        <Radar size={22} aria-hidden="true" />
      </div>
      <div className="modality-grid">
        {MODALITIES.map((modality) => {
          const Icon = modality.icon;
          return (
            <article className="modality" key={modality.label}>
              <Icon size={22} aria-hidden="true" />
              <strong>{modality.label}</strong>
              <span>{modality.state}</span>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function VoicePanel({ status }: { status: JarvisStatus }) {
  const [message, setMessage] = useState(status.voiceSession?.message ?? "Voice loop is initializing.");
  const voiceAssets = status.voiceAssets ?? [];

  async function testTts() {
    const response = await fetch(`${API_BASE_URL}/api/audio/tts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "Jarvis local voice test.", voiceId: "default", engineId: "piper-local" }),
    });
    const body = (await response.json()) as { tts?: { message?: string } };
    setMessage(body.tts?.message ?? "TTS request finished.");
  }

  async function testTranscription() {
    const response = await fetch(`${API_BASE_URL}/api/audio/transcribe-file`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filePath: "sample-local-audio.wav" }),
    });
    const body = (await response.json()) as { result?: { message?: string; text?: string } };
    setMessage(body.result?.text || body.result?.message || "STT request finished.");
  }

  return (
    <section className="panel voice-panel">
      <div className="panel-header">
        <div>
          <h2>Voice Loop</h2>
          <p>Whisper first, Vosk fallback, Piper speech output, and VAD-aware sessions.</p>
        </div>
        <Radio size={22} aria-hidden="true" />
      </div>
      <div className="voice-state">
        <strong>{status.voiceSession?.state ?? "missing-tools"}</strong>
        <span>{message}</span>
      </div>
      <div className="engine-list">
        {(status.audioEngines ?? []).map((engine) => (
          <article key={engine.id}>
            <strong>{engine.label}</strong>
            <span>{engine.role} / {engine.status}</span>
          </article>
        ))}
      </div>
      <div className="voice-assets">
        {voiceAssets.slice(0, 4).map((asset) => (
          <article key={asset.id}>
            <div>
              <strong>{asset.label}</strong>
              <span>{asset.role} / {asset.fileName}</span>
            </div>
            <audio controls preload="none" src={`${API_BASE_URL}/api/assets/voice/${encodeURIComponent(asset.fileName)}`} />
          </article>
        ))}
      </div>
      <div className="panel-actions">
        <button type="button" onClick={testTranscription}>Test STT</button>
        <button type="button" onClick={testTts}>Test TTS</button>
      </div>
    </section>
  );
}

function ReferencePanel({ status }: { status: JarvisStatus }) {
  const references = status.referenceSources ?? [];

  return (
    <section className="panel reference-panel">
      <div className="panel-header">
        <div>
          <h2>Reference Forge</h2>
          <p>OpenClaw, Ruflo, and Jarvis variants are audited as ingredients, not shells.</p>
        </div>
        <Database size={22} aria-hidden="true" />
      </div>
      <div className="reference-list">
        {references.map((reference) => (
          <article key={reference.id}>
            <div>
              <strong>{reference.name}</strong>
              <span>{reference.kind} / {reference.license} / {reference.status}</span>
            </div>
            <p>{reference.adoptedPatterns.slice(0, 3).join(" + ")}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function StartupPanel({ status }: { status: JarvisStatus }) {
  const startup = status.startup;

  return (
    <section className="panel startup-panel">
      <div className="panel-header">
        <div>
          <h2>Startup Sync</h2>
          <p>Windows logon service bootstrap for Ollama, Brain, Gateway, and UI.</p>
        </div>
        <TerminalSquare size={22} aria-hidden="true" />
      </div>
      <div className="startup-grid">
        <article>
          <span>Mode</span>
          <strong>{startup?.mode ?? "manual"}</strong>
        </article>
        <article>
          <span>Script</span>
          <strong>{startup?.scriptPath ?? "scripts/start-jarvis.ps1"}</strong>
        </article>
      </div>
      <div className="startup-services">
        {(startup?.backgroundServices ?? []).map((service) => (
          <span key={service}>{service}</span>
        ))}
      </div>
    </section>
  );
}

function SocialOutboxPanel({ status, onRefresh }: { status: JarvisStatus; onRefresh: () => Promise<void> }) {
  const socialConnectors = status.connectors.filter((connector) => connector.category === "social");
  const [connectorId, setConnectorId] = useState(socialConnectors[0]?.id ?? "social-outbox");
  const [recipient, setRecipient] = useState("preview-recipient");
  const [content, setContent] = useState("Draft this locally. Do not send.");
  const drafts = status.socialDrafts ?? [];

  async function createDraft() {
    const response = await fetch(`${API_BASE_URL}/api/connectors/${connectorId}/dry-run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recipient, channel: connectorId, content }),
    });
    if (!response.ok) {
      throw new Error("Social dry-run failed");
    }
    await onRefresh();
  }

  return (
    <section className="panel social-panel">
      <div className="panel-header">
        <div>
          <h2>Social Outbox</h2>
          <p>Drafts only. Sending and posting are approval-gated with audit notes.</p>
        </div>
        <Send size={22} aria-hidden="true" />
      </div>
      <div className="social-form">
        <select value={connectorId} onChange={(event) => setConnectorId(event.target.value)}>
          {socialConnectors.map((connector) => (
            <option key={connector.id} value={connector.id}>
              {connector.name}
            </option>
          ))}
        </select>
        <input value={recipient} onChange={(event) => setRecipient(event.target.value)} />
        <textarea value={content} onChange={(event) => setContent(event.target.value)} rows={3} />
        <button type="button" onClick={createDraft}>Dry-run draft</button>
      </div>
      <DraftList drafts={drafts} />
    </section>
  );
}

function DraftList({ drafts }: { drafts: OutboundMessageDraft[] }) {
  return (
    <div className="draft-list">
      {drafts.length === 0 ? (
        <p className="empty-state">No social drafts yet.</p>
      ) : (
        drafts.slice(0, 4).map((draft) => (
          <article key={draft.id}>
            <strong>{draft.channel} / {draft.recipient}</strong>
            <span>{draft.status}</span>
            <p>{draft.content}</p>
          </article>
        ))
      )}
    </div>
  );
}

function MobilePairingPanel({ status, onRefresh }: { status: JarvisStatus; onRefresh: () => Promise<void> }) {
  const [deviceName, setDeviceName] = useState("Phone companion");
  const pairings: MobilePairing[] = status.mobilePairings ?? [];

  async function startPairing() {
    const response = await fetch(`${API_BASE_URL}/api/mobile/pairing/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ baseUrl: API_BASE_URL, deviceName }),
    });
    if (!response.ok) {
      throw new Error("Mobile pairing failed");
    }
    await onRefresh();
  }

  return (
    <section className="panel mobile-panel">
      <div className="panel-header">
        <div>
          <h2>Mobile Pairing</h2>
          <p>Local companion contract for LAN or WireGuard clients.</p>
        </div>
        <Smartphone size={22} aria-hidden="true" />
      </div>
      <div className="mobile-form">
        <input value={deviceName} onChange={(event) => setDeviceName(event.target.value)} />
        <button type="button" onClick={startPairing}>Start pairing</button>
      </div>
      <div className="pairing-list">
        {pairings.length === 0 ? (
          <p className="empty-state">No active pairing tokens.</p>
        ) : (
          pairings.slice(0, 4).map((pairing) => (
            <article key={pairing.id}>
              <strong>{pairing.deviceName ?? "Companion"}</strong>
              <span>{pairing.status} / {pairing.tokenPreview}</span>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function GrowthReport({ status }: { status: JarvisStatus }) {
  return (
    <section className="panel growth-panel">
      <div className="panel-header">
        <div>
          <h2>Growth Report</h2>
          <p>Nightly consolidation, skill suggestions, and system maturation.</p>
        </div>
        <Fingerprint size={22} aria-hidden="true" />
      </div>
      <div className="report-body">
        <Play size={18} aria-hidden="true" />
        <p>{status.lastEvolutionReport}</p>
      </div>
    </section>
  );
}

function ReportsPanel({ status }: { status: JarvisStatus }) {
  const reports = status.reports ?? [];

  return (
    <section className="panel reports-panel">
      <div className="panel-header">
        <div>
          <h2>Reports</h2>
          <p>Live briefs, posture, and throughput.</p>
        </div>
        <BarChart3 size={22} aria-hidden="true" />
      </div>
      <div className="report-grid">
        {reports.map((report) => (
          <article className="report-card" key={report.id}>
            <div className="report-title">
              <strong>{report.title}</strong>
              <span>{report.status}</span>
            </div>
            <p>{report.summary}</p>
            <div className="report-chart">
              {report.metrics.map((metric) => (
                <div key={metric.label} style={{ "--bar": `${Math.max(18, metric.value.length * 9)}%` } as CSSProperties}>
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function MapPanel({ status, onRefresh }: { status: JarvisStatus; onRefresh: () => Promise<void> }) {
  const [query, setQuery] = useState("Plan local device route");
  const maps = status.mapOverlays ?? [];
  const activeMap = maps[0];

  async function createMapQuery() {
    const response = await fetch(`${API_BASE_URL}/api/maps/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (!response.ok) {
      throw new Error("Map query failed");
    }
    await onRefresh();
  }

  return (
    <section className="panel map-panel">
      <div className="panel-header">
        <div>
          <h2>Map Room</h2>
          <p>Offline-first routes and device context.</p>
        </div>
        <MapPin size={22} aria-hidden="true" />
      </div>
      <div className="map-canvas" aria-label="Local map visualization">
        <div className="map-gridline vertical-a" />
        <div className="map-gridline vertical-b" />
        <div className="map-route" />
        {(activeMap?.pins ?? []).slice(0, 4).map((pin, index) => (
          <span className={`map-pin pin-${index}`} key={pin.id} title={pin.label}>
            <MapPin size={15} aria-hidden="true" />
          </span>
        ))}
      </div>
      <div className="map-caption">
        <strong>{activeMap?.label ?? "No map draft"}</strong>
        <span>{activeMap?.notes ?? "Create a local query to stage a map insight."}</span>
      </div>
      <div className="map-query">
        <input value={query} onChange={(event) => setQuery(event.target.value)} />
        <button type="button" onClick={createMapQuery}>Route</button>
      </div>
    </section>
  );
}

function VisionPanel({ status, onRefresh }: { status: JarvisStatus; onRefresh: () => Promise<void> }) {
  const [filePath, setFilePath] = useState("C:\\Users\\user\\Downloads\\Secretary Jarvis\\voice");
  const latest = (status.visionInsights ?? [])[0];

  async function analyzeImage() {
    const response = await fetch(`${API_BASE_URL}/api/vision/analyze-image`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filePath, mode: "image" }),
    });
    if (!response.ok) {
      throw new Error("Vision analysis failed");
    }
    await onRefresh();
  }

  async function dryRunSensor(kind: "screen" | "camera") {
    const response = await fetch(`${API_BASE_URL}/api/vision/capture-${kind}/dry-run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    if (!response.ok) {
      throw new Error(`${kind} dry-run failed`);
    }
    await onRefresh();
  }

  return (
    <section className="panel vision-panel">
      <div className="panel-header">
        <div>
          <h2>Vision</h2>
          <p>Camera, screen, OCR, and image input.</p>
        </div>
        <Camera size={22} aria-hidden="true" />
      </div>
      <div className="vision-scope">
        <Eye size={38} aria-hidden="true" />
        <div>
          <strong>{latest?.status ?? "needs-input"}</strong>
          <span>{latest?.summary ?? "Static files can be queued. Live sensors need approval."}</span>
        </div>
      </div>
      <div className="vision-list">
        {(latest?.observations ?? ["No hosted vision by default.", "Identity and camera are approval-gated."]).map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
      <div className="privacy-lock-grid">
        <span><b>Screen</b>approval</span>
        <span><b>Camera</b>locked</span>
        <span><b>Timeline</b>off</span>
      </div>
      <div className="map-query">
        <button type="button" onClick={() => dryRunSensor("screen")}>Screen dry-run</button>
        <button type="button" onClick={() => dryRunSensor("camera")}>Camera dry-run</button>
      </div>
      <div className="map-query">
        <input value={filePath} onChange={(event) => setFilePath(event.target.value)} />
        <button type="button" onClick={analyzeImage}>Analyze</button>
      </div>
    </section>
  );
}

function DevicePanel({ status, onRefresh }: { status: JarvisStatus; onRefresh: () => Promise<void> }) {
  const [command, setCommand] = useState("Inspect status only");
  const [lastDryRun, setLastDryRun] = useState<string>("No device action staged.");

  async function dryRunDevice(deviceId: string) {
    const response = await fetch(`${API_BASE_URL}/api/devices/${deviceId}/dry-run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ command }),
    });
    if (!response.ok) {
      throw new Error("Device dry-run failed");
    }
    const body = (await response.json()) as { dryRun?: { preview?: string; decision?: { decision?: string } } };
    setLastDryRun(`${body.dryRun?.decision?.decision ?? "checked"}: ${body.dryRun?.preview ?? "No action executed."}`);
    await onRefresh();
  }

  return (
    <section className="panel device-panel">
      <div className="panel-header">
        <div>
          <h2>Devices</h2>
          <p>Local machine, sensors, apps, and future LAN nodes.</p>
        </div>
        <HardDrive size={22} aria-hidden="true" />
      </div>
      <div className="device-command">
        <input value={command} onChange={(event) => setCommand(event.target.value)} />
        <span>{lastDryRun}</span>
      </div>
      <div className="device-grid">
        {(status.devices ?? []).map((device) => (
          <article key={device.id}>
            <strong>{device.name}</strong>
            <span>{device.kind} / {device.status}</span>
            <em>{device.approvalRequired ? "approval" : "trusted"}</em>
            <button type="button" onClick={() => dryRunDevice(device.id)}>Dry-run</button>
          </article>
        ))}
      </div>
    </section>
  );
}

function SecurityPanel({ status }: { status: JarvisStatus }) {
  const core = status.protectedCore;

  return (
    <section className="panel security-panel">
      <div className="panel-header">
        <div>
          <h2>Safety Kernel</h2>
          <p>Core sealed from runtime agents.</p>
        </div>
        <ShieldCheck size={22} aria-hidden="true" />
      </div>
      <div className="security-core">
        <Lock size={24} aria-hidden="true" />
        <div>
          <strong>{core?.mode ?? "sealed"}</strong>
          <span>{core?.lastDecision ?? "Protected core access is denied to runtime agents."}</span>
        </div>
      </div>
      <div className="security-tags">
        {(core?.deniedPatterns ?? ["core", "secrets", "tensors"]).slice(0, 6).map((pattern) => (
          <span key={pattern}>{pattern}</span>
        ))}
      </div>
    </section>
  );
}

function PerformancePanel({ status }: { status: JarvisStatus }) {
  const performance = status.performance;

  return (
    <section className="panel performance-panel">
      <div className="panel-header">
        <div>
          <h2>Throughput</h2>
          <p>Tokens, context, queue, and recall.</p>
        </div>
        <Gauge size={22} aria-hidden="true" />
      </div>
      <div className="performance-bars">
        <div style={{ "--level": `${Math.min(100, (performance?.tokensPerSecond ?? 0) * 3)}%` } as CSSProperties}>
          <span>Tokens/s</span>
          <strong>{performance?.tokensPerSecond.toFixed(1) ?? "0.0"}</strong>
        </div>
        <div style={{ "--level": `${Math.min(100, ((performance?.contextWindow ?? 0) / 32768) * 100)}%` } as CSSProperties}>
          <span>Context</span>
          <strong>{performance ? `${Math.round(performance.contextWindow / 1000)}k` : "0k"}</strong>
        </div>
        <div style={{ "--level": `${Math.max(12, 100 - (performance?.queueLatencyMs ?? 120) / 2)}%` } as CSSProperties}>
          <span>Queue</span>
          <strong>{performance?.queueLatencyMs ?? 0} ms</strong>
        </div>
      </div>
      <p className="perf-note">{performance?.notes}</p>
    </section>
  );
}

function BrainPanel() {
  const [brain, setBrain] = useState<BrainStatusResponse | null>(null);

  async function refreshBrain() {
    const response = await fetch(`${API_BASE_URL}/api/brain/status`);
    const body = (await response.json()) as BrainStatusResponse;
    setBrain(body);
  }

  useEffect(() => {
    refreshBrain().catch(() =>
      setBrain({
        online: false,
        url: "http://127.0.0.1:5000",
      }),
    );
  }, []);

  const capabilities = brain?.capabilities?.capabilities ?? [];

  return (
    <section className="panel brain-panel">
      <div className="panel-header">
        <div>
          <h2>Python Brain</h2>
          <p>Orchestration, voice, memory, and perception sidecar.</p>
        </div>
        <TerminalSquare size={22} aria-hidden="true" />
      </div>
      <div className={brain?.online ? "brain-status online" : "brain-status offline"}>
        <strong>{brain?.online ? "online" : "offline"}</strong>
        <span>{brain?.health?.buildId ?? brain?.url ?? "http://127.0.0.1:5000"}</span>
        <button type="button" onClick={refreshBrain}>Refresh</button>
      </div>
      <div className="brain-capabilities">
        {capabilities.length === 0 ? (
          <p className="empty-state">Brain capabilities are unavailable.</p>
        ) : (
          capabilities.map((capability) => (
            <article key={capability.id}>
              <strong>{capability.label}</strong>
              <span>{capability.kind} / {capability.status}</span>
              <p>{capability.details}</p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function SettingsPanel({ status, onRefresh }: { status: JarvisStatus; onRefresh: () => Promise<void> }) {
  const [privacyMode, setPrivacyMode] = useState<PrivacyMode>(status.privacyMode);
  const [scaleProfile, setScaleProfile] = useState<ScaleProfile>(status.scaleProfile);

  useEffect(() => {
    setPrivacyMode(status.privacyMode);
    setScaleProfile(status.scaleProfile);
  }, [status.privacyMode, status.scaleProfile]);

  async function saveSettings() {
    const response = await fetch(`${API_BASE_URL}/api/settings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ privacyMode, scaleProfile }),
    });
    if (!response.ok) {
      throw new Error("Settings update failed");
    }
    await onRefresh();
  }

  return (
    <section className="panel settings-panel">
      <div className="panel-header">
        <div>
          <h2>Runtime</h2>
          <p>Privacy and scale routing.</p>
        </div>
        <ShieldCheck size={22} aria-hidden="true" />
      </div>
      <div className="settings-grid">
        <label>
          <span>Privacy</span>
          <select value={privacyMode} onChange={(event) => setPrivacyMode(event.target.value as PrivacyMode)}>
            <option value="strict-local">strict-local</option>
            <option value="local-hybrid-disabled">local-hybrid-disabled</option>
            <option value="trusted-lan">trusted-lan</option>
          </select>
        </label>
        <label>
          <span>Scale</span>
          <select value={scaleProfile} onChange={(event) => setScaleProfile(event.target.value as ScaleProfile)}>
            <option value="laptop">laptop</option>
            <option value="workstation">workstation</option>
            <option value="homelab">homelab</option>
          </select>
        </label>
        <button type="button" onClick={saveSettings}>Apply</button>
      </div>
    </section>
  );
}

function ServiceHealthPanel() {
  const [doctor, setDoctor] = useState<DoctorStatus | null>(null);

  async function refreshDoctor() {
    const response = await fetch(`${API_BASE_URL}/api/setup/doctor`);
    if (!response.ok) {
      throw new Error("Doctor check failed");
    }
    setDoctor((await response.json()) as DoctorStatus);
  }

  useEffect(() => {
    refreshDoctor().catch(() => setDoctor(null));
  }, []);

  const tools = doctor?.tools ?? [];

  return (
    <section className="panel service-health-panel">
      <div className="panel-header">
        <div>
          <h2>Services</h2>
          <p>Local tool readiness.</p>
        </div>
        <Network size={22} aria-hidden="true" />
      </div>
      <div className="service-health-list">
        {tools.slice(0, 8).map((tool) => (
          <article key={tool.id}>
            <strong>{tool.label}</strong>
            <span>{tool.installed ? "ready" : "missing"}</span>
          </article>
        ))}
      </div>
      <div className="panel-actions single-action">
        <button type="button" onClick={refreshDoctor}>Refresh services</button>
      </div>
    </section>
  );
}

function ConversationPanel({
  status,
  liveEvents,
  onTaskCreated,
}: {
  status: JarvisStatus;
  liveEvents: StreamEvent[];
  onTaskCreated: (status: JarvisStatus) => void;
}) {
  const [message, setMessage] = useState("");
  const [taskProfile, setTaskProfile] = useState<TaskProfile>("daily-assistant");
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const conversations = status.conversations ?? [];
  const latestConversation = conversations[0];
  const liveTokens = liveEvents
    .filter((event) => event.type === "token")
    .slice(0, 8)
    .map((event) => String(event.payload.content ?? ""))
    .reverse()
    .join(" ");

  useEffect(() => {
    if (!latestConversation?.id) {
      setTurns([]);
      return;
    }
    fetch(`${API_BASE_URL}/api/conversations/${latestConversation.id}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("conversation fetch failed"))))
      .then((body: { turns?: ConversationTurn[] }) => setTurns(body.turns ?? []))
      .catch(() => setTurns([]));
  }, [latestConversation?.id, status.tasks?.[0]?.updatedAt]);

  async function sendMessage() {
    const trimmed = message.trim();
    if (!trimmed) {
      return;
    }
    const response = await fetch(`${API_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversationId: latestConversation?.id,
        message: trimmed,
        taskProfile,
      }),
    });
    if (!response.ok) {
      throw new Error("Jarvis chat request failed");
    }
    setMessage("");
    const nextStatus = await loadStatus();
    onTaskCreated(nextStatus);
  }

  return (
    <section className="panel conversation-panel">
      <div className="panel-header">
        <div>
          <h2>Conversation</h2>
          <p>Talk while Jarvis works. New messages are saved and routed into the queue.</p>
        </div>
        <Mic size={22} aria-hidden="true" />
      </div>
      <div className="conversation-body">
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Tell Jarvis what to do, or steer the current work..."
          rows={4}
        />
        <div className="conversation-actions">
          <select value={taskProfile} onChange={(event) => setTaskProfile(event.target.value as TaskProfile)}>
            {TASKS.map((task) => (
              <option key={task.id} value={task.id}>
                {task.label}
              </option>
            ))}
          </select>
          <button type="button" onClick={sendMessage}>
            Send to Jarvis
          </button>
        </div>
      </div>
      <div className="conversation-transcript">
        {turns.length === 0 ? (
          <p className="empty-state">No saved turns yet.</p>
        ) : (
          turns.slice(-8).map((turn) => (
            <article className={`turn ${turn.role}`} key={turn.id}>
              <strong>{turn.role}</strong>
              <p>{turn.content}</p>
            </article>
          ))
        )}
        {liveTokens && (
          <article className="turn assistant streaming">
            <strong>streaming</strong>
            <p>{liveTokens}</p>
          </article>
        )}
      </div>
      <div className="event-feed">
        {liveEvents.slice(0, 5).map((event) => (
          <article key={event.id}>
            <strong>{event.type}</strong>
            <span>{new Date(event.createdAt).toLocaleTimeString()}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

function TaskQueuePanel({ tasks, onRefresh }: { tasks: TaskRun[]; onRefresh: () => Promise<void> }) {
  const [steeringText, setSteeringText] = useState("Adjust course using my latest instruction.");

  async function postTaskAction(taskId: string, action: "steer" | "interrupt" | "cancel") {
    const body = action === "cancel" ? {} : { instruction: steeringText };
    const response = await fetch(`${API_BASE_URL}/api/tasks/${taskId}/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`Task ${action} failed`);
    }
    await onRefresh();
  }

  return (
    <section className="panel queue-panel">
      <div className="panel-header">
        <div>
          <h2>Task Queue</h2>
          <p>Queued work can be steered, interrupted at checkpoints, or cancelled with state preserved.</p>
        </div>
        <GitBranch size={22} aria-hidden="true" />
      </div>
      <div className="steer-box">
        <input value={steeringText} onChange={(event) => setSteeringText(event.target.value)} />
      </div>
      <div className="task-list">
        {tasks.length === 0 ? (
          <p className="empty-state">No queued tasks yet.</p>
        ) : (
          tasks.slice(0, 6).map((task) => (
            <article className="task-card" key={task.id}>
              <div>
                <strong>{task.title}</strong>
                <span>{task.status} / {task.taskProfile}</span>
                {task.checkpoint && <p>{task.checkpoint}</p>}
              </div>
              <div className="task-actions">
                <button type="button" onClick={() => postTaskAction(task.id, "steer")}>
                  Steer
                </button>
                <button type="button" onClick={() => postTaskAction(task.id, "interrupt")}>
                  Interrupt
                </button>
                <button type="button" onClick={() => postTaskAction(task.id, "cancel")}>
                  Cancel
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

type AppSection =
  | "home"
  | "chat"
  | "models"
  | "voice"
  | "vision"
  | "agents"
  | "memory"
  | "skills"
  | "devices"
  | "social"
  | "maps"
  | "reports"
  | "security"
  | "settings";

const SECTIONS: Array<{ id: AppSection; label: string; icon: typeof Brain }> = [
  { id: "home", label: "Home", icon: CircleDot },
  { id: "chat", label: "Chat", icon: Brain },
  { id: "models", label: "Models", icon: Cpu },
  { id: "voice", label: "Voice", icon: Mic },
  { id: "vision", label: "Vision", icon: Eye },
  { id: "agents", label: "Agents", icon: ListTree },
  { id: "memory", label: "Memory", icon: Database },
  { id: "skills", label: "Skills", icon: Cable },
  { id: "devices", label: "Devices", icon: HardDrive },
  { id: "social", label: "Social", icon: Send },
  { id: "maps", label: "Maps", icon: Map },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "security", label: "Security", icon: ShieldCheck },
  { id: "settings", label: "Settings", icon: Wrench },
];

interface FeatureDownloadsResponse {
  downloads: NeededFeatureDownload[];
  note: string;
}

interface FutureScalingResponse {
  models: FutureScalingModel[];
  note: string;
}

interface ModelReadinessResponse {
  readiness: ModelReadiness[];
  readyModelAssets?: ReadyModelAsset[];
}

interface UndoJournalResponse {
  undoJournal: UndoJournalEntry[];
}

function briefText(value: string | undefined, max = 118): string {
  if (!value) {
    return "Ready.";
  }
  return value.length > max ? `${value.slice(0, max).trim()}...` : value;
}

function useGatewayResource<T>(path: string, fallback: T): T {
  const [value, setValue] = useState<T>(fallback);
  useEffect(() => {
    fetch(`${API_BASE_URL}${path}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(path))))
      .then((body: T) => setValue(body))
      .catch(() => setValue(fallback));
  }, [path]);
  return value;
}

function HudOverlay({ status, liveEvents, onOpenDashboard }: { status: JarvisStatus; liveEvents: StreamEvent[]; onOpenDashboard?: () => void }) {
  const latestTask = (status.tasks ?? [])[0];
  const latestApproval = status.pendingApprovals[0];
  const latestToken = liveEvents.find((event) => event.type === "token");
  const voiceState = status.voiceSession?.state ?? "idle";
  const hudState = latestApproval
    ? "approval"
    : latestTask?.status === "running"
      ? "executing"
      : latestToken
        ? "speaking"
        : voiceState === "listening" || voiceState === "transcribing"
          ? "listening"
          : "idle";
  const current = activeModel(status);
  const caption =
    latestApproval?.title ??
    latestToken?.payload.content?.toString() ??
    latestTask?.title ??
    `${current.label} ready`;

  return (
    <main className={`hud-shell hud-${hudState}`}>
      <div className="hud-particle-field" aria-hidden="true" />
      <section className="hud-orb-panel" aria-label="Jarvis HUD">
        <div className="hud-orb">
          <div className="hud-orb-ring ring-one" />
          <div className="hud-orb-ring ring-two" />
          <div className="hud-orb-core">
            <Brain size={24} aria-hidden="true" />
          </div>
        </div>
        <div className="hud-caption">
          <span>{hudState}</span>
          <strong>{briefText(caption, 74)}</strong>
          <p>{briefText(status.voiceSession?.message ?? current.notes, 92)}</p>
        </div>
        <div className="hud-actions">
          <button type="button" onClick={onOpenDashboard}>
            <Layers3 size={15} aria-hidden="true" />
          </button>
          <button type="button" title="Emergency stop">
            <XCircle size={15} aria-hidden="true" />
          </button>
        </div>
      </section>
      <div className="hud-wave" aria-hidden="true">
        {Array.from({ length: 22 }).map((_, index) => (
          <span key={index} style={{ "--i": index } as CSSProperties} />
        ))}
      </div>
    </main>
  );
}

function CommandDeck({ status, gatewayState, onSectionChange }: { status: JarvisStatus; gatewayState: string; onSectionChange: (section: AppSection) => void }) {
  const current = activeModel(status);
  const runningTasks = (status.tasks ?? []).filter((task) => task.status === "running").length;
  const readyAssets = status.readyModelAssets?.length ?? 0;
  const approvals = status.pendingApprovals.length;

  return (
    <section className="command-deck">
      <div className="deck-copy">
        <span>Gateway {gatewayState}</span>
        <h2>Control room</h2>
        <p>{briefText(`${current.label}: ${current.notes}`, 104)}</p>
        <div className="deck-actions">
          <button type="button" onClick={() => onSectionChange("chat")}>
            <MessageSquare size={15} aria-hidden="true" />
            <span>Command</span>
          </button>
          <button type="button" onClick={() => onSectionChange("models")}>
            <Cpu size={15} aria-hidden="true" />
            <span>Models</span>
          </button>
          <button type="button" onClick={() => onSectionChange("security")}>
            <ShieldCheck size={15} aria-hidden="true" />
            <span>Approvals</span>
          </button>
        </div>
      </div>
      <div className="deck-visual" aria-hidden="true">
        <div className="deck-orbit orbit-a" />
        <div className="deck-orbit orbit-b" />
        <div className="deck-core">
          <Brain size={30} />
        </div>
      </div>
      <div className="deck-metrics">
        <article><span>Ready assets</span><strong>{readyAssets}</strong></article>
        <article><span>Running</span><strong>{runningTasks}</strong></article>
        <article><span>Approvals</span><strong>{approvals}</strong></article>
      </div>
    </section>
  );
}

function SectionRail({ active, onChange }: { active: AppSection; onChange: (section: AppSection) => void }) {
  return (
    <nav className="section-rail" aria-label="Jarvis command sections">
      {SECTIONS.map((section) => {
        const Icon = section.icon;
        return (
          <button key={section.id} className={active === section.id ? "active" : ""} type="button" onClick={() => onChange(section.id)}>
            <Icon size={17} aria-hidden="true" />
            <span>{section.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function SectionDrawer({
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string;
  summary: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="section-drawer" open={defaultOpen}>
      <summary>
        <span>
          <strong>{title}</strong>
          <small>{summary}</small>
        </span>
        <ChevronRight size={18} aria-hidden="true" />
      </summary>
      <div className="drawer-grid">
        {children}
      </div>
    </details>
  );
}

function SectionBrief({ active, status }: { active: AppSection; status: JarvisStatus }) {
  const activeModelLabel = activeModel(status).label;
  const brief: Record<AppSection, { title: string; detail: string }> = {
    home: {
      title: "Control room",
      detail: "A quiet operational summary. Open drawers only when you need the deeper readout.",
    },
    chat: {
      title: "Conversation",
      detail: "Queue work, steer active tasks, and keep the transcript stored locally.",
    },
    models: {
      title: "Model routing",
      detail: `${activeModelLabel} is active. Ready assets, downloads, and future scaling stay separated.`,
    },
    voice: {
      title: "Voice loop",
      detail: "Whisper, voice samples, and staged Piper/Vosk paths are grouped here.",
    },
    vision: {
      title: "Vision",
      detail: "Image, screen, camera, and OCR paths stay approval-gated by default.",
    },
    agents: {
      title: "AgentOS",
      detail: "Named souls coordinate through planner, executor, memory, and safety roles.",
    },
    memory: {
      title: "MemoryOS",
      detail: "Recall timelines, remembered facts, and reversible checkpoints.",
    },
    skills: {
      title: "Skills",
      detail: "Connectors declare permissions, approvals, and rollback behavior.",
    },
    devices: {
      title: "Devices",
      detail: "Inspect local services and devices without enabling risky control by default.",
    },
    social: {
      title: "Social",
      detail: "Draft locally first. Sending remains approval-gated.",
    },
    maps: {
      title: "Map room",
      detail: "Local routes and device topology stay offline-first.",
    },
    reports: {
      title: "Reports",
      detail: "Live posture, growth, and performance without raw logs on first glance.",
    },
    security: {
      title: "Security",
      detail: "Approvals, protected core policy, and undo safety stay front and center.",
    },
    settings: {
      title: "Settings",
      detail: "Startup, services, tools, and local runtime readiness.",
    },
  };
  const item = brief[active];

  return (
    <section className="section-brief">
      <span>{active}</span>
      <h2>{item.title}</h2>
      <p>{item.detail}</p>
    </section>
  );
}

function ModelReadinessPanel() {
  const response = useGatewayResource<ModelReadinessResponse>("/api/models/readiness", { readiness: [] });
  const detectedAssets = response.readyModelAssets?.filter((asset) => asset.detected) ?? [];
  const [probeResults, setProbeResults] = useState<Record<string, NonNullable<ModelReadiness["runtimeProbe"]>>>({});
  const [probingModelId, setProbingModelId] = useState<string | null>(null);

  async function probeModel(modelId: string) {
    setProbingModelId(modelId);
    try {
      const response = await fetch(`${API_BASE_URL}/api/models/${encodeURIComponent(modelId)}/probe`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ safeMode: true }),
      });
      if (!response.ok) {
        throw new Error(`Probe failed: ${response.status}`);
      }
      const payload = (await response.json()) as { runtimeProbe?: NonNullable<ModelReadiness["runtimeProbe"]> };
      if (payload.runtimeProbe) {
        setProbeResults((current) => ({ ...current, [modelId]: payload.runtimeProbe! }));
      }
    } finally {
      setProbingModelId(null);
    }
  }

  return (
    <section className="panel model-readiness-panel">
      <div className="panel-header">
        <div>
          <h2>Ready Model Wiring</h2>
          <p>Downloaded assets are separated from runtime probes and future scaling.</p>
        </div>
        <Cpu size={22} aria-hidden="true" />
      </div>
      <div className="asset-strip">
        {detectedAssets.map((asset) => (
          <details key={asset.id}>
            <summary>
              <CheckCircle2 size={14} aria-hidden="true" />
              <span>{asset.label}</span>
            </summary>
            <p>{asset.detectedPath}</p>
            <small>{asset.hardwareFit} / {asset.runtimeAdapters.join(", ")}</small>
          </details>
        ))}
      </div>
      <div className="readiness-grid">
        {response.readiness.map((model) => {
          const probe = probeResults[model.modelId] ?? model.runtimeProbe;
          return (
            <article key={model.modelId} className={`readiness-card ${model.runtimeState}`}>
              <div className="readiness-card-head">
                <div>
                  <strong>{model.label}</strong>
                  <span>{model.modelRef}</span>
                </div>
                <button type="button" onClick={() => void probeModel(model.modelId)} disabled={probingModelId === model.modelId}>
                  {probingModelId === model.modelId ? "Probing" : "Probe"}
                </button>
              </div>
              <em>{probe ? `${probe.runtime} / ${probe.status}` : model.runtimeState}</em>
              <p>{briefText(probe?.notes[0] ?? model.recommendedUse, 110)}</p>
              <small>{model.hardwareFit} / {model.downloadState}{probe ? ` / ${probe.latencyMs} ms` : ""}</small>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function FeatureDownloadsPanel() {
  const response = useGatewayResource<FeatureDownloadsResponse>("/api/setup/needed-feature-downloads", { downloads: [], note: "" });

  return (
    <section className="panel setup-downloads-panel">
      <div className="panel-header">
        <div>
          <h2>Needed Feature Downloads</h2>
          <p>Feature dependencies Jarvis is already coded to plug in after you download them.</p>
        </div>
        <FolderDown size={22} aria-hidden="true" />
      </div>
      <div className="download-groups">
        {response.downloads.map((download) => (
          <details key={download.id}>
            <summary>
              <span>{download.category}</span>
              <strong>{download.label}</strong>
              <em>{download.status}</em>
            </summary>
            <p>{download.purpose}</p>
            <code>{download.expectedPath}</code>
            <small>{download.installHint}</small>
          </details>
        ))}
      </div>
    </section>
  );
}

function FutureScalingPanel() {
  const response = useGatewayResource<FutureScalingResponse>("/api/models/future-scaling", { models: [], note: "" });

  return (
    <section className="panel future-scaling-panel">
      <div className="panel-header">
        <div>
          <h2>Future Scaling</h2>
          <p>Optional larger model targets for later switching and benchmarking.</p>
        </div>
        <Layers3 size={22} aria-hidden="true" />
      </div>
      <div className="future-list">
        {response.models.map((model) => (
          <article key={model.id}>
            <strong>{model.label}</strong>
            <span>{model.modelRef}</span>
            <p>{briefText(model.purpose, 110)}</p>
            <em>{model.scale} / {model.expectedRuntime}</em>
          </article>
        ))}
      </div>
    </section>
  );
}

function AgentSoulsPanel({ status }: { status: JarvisStatus }) {
  const souls = status.agentSouls ?? [];

  return (
    <section className="panel souls-panel">
      <div className="panel-header">
        <div>
          <h2>Agent Souls</h2>
          <p>Named assistants with voice, personality, memory scope, and permissions.</p>
        </div>
        <Fingerprint size={22} aria-hidden="true" />
      </div>
      <div className="souls-grid">
        {souls.map((soul) => (
          <article key={soul.id}>
            <strong>{soul.name}</strong>
            <span>{soul.role}</span>
            <p>{briefText(soul.personality, 92)}</p>
            <em>{soul.status} / {soul.voiceProfileId}</em>
          </article>
        ))}
      </div>
    </section>
  );
}

function UndoJournalPanel() {
  const response = useGatewayResource<UndoJournalResponse>("/api/undo-journal", { undoJournal: [] });
  const [lastAction, setLastAction] = useState<string>("No approved-admin action staged.");

  async function dryRunAction() {
    const request = {
      label: "Organize local workspace preview",
      command: "organize downloads with reversible file moves",
      target: "C:\\Users\\user\\Downloads\\Secretary Jarvis",
    };
    const res = await fetch(`${API_BASE_URL}/api/system/actions/dry-run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    const body = (await res.json()) as { systemAction?: { status?: string; rollbackNote?: string } };
    setLastAction(`${body.systemAction?.status ?? "checked"}: ${body.systemAction?.rollbackNote ?? "Dry-run completed."}`);
  }

  return (
    <section className="panel undo-panel">
      <div className="panel-header">
        <div>
          <h2>Time-Travel Undo</h2>
          <p>Jarvis-managed reversible changes keep a 20-minute checkpoint.</p>
        </div>
        <Undo2 size={22} aria-hidden="true" />
      </div>
      <div className="undo-command">
        <button type="button" onClick={dryRunAction}>Stage safe dry-run</button>
        <span>{lastAction}</span>
      </div>
      <div className="undo-list">
        {response.undoJournal.length === 0 ? (
          <p className="empty-state">No undo checkpoints yet.</p>
        ) : (
          response.undoJournal.slice(0, 6).map((entry) => (
            <article key={entry.id}>
              <strong>{entry.label}</strong>
              <span>{entry.status} / expires {new Date(entry.expiresAt).toLocaleTimeString()}</span>
              <p>{entry.rollbackNote}</p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

export function App() {
  const [status, setStatus] = useState<JarvisStatus>(seededStatus);
  const [gatewayState, setGatewayState] = useState<"live" | "fallback">("fallback");
  const [liveEvents, setLiveEvents] = useState<StreamEvent[]>([]);
  const [activeSection, setActiveSection] = useState<AppSection>("home");
  const isHud = new URLSearchParams(window.location.search).has("floating") || new URLSearchParams(window.location.search).has("hud");

  useEffect(() => {
    loadStatus()
      .then((nextStatus) => {
        setStatus(nextStatus);
        setGatewayState("live");
      })
      .catch(() => {
        setStatus(seededStatus);
        setGatewayState("fallback");
      });
  }, []);

  useEffect(() => {
    const eventSource = new EventSource(`${API_BASE_URL}/api/events`);
    const handleEvent = (message: MessageEvent<string>) => {
      const event = JSON.parse(message.data) as StreamEvent;
      setLiveEvents((previous) => [event, ...previous].slice(0, 40));
      if (
        event.type === "task" ||
        event.type === "conversation" ||
        event.type === "status" ||
        event.type === "approval" ||
        event.type === "memory" ||
        event.type === "device" ||
        event.type === "security" ||
        event.type === "vision" ||
        event.type === "map"
      ) {
        loadStatus()
          .then((nextStatus) => {
            setStatus(nextStatus);
            setGatewayState("live");
          })
          .catch(() => setGatewayState("fallback"));
      }
    };

    eventSource.addEventListener("status", handleEvent);
    eventSource.addEventListener("conversation", handleEvent);
    eventSource.addEventListener("task", handleEvent);
    eventSource.addEventListener("memory", handleEvent);
    eventSource.addEventListener("approval", handleEvent);
    eventSource.addEventListener("token", handleEvent);
    eventSource.addEventListener("model", handleEvent);
    eventSource.addEventListener("audio", handleEvent);
    eventSource.addEventListener("connector", handleEvent);
    eventSource.addEventListener("mobile", handleEvent);
    eventSource.addEventListener("report", handleEvent);
    eventSource.addEventListener("map", handleEvent);
    eventSource.addEventListener("vision", handleEvent);
    eventSource.addEventListener("device", handleEvent);
    eventSource.addEventListener("security", handleEvent);
    eventSource.addEventListener("performance", handleEvent);
    eventSource.onerror = () => setGatewayState("fallback");
    return () => eventSource.close();
  }, []);

  const currentModel = useMemo(() => activeModel(status), [status]);
  const refreshStatus = async () => setStatus(await loadStatus());

  async function selectTask(taskProfile: TaskProfile) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/models/select`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ taskProfile }),
      });
      if (!response.ok) {
        throw new Error("Model selection failed");
      }
      const body = (await response.json()) as { activeModelId: string };
      setStatus((previous) => ({ ...previous, activeModelId: body.activeModelId }));
      setGatewayState("live");
    } catch {
      const localCandidate = status.models.find(
        (model) => model.enabled && model.taskProfiles.includes(taskProfile),
      );
      if (localCandidate) {
        setStatus((previous) => ({ ...previous, activeModelId: localCandidate.id }));
      }
      setGatewayState("fallback");
    }
  }

  async function emergencyStop() {
    const response = await fetch(`${API_BASE_URL}/api/emergency-stop`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "Emergency stop from Jarvis desktop console." }),
    });
    if (!response.ok) {
      throw new Error("Emergency stop failed");
    }
    setStatus(await loadStatus());
  }

  if (isHud) {
    return <HudOverlay status={status} liveEvents={liveEvents} onOpenDashboard={() => window.open(window.location.origin, "_blank")} />;
  }

  function renderSection() {
    switch (activeSection) {
      case "home":
        return (
          <>
            <SectionDrawer title="Live posture" summary="Reports and throughput, grouped for a quick scan." defaultOpen>
              <ReportsPanel status={status} />
              <PerformancePanel status={status} />
            </SectionDrawer>
            <SectionDrawer title="Growth and startup" summary="Open when you want service boot state or evolution notes.">
              <GrowthReport status={status} />
              <StartupPanel status={status} />
            </SectionDrawer>
          </>
        );
      case "chat":
        return (
          <>
            <SectionDrawer title="Conversation" summary="Command Jarvis or steer current work." defaultOpen>
              <ConversationPanel status={status} liveEvents={liveEvents} onTaskCreated={setStatus} />
            </SectionDrawer>
            <SectionDrawer title="Queue" summary="Steer, interrupt, cancel, and preserve checkpoints.">
              <TaskQueuePanel tasks={status.tasks ?? []} onRefresh={refreshStatus} />
            </SectionDrawer>
          </>
        );
      case "models":
        return (
          <>
            <SectionDrawer title="Model hub" summary="Switch, benchmark, and route active models." defaultOpen>
              <ModelHub status={status} onTaskSelect={selectTask} />
              <ModelReadinessPanel />
            </SectionDrawer>
            <SectionDrawer title="Catalog and setup" summary="Feature dependencies and future scaling stay separate.">
              <ModelCatalogPanel status={status} onRefresh={refreshStatus} />
              <FeatureDownloadsPanel />
              <FutureScalingPanel />
            </SectionDrawer>
          </>
        );
      case "voice":
        return (
          <>
            <SectionDrawer title="Voice loop" summary="STT, TTS, samples, and local fallback status." defaultOpen>
              <VoicePanel status={status} />
            </SectionDrawer>
            <SectionDrawer title="Brain sidecar" summary="Open for Python orchestration and capability detail.">
              <BrainPanel />
            </SectionDrawer>
          </>
        );
      case "vision":
        return (
          <>
            <SectionDrawer title="Vision controls" summary="Image analysis and sensor capture remain approval-gated." defaultOpen>
              <VisionPanel status={status} onRefresh={refreshStatus} />
            </SectionDrawer>
            <SectionDrawer title="Modality studio" summary="Text, speech, image, video, audio, music, maps.">
              <ModalityStudio />
            </SectionDrawer>
          </>
        );
      case "agents":
        return (
          <>
            <SectionDrawer title="Agent flow" summary="Planner, executor, memory, and safety coordination." defaultOpen>
              <AgentFlow agents={status.agents} />
            </SectionDrawer>
            <SectionDrawer title="Souls" summary="Named agent personalities, voices, and model preferences.">
              <AgentSoulsPanel status={status} />
            </SectionDrawer>
          </>
        );
      case "memory":
        return (
          <>
            <SectionDrawer title="Timeline" summary="Recall conversations, decisions, preferences, and projects." defaultOpen>
              <MemoryTimeline status={status} />
            </SectionDrawer>
            <SectionDrawer title="Time-travel undo" summary="Open for reversible checkpoints and restore state.">
              <UndoJournalPanel />
            </SectionDrawer>
          </>
        );
      case "skills":
        return (
          <>
            <SectionDrawer title="Connectors" summary="Permissions, data touched, approvals, and dry-runs." defaultOpen>
              <ConnectorsAndSkills status={status} onRefresh={refreshStatus} />
            </SectionDrawer>
            <SectionDrawer title="Reference forge" summary="OpenClaw, Ruflo, and Jarvis references as ingredients.">
              <ReferencePanel status={status} />
            </SectionDrawer>
          </>
        );
      case "devices":
        return (
          <>
            <SectionDrawer title="Local devices" summary="Inspect state first; control actions remain guarded." defaultOpen>
              <DevicePanel status={status} onRefresh={refreshStatus} />
            </SectionDrawer>
            <SectionDrawer title="Service health" summary="Open for gateway, brain, audio, and vision readiness.">
              <ServiceHealthPanel />
            </SectionDrawer>
          </>
        );
      case "social":
        return (
          <>
            <SectionDrawer title="Social outbox" summary="Draft locally, preview, then request approval." defaultOpen>
              <SocialOutboxPanel status={status} onRefresh={refreshStatus} />
            </SectionDrawer>
            <SectionDrawer title="Mobile pairing" summary="LAN/WireGuard-friendly companion tokens.">
              <MobilePairingPanel status={status} onRefresh={refreshStatus} />
            </SectionDrawer>
          </>
        );
      case "maps":
        return (
          <SectionDrawer title="Local map room" summary="Offline-first routes and local device context." defaultOpen>
            <MapPanel status={status} onRefresh={refreshStatus} />
          </SectionDrawer>
        );
      case "reports":
        return (
          <>
            <SectionDrawer title="Operations" summary="Daily reports and safety posture." defaultOpen>
              <ReportsPanel status={status} />
            </SectionDrawer>
            <SectionDrawer title="Growth and throughput" summary="Evolution notes and synthetic performance baseline.">
              <GrowthReport status={status} />
              <PerformancePanel status={status} />
            </SectionDrawer>
          </>
        );
      case "security":
        return (
          <>
            <SectionDrawer title="Safety kernel" summary="Core protection and blocked action classes." defaultOpen>
              <SecurityPanel status={status} />
            </SectionDrawer>
            <SectionDrawer title="Approvals and undo" summary="Risky actions and reversible checkpoints.">
              <Approvals status={status} onRefresh={refreshStatus} />
              <UndoJournalPanel />
            </SectionDrawer>
          </>
        );
      case "settings":
        return (
          <>
            <SectionDrawer title="Settings" summary="Local-only preferences and runtime configuration." defaultOpen>
              <SettingsPanel status={status} onRefresh={refreshStatus} />
            </SectionDrawer>
            <SectionDrawer title="Startup and health" summary="Boot sequence, service status, and doctor checks.">
              <ServiceHealthPanel />
              <StartupPanel status={status} />
            </SectionDrawer>
          </>
        );
      default:
        return null;
    }
  }

  return (
    <main className="app-shell">
      <FloatingJarvisOrb status={status} />
      <Header status={status} onEmergencyStop={emergencyStop} />
      <CommandDeck status={status} gatewayState={gatewayState} onSectionChange={setActiveSection} />
      <SystemSummary status={status} />
      <SectionRail active={activeSection} onChange={setActiveSection} />
      <SectionBrief active={activeSection} status={status} />
      <section className={`dashboard-grid section-${activeSection}`}>
        {renderSection()}
      </section>
    </main>
  );
}
