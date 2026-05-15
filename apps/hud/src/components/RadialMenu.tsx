import { Cable, Home, Keyboard, Mic, Settings, X } from "lucide-react";
import type { CSSProperties } from "react";
import type { HudPanel } from "../types";

const items: Array<{ id: HudPanel; label: string; icon: typeof Home; angle: number; mobileX: number }> = [
  { id: "dashboard", label: "Dashboard", icon: Home, angle: -95, mobileX: -104 },
  { id: "voice", label: "Voice", icon: Mic, angle: -38, mobileX: -52 },
  { id: "text", label: "Text", icon: Keyboard, angle: 18, mobileX: 0 },
  { id: "devices", label: "Devices", icon: Cable, angle: 74, mobileX: 52 },
  { id: "settings", label: "Settings", icon: Settings, angle: 132, mobileX: 104 }
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
