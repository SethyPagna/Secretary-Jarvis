import { AnimatePresence, motion } from "framer-motion";
import { Settings } from "lucide-react";
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
  const active = state !== "idle";

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

  return (
    <main className={`hud-stage hud-state-${state} ${panel ? "panel-open" : ""}`} aria-label="Jarvis centered HUD">
      <div className="orb-interaction-zone" onMouseEnter={() => setHoveringOrb(true)} onMouseLeave={() => setHoveringOrb(false)}>
        <MetricsCard status={status} visible={hoveringOrb && !menuOpen && !panel} />
        <Orb
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
            {caption && <strong>{caption}</strong>}
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
              <HudPanel panel={panel} status={status} apiBaseUrl={apiBaseUrl} onClose={closeAll} />
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
