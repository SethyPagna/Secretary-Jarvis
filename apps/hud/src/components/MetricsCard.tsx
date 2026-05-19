import { Activity, Gauge, LayoutDashboard, ListChecks, Mic, Settings, TerminalSquare, Waypoints, Wifi } from "lucide-react";
import type { JarvisStatus } from "@jarvis/core";
import type { HudPanel } from "../types";

export function MetricsCard({
  status,
  visible,
  onOpenPanel
}: {
  status: JarvisStatus | null;
  visible: boolean;
  onOpenPanel: (panel: HudPanel) => void;
}) {
  const performance = status?.performance;
  const activeTasks = status?.tasks?.filter((task) => task.status === "running" || task.status === "queued").length ?? 0;
  const ram = status?.hardwareProfile ? `${Math.round(status.hardwareProfile.totalRamGb * 0.42)} / ${status.hardwareProfile.totalRamGb} GB` : "--";
  const cpu = performance ? `${Math.round(Math.min(98, performance.tokensPerSecond * 3))}%` : "--";
  const net = status ? "12K / 3K" : "--";
  const activityLines = compactActivityLines(status);
  const activeModel = status?.models?.find((candidate) => candidate.id === status.activeModelId);
  const ttsEngine = status?.audioEngines?.find((engine) => engine.role === "tts" && (engine.status === "ready" || engine.installed));
  const voiceState = status?.voiceSession?.state ?? "idle";

  return (
    <div className={visible ? "metrics-card orb-mini-hud visible" : "metrics-card orb-mini-hud"} aria-hidden={!visible} aria-label="Jarvis orb mini HUD">
      <div className="orb-mini-system" aria-label="Jarvis live bridge status">
        <span className={status ? "online" : "offline"}><i />{status ? "online" : "offline"}</span>
        <span>{activeModel?.label ?? "local model"}</span>
        <span>{ttsEngine?.label ?? status?.voiceSession?.ttsEngineId ?? "voice local"}</span>
        <span>{voiceState}</span>
      </div>
      <div className="orb-mini-metrics" aria-label="Jarvis compact metrics">
        <span title="CPU"><Gauge size={14} />{cpu}</span>
        <span title="RAM"><Activity size={14} />{ram}</span>
        <span title="Network"><Wifi size={14} />{net}</span>
        <span title="Tasks"><ListChecks size={14} />{activeTasks}</span>
      </div>
      <div className="orb-mini-voice" aria-label="Jarvis compact voice state">
        <span><i className="dot-listening" />listen</span>
        <span><i className="dot-processing" />think</span>
        <span><i className="dot-error" />alert</span>
      </div>
      <div className="orb-mini-terminal" aria-label="Jarvis terminal snippet">
        {activityLines.map((line, index) => (
          <code key={`${line}-${index}`}>{line}</code>
        ))}
      </div>
      <div className="orb-mini-actions" aria-label="Jarvis quick actions">
        <button type="button" onClick={() => onOpenPanel("voice")} aria-label="Open voice command" data-tooltip="Voice">
          <Mic size={14} aria-hidden="true" />
        </button>
        <button type="button" onClick={() => onOpenPanel("text")} aria-label="Open text input" data-tooltip="Text">
          <TerminalSquare size={14} aria-hidden="true" />
        </button>
        <button type="button" onClick={() => onOpenPanel("dashboard")} aria-label="Open dashboard" data-tooltip="Dashboard">
          <LayoutDashboard size={14} aria-hidden="true" />
        </button>
        <button type="button" onClick={() => onOpenPanel("workflows")} aria-label="Open workflows" data-tooltip="Workflows">
          <Waypoints size={14} aria-hidden="true" />
        </button>
        <button type="button" onClick={() => onOpenPanel("settings")} aria-label="Open system status" data-tooltip="System">
          <Settings size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function compactActivityLines(status: JarvisStatus | null): string[] {
  const taskLine = status?.tasks?.[0]
    ? `${status.tasks[0].status}: ${status.tasks[0].title}`
    : "runtime: quiet";
  const model = status?.models?.find((candidate) => candidate.id === status.activeModelId);
  const modelLine = model ? `model: ${model.label}` : "model: local";
  return [truncateLine(taskLine), truncateLine(modelLine)];
}

function truncateLine(line: string): string {
  return line.length > 54 ? `${line.slice(0, 51)}...` : line;
}
