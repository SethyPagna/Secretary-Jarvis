import {
  Activity,
  Brain,
  Cable,
  CheckCircle2,
  ChevronRight,
  Cpu,
  Database,
  Download,
  Eye,
  Fingerprint,
  GitBranch,
  Image,
  Lock,
  Map,
  Mic,
  Music,
  Play,
  Radar,
  Radio,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TerminalSquare,
  Video,
  Volume2,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  evaluateActionPolicy,
  seededStatus,
  type ActionRequest,
  type AgentProfile,
  type MobilePairing,
  type ModelDryRunResult,
  type JarvisStatus,
  type ModelProfile,
  type OutboundMessageDraft,
  type StreamEvent,
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

  return (
    <aside className="floating-orb" aria-label="Jarvis floating presence">
      <div className="orb-core">
        <div className="orb-ring ring-a" />
        <div className="orb-ring ring-b" />
        <div className="orb-pulse" />
        <Brain size={30} aria-hidden="true" />
      </div>
      <div>
        <strong>Jarvis</strong>
        <span>{model.label}</span>
      </div>
    </aside>
  );
}

function Header({ status }: { status: JarvisStatus }) {
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
        <button className="icon-button" type="button" aria-label="Emergency stop">
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

function ModelCatalogPanel({ status }: { status: JarvisStatus }) {
  const [dryRun, setDryRun] = useState<ModelDryRunResponse | null>(null);
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
            <button type="button" onClick={() => runDryRun(model)} disabled={busyModelRef === model.modelRef}>
              {busyModelRef === model.modelRef ? "Checking" : "Dry-run"}
            </button>
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
  return (
    <section className="panel timeline-panel">
      <div className="panel-header">
        <div>
          <h2>MemoryOS Timeline</h2>
          <p>Past, present, and future signals with provenance and confidence.</p>
        </div>
        <Database size={22} aria-hidden="true" />
      </div>
      <div className="timeline">
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

function Approvals({ status }: { status: JarvisStatus }) {
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
                <button className="approve" type="button">
                  <CheckCircle2 size={16} aria-hidden="true" />
                  Approve
                </button>
                <button className="deny" type="button">
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

function ConnectorsAndSkills({ status }: { status: JarvisStatus }) {
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
            <em>{connector.enabled ? "enabled" : "locked"}</em>
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
            <audio controls preload="none" src={`/${asset.localPath}`} />
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
  const conversations = status.conversations ?? [];
  const latestConversation = conversations[0];

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

export function App() {
  const [status, setStatus] = useState<JarvisStatus>(seededStatus);
  const [gatewayState, setGatewayState] = useState<"live" | "fallback">("fallback");
  const [liveEvents, setLiveEvents] = useState<StreamEvent[]>([]);

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
      if (event.type === "task" || event.type === "conversation" || event.type === "status") {
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
    eventSource.onerror = () => setGatewayState("fallback");
    return () => eventSource.close();
  }, []);

  const currentModel = useMemo(() => activeModel(status), [status]);

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

  return (
    <main className="app-shell">
      <FloatingJarvisOrb status={status} />
      <Header status={status} />
      <section className="hero-surface">
        <div className="hero-copy">
          <h2>Private intelligence, wired to grow.</h2>
          <p>
            Jarvis is awake in strict local mode, routing work through owned agents, guarded connectors,
            memory timelines, and local model profiles.
          </p>
        </div>
        <div className="hero-telemetry">
          <span>Gateway {gatewayState}</span>
          <strong>{currentModel.label}</strong>
          <em>{currentModel.notes}</em>
        </div>
      </section>
      <SystemSummary status={status} />
      <section className="dashboard-grid">
        <ConversationPanel status={status} liveEvents={liveEvents} onTaskCreated={setStatus} />
        <TaskQueuePanel tasks={status.tasks ?? []} onRefresh={async () => setStatus(await loadStatus())} />
        <ModelHub status={status} onTaskSelect={selectTask} />
        <ModelCatalogPanel status={status} />
        <VoicePanel status={status} />
        <SocialOutboxPanel status={status} onRefresh={async () => setStatus(await loadStatus())} />
        <MobilePairingPanel status={status} onRefresh={async () => setStatus(await loadStatus())} />
        <StartupPanel status={status} />
        <ReferencePanel status={status} />
        <AgentFlow agents={status.agents} />
        <MemoryTimeline status={status} />
        <Approvals status={status} />
        <ConnectorsAndSkills status={status} />
        <ModalityStudio />
        <GrowthReport status={status} />
      </section>
    </main>
  );
}
