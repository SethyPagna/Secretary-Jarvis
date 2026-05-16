import { Cable, Cpu, Mic, Send, Settings, UserCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { JarvisStatus, ModelAssetManifest, VoiceRuntimeReadiness } from "@jarvis/core";
import { WorkflowConsole } from "./WorkflowConsole";
import type { HudPanel as HudPanelName } from "../types";

export function HudPanel({
  panel,
  status,
  apiBaseUrl,
  onRecognizing,
  onClose
}: {
  panel: HudPanelName;
  status: JarvisStatus | null;
  apiBaseUrl: string;
  onRecognizing?: (message: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [assetSummary, setAssetSummary] = useState<ModelAssetSummary | null>(null);
  const [voiceReadiness, setVoiceReadiness] = useState<VoiceRuntimeReadiness | null>(null);
  const models = status?.models ?? [];
  const activeModel = models.find((model) => model.id === status?.activeModelId) ?? models[0];
  const tasks = status?.tasks?.slice(0, 3) ?? [];

  useEffect(() => {
    if (panel !== "dashboard") {
      return;
    }
    let cancelled = false;
    fetch(`${apiBaseUrl}/api/models/local-assets`)
      .then((response) => (response.ok ? response.json() : undefined))
      .then((payload: LocalAssetResponse | undefined) => {
        if (!cancelled && payload?.summary) {
          setAssetSummary({
            readyComplete: payload.summary.readyComplete,
            futureScalingComplete: payload.summary.futureScalingComplete,
            missingOrPartial: payload.summary.missingOrPartial,
            totalReady: payload.ready?.length ?? 0,
            totalFuture: payload.futureScaling?.length ?? 0,
          });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, panel]);

  useEffect(() => {
    if (panel !== "voice") {
      return;
    }
    let cancelled = false;
    fetch(`${apiBaseUrl}/api/voice/readiness`)
      .then((response) => (response.ok ? response.json() : undefined))
      .then((payload: VoiceReadinessResponse | undefined) => {
        if (!cancelled && payload?.readiness) {
          setVoiceReadiness(payload.readiness);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, panel]);

  async function submitText(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!text.trim()) {
      return;
    }
    await fetch(`${apiBaseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: text.trim(), taskProfile: "daily-assistant" })
    }).catch(() => undefined);
    setText("");
    onClose();
  }

  async function stopSpeaking() {
    await fetch(`${apiBaseUrl}/api/audio/tts/stop`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "HUD stop speaking" })
    }).catch(() => undefined);
  }

  async function recognizeOwnerDryRun() {
    onRecognizing?.("Recognizing you...");
    await fetch(`${apiBaseUrl}/api/identity/recognize/dry-run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "combined" })
    }).catch(() => undefined);
  }

  return (
    <section className={`hud-panel hud-panel-${panel}`} role="dialog" aria-label={`Jarvis ${panel} panel`}>
      <button className="panel-close" type="button" onClick={onClose} aria-label="Close panel">
        <X size={16} aria-hidden="true" />
      </button>
      {panel === "dashboard" && (
        <>
          <header><Cpu size={18} /><strong>Dashboard</strong></header>
          <div className="widget-grid">
            <Widget label="Model" value={activeModel?.label ?? "offline"} />
            <Widget label="Mode" value={status?.privacyMode ?? "strict-local"} />
            <Widget label="Tasks" value={`${tasks.length}`} />
            <Widget label="TPS" value={`${status?.performance?.tokensPerSecond ?? "--"}`} />
          </div>
          <div className="model-manifest-strip" aria-label="Local model asset manifests">
            <span><small>Ready</small><strong>{assetSummary ? `${assetSummary.readyComplete}/${assetSummary.totalReady}` : "--"}</strong></span>
            <span><small>Future</small><strong>{assetSummary ? `${assetSummary.futureScalingComplete}/${assetSummary.totalFuture}` : "--"}</strong></span>
            <span><small>Needs</small><strong>{assetSummary?.missingOrPartial ?? "--"}</strong></span>
          </div>
          <div className="tiny-feed">
            {tasks.length ? tasks.map((task) => <span key={task.id}>{task.status} / {task.title}</span>) : <span>Quiet. Ready.</span>}
          </div>
        </>
      )}
      {panel === "voice" && (
        <>
          <header><Mic size={18} /><strong>Voice</strong></header>
          <div className="mic-pulse"><Mic size={30} /></div>
          <p>{voiceReadiness?.summary.sttReady ? "Say a command..." : "Voice staged"}</p>
          <div className="voice-readiness-strip" aria-label="Voice runtime readiness">
            <span><small>STT</small><strong>{voiceReadiness?.primaryStt.status ?? "--"}</strong></span>
            <span><small>TTS</small><strong>{voiceReadiness?.summary.ttsReady ? "ready" : "staged"}</strong></span>
            <span><small>Voice</small><strong>{voiceReadiness ? `${voiceReadiness.summary.sampleCount}` : "--"}</strong></span>
            <span><small>Needs</small><strong>{voiceReadiness?.summary.missingRequired ?? "--"}</strong></span>
          </div>
          <div className="hud-identity-strip">
            <UserCheck size={16} />
            <span>{status?.identityReadiness?.voiceVerification.status ?? "staged"}</span>
            <span>{status?.identityReadiness?.faceRecognition.cameraStatus ?? "locked"}</span>
            <button type="button" onClick={recognizeOwnerDryRun}>Dry-run</button>
          </div>
          <button className="hud-secondary-action" type="button" onClick={stopSpeaking}>Stop speaking</button>
        </>
      )}
      {panel === "text" && (
        <form className="hud-input-form" onSubmit={submitText}>
          <input value={text} onChange={(event) => setText(event.target.value)} placeholder="Ask Jarvis anything..." autoFocus />
          <button type="submit" aria-label="Send to Jarvis"><Send size={17} /></button>
        </form>
      )}
      {panel === "devices" && (
        <>
          <header><Cable size={18} /><strong>Devices</strong></header>
          <div className="device-grid">
            {(status?.connectors ?? []).slice(0, 6).map((connector) => (
              <span key={connector.id} className={connector.enabled ? "online" : ""}>
                <i />{connector.name}
              </span>
            ))}
          </div>
        </>
      )}
      {panel === "workflows" && <WorkflowConsole apiBaseUrl={apiBaseUrl} />}
      {panel === "settings" && (
        <>
          <header><Settings size={18} /><strong>Settings</strong></header>
          <div className="setting-list">
            <span>Privacy <b>{status?.privacyMode ?? "strict-local"}</b></span>
            <span>Audio <b>local</b></span>
            <span>Theme <b>dark</b></span>
          </div>
        </>
      )}
    </section>
  );
}

interface LocalAssetResponse {
  ready?: ModelAssetManifest[];
  futureScaling?: ModelAssetManifest[];
  summary?: {
    readyComplete: number;
    futureScalingComplete: number;
    missingOrPartial: number;
  };
}

interface ModelAssetSummary {
  readyComplete: number;
  futureScalingComplete: number;
  missingOrPartial: number;
  totalReady: number;
  totalFuture: number;
}

interface VoiceReadinessResponse {
  readiness?: VoiceRuntimeReadiness;
}

function Widget({ label, value }: { label: string; value: string }) {
  return (
    <span className="hud-widget">
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  );
}
