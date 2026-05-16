import { Cable, Home, Keyboard, Mic, Settings, Waypoints, X } from "lucide-react";
import type { CSSProperties } from "react";
import type { HudPanel } from "../types";

const items: Array<{ id: HudPanel; label: string; icon: typeof Home; angle: number; mobileX: number }> = [
  { id: "dashboard", label: "Dashboard", icon: Home, angle: -112, mobileX: -130 },
  { id: "voice", label: "Voice", icon: Mic, angle: -62, mobileX: -78 },
  { id: "text", label: "Text", icon: Keyboard, angle: -12, mobileX: -26 },
  { id: "workflows", label: "Workflows", icon: Waypoints, angle: 38, mobileX: 26 },
  { id: "devices", label: "Devices", icon: Cable, angle: 88, mobileX: 78 },
  { id: "settings", label: "Settings", icon: Settings, angle: 138, mobileX: 130 }
];

export function RadialMenu({ open, onSelect, onClose }: { open: boolean; onSelect: (panel: HudPanel) => void; onClose: () => void }) {
  return (
    <div className={open ? "radial-menu open" : "radial-menu"} aria-hidden={!open}>
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            className="radial-item"
            style={{ "--angle": `${item.angle}deg`, "--delay": `${index * 45}ms`, "--mobile-x": item.mobileX } as CSSProperties}
            onClick={() => onSelect(item.id)}
            title={item.label}
          >
            <Icon size={19} aria-hidden="true" />
          </button>
        );
      })}
      <button className="radial-close" type="button" onClick={onClose} aria-label="Close Jarvis menu">
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
