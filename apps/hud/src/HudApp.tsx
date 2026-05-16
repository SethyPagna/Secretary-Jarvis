import { AnimatePresence, motion } from "framer-motion";
import { Activity, Bot, Check, CircleStop, Cpu, LayoutDashboard, Mic, Route, Settings, ShieldAlert, TerminalSquare, Waypoints, X } from "lucide-react";
import { lazy, Suspense, useEffect, useState, type CSSProperties } from "react";
import { HudPanel } from "./components/HudPanel";
import { MetricsCard } from "./components/MetricsCard";
import { RadialMenu } from "./components/RadialMenu";
import { useJarvisStatus } from "./hooks/useJarvisStatus";
import { HudStateProvider, useHudState } from "./state/hudState";
import type { HudPanel as HudPanelName } from "./types";
import type { HudState } from "@jarvis/core";

const Orb = lazy(() => import("./components/Orb").then((module) => ({ default: module.Orb })));

type CommandCapsuleState = "queued" | "running" | "completed" | "failed" | "cancelled";

interface CommandCapsule {
  taskId?: string;
  state: CommandCapsuleState;
  title: string;
  detail: string;
}

export function HudApp() {
  return (
    <HudStateProvider>
      <HudSurface />
    </HudStateProvider>
  );
}

function HudSurface() {
  const { state, caption, setHudState, resetHud } = useHudState();
  const { status, online, apiBaseUrl } = useJarvisStatus();
  const [menuOpen, setMenuOpen] = useState(false);
  const [hoveringOrb, setHoveringOrb] = useState(false);
  const [panel, setPanel] = useState<HudPanelName | null>(null);
  const [commandCapsule, setCommandCapsule] = useState<CommandCapsule | null>(null);
  const pendingApproval = status?.pendingApprovals?.[0];
  const workflowApproval = pendingApproval?.connectorId === "workflow-engine" ? pendingApproval : undefined;
  const visualState = pendingApproval ? "approval" : state;
  const active = visualState !== "idle";
  const activeCaption = pendingApproval ? "Approval required." : caption;

  useEffect(() => {
    return window.jarvisDesktop?.onTrayAction((action) => {
      setMenuOpen(false);
      if (action.type === "open-dashboard") {
        setPanel("dashboard");
      } else if (action.type === "mute-mic") {
        setPanel("settings");
      } else if (action.type === "pause-agents" || action.type === "emergency-stop") {
        setPanel("dashboard");
      }
      setHudState(action.state, action.message);
    });
  }, [setHudState]);

  useEffect(() => {
    const source = new EventSource(`${apiBaseUrl}/api/events`);
    const onTask = (message: MessageEvent<string>) => {
      const streamEvent = safeParseStreamEvent(message.data);
      const task = streamEvent?.payload?.task as { id?: string; title?: string; status?: CommandCapsuleState; result?: string } | undefined;
      const event = streamEvent?.payload?.event as { kind?: string; message?: string } | undefined;
      if (!task?.id || !event?.kind) {
        return;
      }
      const taskId = task.id;
      const eventKind = event.kind;
      setCommandCapsule((current) => {
        if (current?.taskId && current.taskId !== taskId) {
          return current;
        }
        const state = capsuleStateForEvent(eventKind, task.status);
        if (!state) {
          return current;
        }
        return {
          taskId,
          state,
          title: task.title ?? current?.title ?? "Jarvis task",
          detail: state === "completed" ? compactCapsuleDetail(task.result ?? event.message ?? "Done.") : compactCapsuleDetail(event.message ?? task.title ?? "Working."),
        };
      });
    };
    source.addEventListener("task", onTask);
    source.onerror = () => undefined;
    return () => {
      source.removeEventListener("task", onTask);
      source.close();
    };
  }, [apiBaseUrl]);

  function openPanel(nextPanel: HudPanelName) {
    setPanel(nextPanel);
    setMenuOpen(false);
    setHudState(nextPanel === "voice" ? "listening" : nextPanel === "dashboard" ? "thinking" : "wake");
  }

  function closeAll() {
    setMenuOpen(false);
    setPanel(null);
    resetHud();
  }

  async function decideApproval(outcome: "approve" | "deny") {
    if (!pendingApproval) {
      return;
    }
    const systemAction =
      pendingApproval.agentId === "vulcan" ||
      pendingApproval.connectorId === "filesystem" ||
      ["write-local", "delete-local", "run-script", "service-control", "device-control", "sensor-capture"].includes(pendingApproval.category);
    const endpoint =
      outcome === "approve" && systemAction
        ? `/api/system/actions/${pendingApproval.id}/approve`
        : `/api/approvals/${pendingApproval.id}/${outcome}`;
    setHudState(outcome === "approve" ? "executing" : "idle", outcome === "approve" ? "Executing approved action." : "Approval denied.");
    await fetch(`${apiBaseUrl}${endpoint}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}"
    }).catch(() => setHudState("error", "Approval action failed."));
  }

  return (
    <main className={`hud-stage hud-state-${visualState} ${panel ? "panel-open" : ""}`} aria-label="Jarvis centered HUD">
      <DesktopAppChrome
        online={online}
        activeModel={status?.models?.find((model) => model.id === status?.activeModelId)?.label ?? "Local model"}
        runningTasks={(status?.tasks ?? []).filter((task) => task.status === "running").length}
        pendingApprovals={status?.pendingApprovals?.length ?? 0}
        onOpenPanel={openPanel}
        onEmergencyStop={() => {
          void fetch(`${apiBaseUrl}/api/emergency-stop`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ reason: "Desktop app emergency stop" })
          }).finally(() => setHudState("error", "Emergency stop sent."));
        }}
      />
      <div className="orb-interaction-zone" onMouseEnter={() => setHoveringOrb(true)} onMouseLeave={() => setHoveringOrb(false)}>
        <MetricsCard status={status} visible={hoveringOrb && !menuOpen && !panel} />
        <Suspense
          fallback={
            <OrbFallback
              visualState={visualState}
              online={online}
              pendingApproval={Boolean(pendingApproval)}
              onClick={() => {
                setPanel(null);
                setMenuOpen((value) => !value);
                setHudState(menuOpen ? "idle" : "wake", online ? "Jarvis ready." : "Gateway offline.");
              }}
            />
          }
        >
          <Orb
            visualState={visualState}
            online={online}
            pendingApproval={Boolean(pendingApproval)}
            onClick={() => {
              setPanel(null);
              setMenuOpen((value) => !value);
              setHudState(menuOpen ? "idle" : "wake", online ? "Jarvis ready." : "Gateway offline.");
            }}
          />
        </Suspense>
      </div>
      <RadialMenu open={menuOpen} onSelect={openPanel} onClose={closeAll} />
      <AnimatePresence>
        {active && (
          <motion.div
            className="hud-activation-line"
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
          >
            <span />
            {activeCaption && <strong>{activeCaption}</strong>}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {commandCapsule && !panel && (
          <motion.div
            className={`command-capsule state-${commandCapsule.state}`}
            role="status"
            aria-label="Jarvis command capsule"
            initial={{ opacity: 0, y: 12, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            <i aria-hidden="true" />
            <span>
              <b>{labelForCapsule(commandCapsule.state)}</b>
              <small>{commandCapsule.detail || commandCapsule.title}</small>
            </span>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {pendingApproval && !panel && (
          <motion.div
            className={workflowApproval ? "workflow-approval-popup" : "approval-chip"}
            initial={{ opacity: 0, y: 14, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            {workflowApproval ? (
              <>
                <div className="workflow-approval-icon">
                  <Route size={18} aria-hidden="true" />
                </div>
                <span>
                  <b>{workflowApproval.target}</b>
                  <small>{workflowApproval.reason}</small>
                </span>
                <button className="details" type="button" onClick={() => setPanel("workflows")} aria-label="Open workflow details">
                  Flow
                </button>
                <button className="approve" type="button" onClick={() => void decideApproval("approve")} aria-label="Approve workflow">
                  <Check size={15} aria-hidden="true" />
                </button>
                <button className="deny" type="button" onClick={() => void decideApproval("deny")} aria-label="Deny workflow">
                  <X size={15} aria-hidden="true" />
                </button>
              </>
            ) : (
              <>
                <ShieldAlert size={17} aria-hidden="true" />
                <span>
                  <b>{pendingApproval.category}</b>
                  <small>{pendingApproval.target}</small>
                </span>
                <button className="approve" type="button" onClick={() => void decideApproval("approve")} aria-label="Approve action">
                  <Check size={15} aria-hidden="true" />
                </button>
                <button className="deny" type="button" onClick={() => void decideApproval("deny")} aria-label="Deny action">
                  <X size={15} aria-hidden="true" />
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {panel && (
          <motion.div
            className="panel-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={closeAll}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.24, ease: "easeOut" }}
              onClick={(event) => event.stopPropagation()}
            >
              <HudPanel
                panel={panel}
                status={status}
                apiBaseUrl={apiBaseUrl}
                onCommandQueued={(capsule) => setCommandCapsule(capsule)}
                onRecognizing={(message) => setHudState("recognizing", message)}
                onClose={closeAll}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <button className="hud-corner-control" type="button" aria-label="Jarvis settings" onClick={() => openPanel("settings")}>
        <Settings size={18} aria-hidden="true" />
      </button>
    </main>
  );
}

function DesktopAppChrome({
  online,
  activeModel,
  runningTasks,
  pendingApprovals,
  onOpenPanel,
  onEmergencyStop
}: {
  online: boolean;
  activeModel: string;
  runningTasks: number;
  pendingApprovals: number;
  onOpenPanel: (panel: HudPanelName) => void;
  onEmergencyStop: () => void;
}) {
  const controls: Array<{ panel: HudPanelName; label: string; icon: typeof LayoutDashboard }> = [
    { panel: "dashboard", label: "Home", icon: LayoutDashboard },
    { panel: "text", label: "Terminal", icon: TerminalSquare },
    { panel: "voice", label: "Voice", icon: Mic },
    { panel: "workflows", label: "Flows", icon: Waypoints },
    { panel: "devices", label: "Devices", icon: Cpu },
    { panel: "settings", label: "System", icon: Settings },
  ];

  return (
    <aside className="desktop-app-chrome" aria-label="Jarvis desktop shell">
      <div className="desktop-brand">
        <span><Bot size={18} aria-hidden="true" /></span>
        <b>Jarvis</b>
        <small>{online ? "online" : "offline"}</small>
      </div>
      <nav className="desktop-rail" aria-label="Jarvis sections">
        {controls.map((control) => {
          const Icon = control.icon;
          return (
            <button
              key={control.panel}
              type="button"
              onClick={() => onOpenPanel(control.panel)}
              aria-label={`Open ${control.label} panel`}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{control.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="desktop-status-card">
        <Activity size={16} aria-hidden="true" />
        <span>
          <small>Model</small>
          <b>{activeModel}</b>
        </span>
      </div>
      <div className="desktop-status-grid">
        <span>
          <small>Tasks</small>
          <b>{runningTasks}</b>
        </span>
        <span>
          <small>Gates</small>
          <b>{pendingApprovals}</b>
        </span>
      </div>
      <button className="desktop-stop" type="button" onClick={onEmergencyStop}>
        <CircleStop size={17} aria-hidden="true" />
        Stop
      </button>
    </aside>
  );
}

function OrbFallback({
  visualState,
  online,
  pendingApproval,
  onClick
}: {
  visualState: HudState;
  online: boolean;
  pendingApproval: boolean;
  onClick: () => void;
}) {
  const state = online ? visualState : "error";
  return (
    <button
      className={`orb-button orb-fallback orb-visual-${state} ${pendingApproval ? "has-approval" : ""}`}
      type="button"
      aria-label="Open Jarvis controls"
      data-state={state}
      onClick={onClick}
    >
      <span className="orb-aura" />
      <span className="orb-scan-ring" aria-hidden="true" />
      <span className="orb-data-arcs" aria-hidden="true" />
      <span className="orb-kinetic-frame" aria-hidden="true" />
      <span className="orb-particle-field" aria-hidden="true">
        {Array.from({ length: 12 }, (_, index) => (
          <i key={index} style={{ "--i": index } as CSSProperties} />
        ))}
      </span>
      <span className="orb-state-glyph" aria-hidden="true" />
      <span className="orb-css-core" aria-hidden="true" />
    </button>
  );
}

function labelForCapsule(state: CommandCapsuleState): string {
  return {
    queued: "Queued",
    running: "Running",
    completed: "Done",
    failed: "Needs review",
    cancelled: "Cancelled",
  }[state];
}

function capsuleStateForEvent(kind: string, taskStatus?: CommandCapsuleState): CommandCapsuleState | undefined {
  if (taskStatus && ["queued", "running", "completed", "failed", "cancelled"].includes(taskStatus)) {
    return taskStatus;
  }
  if (kind === "queued") {
    return "queued";
  }
  if (kind === "started" || kind === "token" || kind === "tool") {
    return "running";
  }
  if (kind === "completed") {
    return "completed";
  }
  if (kind === "failed") {
    return "failed";
  }
  if (kind === "cancelled") {
    return "cancelled";
  }
  return undefined;
}

function compactCapsuleDetail(value: string): string {
  return value.length > 72 ? `${value.slice(0, 69)}...` : value;
}

function safeParseStreamEvent(data: string): { payload?: Record<string, unknown> } | undefined {
  try {
    return JSON.parse(data) as { payload?: Record<string, unknown> };
  } catch {
    return undefined;
  }
}
