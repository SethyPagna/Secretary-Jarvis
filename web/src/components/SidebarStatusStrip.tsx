import { Link } from "react-router-dom";
import type { StatusResponse } from "@/lib/api";
import { useSidebarStatus } from "@/hooks/useSidebarStatus";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

/** Gateway + session summary for the System sidebar block (no separate strip chrome). */
export function SidebarStatusStrip() {
  const status = useSidebarStatus();
  const { t } = useI18n();

  if (status === null) {
    return (
      <div className="px-5 py-1.5" aria-hidden>
        <div className="h-2 w-[80%] max-w-full animate-pulse rounded-sm bg-midground/10" />
      </div>
    );
  }

  const gw = gatewayLine(status, t);
  return (
    <Link
      to="/sessions"
      title={t.app.statusOverview}
      className={cn(
        "block text-left",
        "px-5 pb-2 pt-0.5",
        "text-text-secondary",
        "transition-colors hover:text-midground",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-midground/40",
        "focus-visible:ring-inset",
      )}
    >
      <div className="flex min-w-0 items-center gap-2 text-xs font-semibold leading-snug tracking-[0.04em]">
        <span className={cn("h-2 w-2 shrink-0 rounded-full", gatewayDotTone(status))} />
        <span className="min-w-0 truncate">
          <span className={cn("font-medium", gw.tone)}>{gw.label}</span>
          <span className="text-text-tertiary"> / sessions </span>
          <span className="tabular-nums text-text-secondary">{status.active_sessions}</span>
        </span>
      </div>
    </Link>
  );
}

function gatewayDotTone(status: StatusResponse): string {
  if (status.gateway_state === "running" || status.gateway_running) {
    return "bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.65)]";
  }
  if (status.gateway_state === "starting") {
    return "bg-amber-300 shadow-[0_0_12px_rgba(252,211,77,0.5)]";
  }
  if (status.gateway_state === "startup_failed") {
    return "bg-red-400 shadow-[0_0_12px_rgba(248,113,113,0.55)]";
  }
  return "bg-slate-500";
}

function gatewayLine(
  status: StatusResponse,
  t: ReturnType<typeof useI18n>["t"],
): { label: string; tone: string } {
  const g = t.app.gatewayStrip;
  const byState: Record<string, { label: string; tone: string }> = {
    running: { label: g.running, tone: "text-success" },
    starting: { label: g.starting, tone: "text-warning" },
    startup_failed: { label: g.failed, tone: "text-destructive" },
    stopped: { label: g.stopped, tone: "text-muted-foreground" },
  };
  if (status.gateway_state && byState[status.gateway_state]) {
    return byState[status.gateway_state];
  }
  return status.gateway_running
    ? { label: g.running, tone: "text-success" }
    : { label: g.off, tone: "text-muted-foreground" };
}
