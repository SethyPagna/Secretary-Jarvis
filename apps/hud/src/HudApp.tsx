import { useState } from "react";
import { Settings } from "lucide-react";
import { Orb } from "./components/Orb";

export function HudApp() {
  const [activated, setActivated] = useState(false);

  return (
    <main className={activated ? "hud-stage hud-stage-active" : "hud-stage"} aria-label="Jarvis centered HUD">
      <Orb onClick={() => setActivated((value) => !value)} />
      {activated && (
        <div className="hud-activation-line" role="status" aria-live="polite">
          <span />
        </div>
      )}
      <button className="hud-corner-control" type="button" aria-label="Jarvis settings">
        <Settings size={18} aria-hidden="true" />
      </button>
    </main>
  );
}
