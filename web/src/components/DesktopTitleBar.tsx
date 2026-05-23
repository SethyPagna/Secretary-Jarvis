import { Bell, Maximize2, Minus, PanelLeft, X } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";

import { cn } from "@/lib/utils";

interface DesktopTitleBarProps {
  onToggleSidebar: () => void;
  sidebarCollapsed: boolean;
}

type BackendStatus = "idle" | "offline" | "checking";

const dragStyle: CSSProperties & { WebkitAppRegion?: "drag" | "no-drag" } = {
  WebkitAppRegion: "drag",
};

const noDragStyle: CSSProperties & { WebkitAppRegion?: "drag" | "no-drag" } = {
  WebkitAppRegion: "no-drag",
};

function formatClock(date: Date): string {
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DesktopTitleBar({
  onToggleSidebar,
  sidebarCollapsed,
}: DesktopTitleBarProps) {
  const [clock, setClock] = useState(() => formatClock(new Date()));
  const [backendStatus, setBackendStatus] = useState<BackendStatus>("checking");

  useEffect(() => {
    const timer = window.setInterval(() => setClock(formatClock(new Date())), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    window.jarvisDesktop
      ?.getBackendStatus()
      .then((status) => {
        if (!cancelled) setBackendStatus(status.ok ? "idle" : "offline");
      })
      .catch(() => {
        if (!cancelled) setBackendStatus("offline");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const sendWindowControl = (action: "minimize" | "toggle-maximize" | "close") => {
    void window.jarvisDesktop?.windowControl(action);
  };

  return (
    <div
      className="relative z-[70] flex h-[42px] max-w-full shrink-0 items-center overflow-hidden border-b border-cyan-300/15 bg-[#080b10]/95 px-2 text-[#d9fbff] shadow-[0_1px_0_rgba(255,255,255,0.04)]"
      style={dragStyle}
    >
      <button
        type="button"
        className="mr-2 grid h-8 w-8 place-items-center rounded-md text-cyan-100/75 transition hover:bg-cyan-200/10 hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-200"
        onClick={onToggleSidebar}
        style={noDragStyle}
        aria-label={sidebarCollapsed ? "Restore sidebar" : "Minimize sidebar"}
        title={sidebarCollapsed ? "Restore sidebar" : "Minimize sidebar"}
      >
        <PanelLeft className="h-4 w-4" />
      </button>

      <div className="flex min-w-0 items-center gap-2">
        <span className="grid h-5 w-5 place-items-center rounded-full border border-cyan-200/35 bg-cyan-300/10 shadow-[0_0_18px_rgba(0,212,255,0.36)]">
          <span className="h-2 w-2 rounded-full bg-cyan-200" />
        </span>
        <span className="select-none text-[0.78rem] font-semibold tracking-[0.16em] text-cyan-50">
          JARVIS
        </span>
      </div>

      <div className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-2 text-[0.78rem] text-cyan-50/75 sm:flex">
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            backendStatus === "idle" && "bg-emerald-300",
            backendStatus === "checking" && "bg-amber-300",
            backendStatus === "offline" && "bg-red-400",
          )}
        />
        <span>{backendStatus}</span>
        <span className="text-cyan-100/30">.</span>
        <span>{clock}</span>
      </div>

      <div className="ml-auto flex items-center gap-1" style={noDragStyle}>
        <button
          type="button"
          className="grid h-8 w-8 place-items-center rounded-md text-cyan-100/70 transition hover:bg-cyan-200/10 hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-200"
          aria-label="Notifications"
          title="Notifications"
        >
          <Bell className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="hidden h-8 w-8 place-items-center rounded-md text-cyan-100/70 transition hover:bg-cyan-200/10 hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-200 sm:grid"
          onClick={() => sendWindowControl("minimize")}
          aria-label="Minimize"
          title="Minimize"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="hidden h-8 w-8 place-items-center rounded-md text-cyan-100/70 transition hover:bg-cyan-200/10 hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-200 sm:grid"
          onClick={() => sendWindowControl("toggle-maximize")}
          aria-label="Maximize"
          title="Maximize"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="hidden h-8 w-8 place-items-center rounded-md text-cyan-100/70 transition hover:bg-red-500/20 hover:text-red-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-200 sm:grid"
          onClick={() => sendWindowControl("close")}
          aria-label="Close"
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
