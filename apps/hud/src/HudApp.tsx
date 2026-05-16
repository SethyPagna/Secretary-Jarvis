import { AnimatePresence, motion } from "framer-motion";
import { Check, Route, Settings, ShieldAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { HudPanel } from "./components/HudPanel";
import { MetricsCard } from "./components/MetricsCard";
import { Orb } from "./components/Orb";
import { RadialMenu } from "./components/RadialMenu";
import { useJarvisStatus } from "./hooks/useJarvisStatus";
import { HudStateProvider, useHudState } from "./state/hudState";
import type { HudPanel as HudPanelName } from "./types";

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
      <div className="orb-interaction-zone" onMouseEnter={() => setHoveringOrb(true)} onMouseLeave={() => setHoveringOrb(false)}>
        <MetricsCard status={status} visible={hoveringOrb && !menuOpen && !panel} />
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
