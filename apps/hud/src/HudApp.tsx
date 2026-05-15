import { Settings } from "lucide-react";

export function HudApp() {
  return (
    <main className="hud-stage" aria-label="Jarvis centered HUD">
      <button className="hud-orb-shell" type="button" aria-label="Open Jarvis controls">
        <span className="hud-orb-core" />
      </button>
      <button className="hud-corner-control" type="button" aria-label="Jarvis settings">
        <Settings size={18} aria-hidden="true" />
      </button>
    </main>
  );
}
