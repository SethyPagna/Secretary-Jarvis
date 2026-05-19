import { AnimatePresence, motion } from "framer-motion";
import { Activity, Check, CircleStop, Cpu, FlaskConical, LayoutDashboard, Mic, Power, RefreshCw, Route, Settings, ShieldAlert, TerminalSquare, Waypoints, X } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties, type FocusEvent } from "react";
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

interface VoiceSessionPayload {
  state?: string;
  message?: string;
  transcript?: Array<{ text?: string; final?: boolean }>;
}

export function HudApp() {
  return (
    <HudStateProvider>
      <HudSurface />
    </HudStateProvider>
  );
}

function HudSurface() {
  const shell = document.documentElement.dataset.shell ?? "overlay";
  const isOrbShell = shell === "orb";
  const { state, caption, setHudState, resetHud } = useHudState();
  const { status, online, apiBaseUrl } = useJarvisStatus();
  const [menuOpen, setMenuOpen] = useState(false);
  const [hoveringOrb, setHoveringOrb] = useState(false);
  const [panel, setPanel] = useState<HudPanelName | null>(null);
  const [commandCapsule, setCommandCapsule] = useState<CommandCapsule | null>(null);
  const [serviceIntent, setServiceIntent] = useState<"stop-services" | "restart-services" | null>(null);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [busyControl, setBusyControl] = useState<string | null>(null);
  const [approvalBusyId, setApprovalBusyId] = useState<string | null>(null);
  const [clearedApprovalIds, setClearedApprovalIds] = useState<Set<string>>(() => new Set());
  const pendingApproval = status?.pendingApprovals?.find((approval) => !clearedApprovalIds.has(approval.id));
  const workflowApproval = pendingApproval?.connectorId === "workflow-engine" ? pendingApproval : undefined;
  const visualState = pendingApproval ? "approval" : state;
  const active = visualState !== "idle";
  const activeCaption = pendingApproval ? "Approval required." : caption;

  useEffect(() => {
    return window.jarvisDesktop?.onTrayAction?.((action) => {
      setMenuOpen(false);
      if (action.type === "open-dashboard") {
        setPanel("dashboard");
      } else if (action.type === "open-voice") {
        setPanel("voice");
      } else if (action.type === "open-text") {
        setPanel("text");
      } else if (action.type === "open-workflows") {
        setPanel("workflows");
      } else if (action.type === "open-devices") {
        setPanel("devices");
      } else if (action.type === "open-settings") {
        setPanel("settings");
      } else if (action.type === "mute-mic") {
        setPanel("settings");
      } else if (action.type === "pause-agents" || action.type === "emergency-stop") {
        setPanel("dashboard");
      } else if (action.type === "live-test") {
        setPanel("settings");
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
    const onAudio = (message: MessageEvent<string>) => {
      const streamEvent = safeParseStreamEvent(message.data);
      const payload = streamEvent?.payload;
      const kind = typeof payload?.kind === "string" ? payload.kind : undefined;
      const voiceSession = payload?.voiceSession as VoiceSessionPayload | undefined;
      if (!kind && !voiceSession) {
        return;
      }
      const messageText = audioEventMessage(kind, voiceSession);
      setHudState(voiceHudStateForSession(voiceSession?.state, kind), messageText);
      setCommandCapsule({
        state: voiceCapsuleStateForSession(voiceSession?.state, kind),
        title: "Voice command",
        detail: compactCapsuleDetail(messageText),
      });
    };
    source.addEventListener("task", onTask);
    source.addEventListener("audio", onAudio);
    source.onerror = () => undefined;
    return () => {
      source.removeEventListener("task", onTask);
      source.removeEventListener("audio", onAudio);
      source.close();
    };
  }, [apiBaseUrl, setHudState]);

  function openPanel(nextPanel: HudPanelName) {
    if (isOrbShell) {
      const action = panelToTrayAction(nextPanel);
      if (action) {
        void window.jarvisDesktop?.runTrayCommand?.(action);
      } else {
        void window.jarvisDesktop?.showApp?.();
      }
      setMenuOpen(false);
      setOrbNativeInteractivity(false);
      setHudState(nextPanel === "voice" ? "listening" : nextPanel === "workflows" ? "planning" : "wake", "Opening Jarvis app.");
      return;
    }
    setPanel(nextPanel);
    setMenuOpen(false);
    setHudState(nextPanel === "voice" ? "listening" : nextPanel === "dashboard" ? "thinking" : "wake");
    if (nextPanel === "voice") {
      void startPushToTalkSession("main-app");
    }
  }

  function closeAll() {
    setMenuOpen(false);
    setPanel(null);
    setOrbNativeInteractivity(false);
    resetHud();
  }

  async function decideApproval(outcome: "approve" | "deny") {
    if (!pendingApproval) {
      return;
    }
    const systemAction = isSystemActionApproval(pendingApproval.category);
    const endpoint =
      outcome === "approve" && systemAction
        ? `/api/system/actions/${pendingApproval.id}/approve`
        : `/api/approvals/${pendingApproval.id}/${outcome}`;
    setApprovalBusyId(pendingApproval.id);
    setHudState(outcome === "approve" ? "executing" : "idle", outcome === "approve" ? "Executing approved action." : "Approval denied.");
    try {
      const response = await fetch(`${apiBaseUrl}${endpoint}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}"
      });
      if (!response.ok) {
        throw new Error(`Approval request failed with ${response.status}`);
      }
      setClearedApprovalIds((current) => new Set([...current, pendingApproval.id]));
      setCommandCapsule({
        state: outcome === "approve" ? "completed" : "cancelled",
        title: pendingApproval.title,
        detail: outcome === "approve" ? "Approved." : "Denied.",
      });
      setHudState(outcome === "approve" ? "executing" : "idle", outcome === "approve" ? "Approval accepted." : "Approval denied.");
    } catch {
      setHudState("error", "Approval action failed.");
    } finally {
      setApprovalBusyId(null);
    }
  }

  function requestServiceAction(intent: "stop-services" | "restart-services") {
    setServiceIntent(intent);
    setHudState("approval", intent === "stop-services" ? "Stop Jarvis services?" : "Restart Jarvis services?");
  }

  async function confirmServiceAction() {
    if (!serviceIntent) {
      return;
    }
    const action = serviceIntent;
    setServiceIntent(null);
    setBusyControl(action);
    setHudState(action === "stop-services" ? "approval" : "planning", action === "stop-services" ? "Stopping Jarvis. Ollama stays running." : "Restarting Jarvis.");
    await window.jarvisDesktop?.runTrayCommand?.(action).catch(() => setHudState("error", "Runtime control failed."));
    setBusyControl(null);
  }

  async function runLiveTestFromApp() {
    setBusyControl("live-test");
    setPanel("settings");
    setHudState("planning", "Running production live test.");
    await window.jarvisDesktop?.runTrayCommand?.("live-test").catch(() => setHudState("error", "Live test failed to start."));
    setBusyControl(null);
  }

  async function runEmergencyStopFromApp() {
    setBusyControl("emergency-stop");
    await fetch(`${apiBaseUrl}/api/emergency-stop`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "Desktop app emergency stop" })
    })
      .then((response) => setHudState(response.ok ? "approval" : "error", response.ok ? "Emergency stop sent." : "Emergency stop needs local supervisor."))
      .catch(() => setHudState("error", "Emergency stop failed."));
    setBusyControl(null);
  }

  async function startPushToTalkSession(source: "main-app" | "sidebar" | "orb" = "main-app") {
    setHudState("listening", "Starting local voice session.");
    setCommandCapsule({
      state: "running",
      title: "Voice command",
      detail: "Starting local push-to-talk session.",
    });
    try {
      const response = await fetch(`${apiBaseUrl}/api/voice/listening/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resetTranscript: true, source })
      });
      const payload = (await response.json().catch(() => ({}))) as { voiceSession?: VoiceSessionPayload; message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? `Voice session failed with ${response.status}`);
      }
      const message = payload.voiceSession?.message ?? payload.message ?? "Listening locally. Say a command or type a transcript chunk.";
      setHudState(voiceHudStateForSession(payload.voiceSession?.state, "voice-listening-started"), message);
      setCommandCapsule({
        state: "running",
        title: "Voice command",
        detail: compactCapsuleDetail(message),
      });
    } catch {
      setHudState("error", "Voice session could not start.");
      setCommandCapsule({
        state: "failed",
        title: "Voice command",
        detail: "Gateway voice session unavailable.",
      });
    }
  }

  function setOrbNativeInteractivity(interactive: boolean) {
    if (!isOrbShell) {
      return;
    }
    void window.jarvisDesktop?.setOrbInteractive?.(interactive).catch(() => undefined);
  }

  return (
    <main
      className={`hud-stage hud-state-${visualState} ${panel ? "panel-open" : ""} ${sidebarExpanded ? "sidebar-expanded" : "sidebar-collapsed"}`}
      aria-label="Jarvis centered HUD"
    >
      {!isOrbShell && (
        <DesktopAppChrome
          expanded={sidebarExpanded}
          activePanel={panel}
          online={online}
          activeModel={status?.models?.find((model) => model.id === status?.activeModelId)?.label ?? "Local model"}
          runningTasks={(status?.tasks ?? []).filter((task) => task.status === "running").length}
          pendingApprovals={status?.pendingApprovals?.length ?? 0}
          busyControl={busyControl}
          onExpandedChange={setSidebarExpanded}
          onOpenPanel={openPanel}
          onStopJarvis={() => requestServiceAction("stop-services")}
          onRestartJarvis={() => requestServiceAction("restart-services")}
          onLiveTest={() => void runLiveTestFromApp()}
          onEmergencyStop={() => void runEmergencyStopFromApp()}
        />
      )}
      <div
        className="orb-interaction-zone"
        onMouseEnter={() => {
          setHoveringOrb(true);
          setOrbNativeInteractivity(true);
        }}
        onMouseLeave={() => {
          setHoveringOrb(false);
          setOrbNativeInteractivity(menuOpen);
        }}
        onFocus={() => setOrbNativeInteractivity(true)}
        onBlur={() => setOrbNativeInteractivity(menuOpen)}
      >
        <MetricsCard status={status} visible={hoveringOrb && !menuOpen && !panel} onOpenPanel={openPanel} />
        <Suspense
          fallback={
            <OrbFallback
              visualState={visualState}
              online={online}
              pendingApproval={Boolean(pendingApproval)}
              onClick={() => {
                setPanel(null);
                setMenuOpen((value) => {
                  const next = !value;
                  setOrbNativeInteractivity(next);
                  return next;
                });
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
              setMenuOpen((value) => {
                const next = !value;
                setOrbNativeInteractivity(next);
                return next;
              });
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
                <button className="approve" type="button" onClick={() => void decideApproval("approve")} disabled={approvalBusyId === workflowApproval.id} aria-label="Approve workflow">
                  {approvalBusyId === workflowApproval.id ? <Activity size={15} aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}
                </button>
                <button className="deny" type="button" onClick={() => void decideApproval("deny")} disabled={approvalBusyId === workflowApproval.id} aria-label="Deny workflow">
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
                <button className="approve" type="button" onClick={() => void decideApproval("approve")} disabled={approvalBusyId === pendingApproval.id} aria-label="Approve action">
                  {approvalBusyId === pendingApproval.id ? <Activity size={15} aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}
                </button>
                <button className="deny" type="button" onClick={() => void decideApproval("deny")} disabled={approvalBusyId === pendingApproval.id} aria-label="Deny action">
                  <X size={15} aria-hidden="true" />
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {serviceIntent && (
          <motion.div
            className="service-confirmation"
            role="dialog"
            aria-label="Confirm Jarvis service control"
            initial={{ opacity: 0, y: 14, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <span>
              <b>{serviceIntent === "stop-services" ? "Stop Jarvis" : "Restart Jarvis"}</b>
              <small>Scope: Jarvis services only. Ollama is left running.</small>
            </span>
            <button type="button" className="approve" onClick={() => void confirmServiceAction()}>
              Confirm
            </button>
            <button type="button" className="deny" onClick={() => setServiceIntent(null)} aria-label="Cancel service control">
              <X size={15} aria-hidden="true" />
            </button>
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
      {!isOrbShell && (
        <button
          className="hud-corner-control orb-title-control"
          type="button"
          aria-label="Open Jarvis orb menu"
          onClick={() => {
            setPanel(null);
            setMenuOpen((value) => !value);
            setHudState(menuOpen ? "idle" : "wake", "Jarvis ready.");
          }}
        >
          <span className="orb-mark" aria-hidden="true" />
        </button>
      )}
    </main>
  );
}

function isSystemActionApproval(category: string): boolean {
  return ["write-local", "delete-local", "run-script", "service-control", "device-control", "irreversible-edit"].includes(category);
}

function panelToTrayAction(panel: HudPanelName): JarvisTrayActionType | null {
  const actions: Partial<Record<HudPanelName, JarvisTrayActionType>> = {
    dashboard: "open-dashboard",
    voice: "open-voice",
    text: "open-text",
    workflows: "open-workflows",
    devices: "open-devices",
    settings: "open-settings",
  };
  return actions[panel] ?? null;
}

function DesktopAppChrome({
  expanded,
  activePanel,
  online,
  activeModel,
  runningTasks,
  pendingApprovals,
  busyControl,
  onExpandedChange,
  onOpenPanel,
  onStopJarvis,
  onRestartJarvis,
  onLiveTest,
  onEmergencyStop
}: {
  expanded: boolean;
  activePanel: HudPanelName | null;
  online: boolean;
  activeModel: string;
  runningTasks: number;
  pendingApprovals: number;
  busyControl: string | null;
  onExpandedChange: (expanded: boolean) => void;
  onOpenPanel: (panel: HudPanelName) => void;
  onStopJarvis: () => void;
  onRestartJarvis: () => void;
  onLiveTest: () => void;
  onEmergencyStop: () => void;
}) {
  const chromeRef = useRef<HTMLElement | null>(null);
  const controls: Array<{ panel: HudPanelName; label: string; icon: typeof LayoutDashboard }> = [
    { panel: "text", label: "Command", icon: TerminalSquare },
    { panel: "workflows", label: "Flows", icon: Waypoints },
    { panel: "devices", label: "Control", icon: Cpu },
    { panel: "settings", label: "System", icon: Settings },
  ];

  useEffect(() => {
    if (!expanded) {
      return;
    }
    function collapseWhenPointerLeavesChrome(event: globalThis.PointerEvent) {
      const target = event.target;
      if (target instanceof Node && chromeRef.current?.contains(target)) {
        return;
      }
      onExpandedChange(false);
    }
    window.addEventListener("pointerdown", collapseWhenPointerLeavesChrome, true);
    return () => window.removeEventListener("pointerdown", collapseWhenPointerLeavesChrome, true);
  }, [expanded, onExpandedChange]);

  function collapseAfterFocusLeaves(event: FocusEvent<HTMLElement>) {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }
    onExpandedChange(false);
  }

  return (
    <aside
      ref={chromeRef}
      className={`desktop-app-chrome ${expanded ? "expanded" : "collapsed"}`}
      aria-label="Jarvis desktop shell"
      onMouseEnter={() => onExpandedChange(true)}
      onMouseLeave={() => onExpandedChange(false)}
      onFocus={() => onExpandedChange(true)}
      onBlur={collapseAfterFocusLeaves}
      data-expanded={expanded ? "true" : "false"}
    >
      <div className="desktop-brand">
        <span className="desktop-brand-orb"><span className="orb-mark" aria-hidden="true" /></span>
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
              className={activePanel === control.panel ? "active" : ""}
              onClick={() => onOpenPanel(control.panel)}
              aria-label={`Open ${control.label} panel`}
              data-label={control.label}
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
      <button className="desktop-action" type="button" onClick={onLiveTest} disabled={busyControl === "live-test"} aria-label="Run live test" title="Live test" data-label="Live test">
        <FlaskConical size={17} aria-hidden="true" />
        <span>{busyControl === "live-test" ? "Running" : "Live"}</span>
      </button>
      <button className="desktop-action" type="button" onClick={onRestartJarvis} disabled={busyControl === "restart-services"} aria-label="Restart Jarvis" title="Restart Jarvis" data-label="Restart Jarvis">
        <RefreshCw size={17} aria-hidden="true" />
        <span>{busyControl === "restart-services" ? "Restarting" : "Restart"}</span>
      </button>
      <button className="desktop-action" type="button" onClick={onStopJarvis} disabled={busyControl === "stop-services"} aria-label="Stop Jarvis" title="Stop Jarvis" data-label="Stop Jarvis">
        <Power size={17} aria-hidden="true" />
        <span>Stop Jarvis</span>
      </button>
      <button className="desktop-stop" type="button" onClick={onEmergencyStop} disabled={busyControl === "emergency-stop"} aria-label="Emergency Stop" title="Emergency Stop" data-label="Emergency Stop">
        <CircleStop size={17} aria-hidden="true" />
        <span>{busyControl === "emergency-stop" ? "Stopping" : "Emergency"}</span>
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

function voiceHudStateForSession(sessionState?: string, kind?: string): HudState {
  if (kind?.includes("tts") || sessionState === "speaking") {
    return "speaking";
  }
  if (sessionState === "listening" || kind === "voice-listening-started" || kind === "voice-transcript-updated") {
    return "listening";
  }
  if (sessionState === "processing" || kind === "voice-transcript-committed") {
    return "thinking";
  }
  if (sessionState === "error" || kind?.includes("failed")) {
    return "error";
  }
  return "wake";
}

function voiceCapsuleStateForSession(sessionState?: string, kind?: string): CommandCapsuleState {
  if (sessionState === "error" || kind?.includes("failed")) {
    return "failed";
  }
  if (sessionState === "idle" || kind === "voice-listening-stopped" || kind === "voice-transcript-committed") {
    return "completed";
  }
  return "running";
}

function audioEventMessage(kind?: string, voiceSession?: VoiceSessionPayload): string {
  if (voiceSession?.message) {
    return voiceSession.message;
  }
  if (kind === "voice-listening-started") {
    return "Listening locally. Say a command or type a transcript chunk.";
  }
  if (kind === "voice-transcript-updated") {
    const transcript = voiceSession?.transcript ?? [];
    const latest = transcript[transcript.length - 1]?.text;
    return latest ? `Heard: ${latest}` : "Transcript updated.";
  }
  if (kind === "voice-transcript-committed") {
    return "Voice command sent to Jarvis.";
  }
  if (kind === "voice-listening-stopped") {
    return "Voice session stopped.";
  }
  if (kind?.includes("tts")) {
    return "Jarvis is speaking.";
  }
  return "Voice state updated.";
}

function safeParseStreamEvent(data: string): { payload?: Record<string, unknown> } | undefined {
  try {
    return JSON.parse(data) as { payload?: Record<string, unknown> };
  } catch {
    return undefined;
  }
}
