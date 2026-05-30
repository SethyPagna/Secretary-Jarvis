import { useSidebarStatus } from "@/hooks/useSidebarStatus";
import { cn } from "@/lib/utils";

export function SidebarFooter() {
  const status = useSidebarStatus();

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center gap-2",
        "border-t border-current/10 px-5 py-2.5",
        "text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-400",
      )}
    >
      <span className="font-mono tabular-nums">
        {status?.version != null ? `v${status.version}` : "offline"}
      </span>
      <span className="text-cyan-100/20">|</span>
      <span>local</span>
    </div>
  );
}
