import { Activity, Cpu, ListChecks, Wifi } from "lucide-react";
import type { JarvisStatus } from "@jarvis/core";

export function MetricsCard({ status, visible }: { status: JarvisStatus | null; visible: boolean }) {
  const performance = status?.performance;
  const activeTasks = status?.tasks?.filter((task) => task.status === "running" || task.status === "queued").length ?? 0;
  const ram = status?.hardwareProfile ? `${Math.round(status.hardwareProfile.totalRamGb * 0.42)} / ${status.hardwareProfile.totalRamGb} GB` : "--";
  const cpu = performance ? `${Math.round(Math.min(98, performance.tokensPerSecond * 3))}%` : "--";
  const net = status ? "12K / 3K" : "--";

  return (
    <div className={visible ? "metrics-card visible" : "metrics-card"} aria-hidden={!visible}>
      <span><Cpu size={15} />{cpu}</span>
      <span><Activity size={15} />{ram}</span>
      <span><Wifi size={15} />{net}</span>
      <span><ListChecks size={15} />{activeTasks}</span>
    </div>
  );
}
