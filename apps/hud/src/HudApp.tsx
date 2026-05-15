import { AnimatePresence, motion } from "framer-motion";
import { Settings } from "lucide-react";
import { Orb } from "./components/Orb";
import { HudStateProvider, useHudState } from "./state/hudState";

export function HudApp() {
  return (
    <HudStateProvider>
      <HudSurface />
    </HudStateProvider>
  );
}

function HudSurface() {
  const { state, caption, setHudState, resetHud } = useHudState();
  const active = state !== "idle";

  return (
    <main className={`hud-stage hud-state-${state}`} aria-label="Jarvis centered HUD">
      <Orb onClick={() => (active ? resetHud() : setHudState("wake"))} />
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
      <button className="hud-corner-control" type="button" aria-label="Jarvis settings">
        <Settings size={18} aria-hidden="true" />
      </button>
    </main>
  );
}
