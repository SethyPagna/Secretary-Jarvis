import type {
  RuntimeReadinessResponse,
  RuntimeStatsResponse,
} from "@/lib/api";
import { cn } from "@/lib/utils";

interface StatsPanelProps {
  readiness: RuntimeReadinessResponse | null;
  stats: RuntimeStatsResponse | null;
}

function formatValue(value: number | null | undefined, suffix = ""): string {
  if (value === null || value === undefined) return "--";
  return `${value}${suffix}`;
}

function percentColor(value: number | null | undefined): string {
  if (value === null || value === undefined) return "bg-cyan-200/20";
  if (value >= 85) return "bg-red-400";
  if (value >= 65) return "bg-amber-300";
  return "bg-emerald-300";
}

function StatRow({
  label,
  value,
  percent,
}: {
  label: string;
  value: string;
  percent?: number | null;
}) {
  const width = Math.max(4, Math.min(100, percent ?? 0));

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3 text-[0.72rem] uppercase tracking-[0.08em] text-cyan-50/60">
        <span>{label}</span>
        <span className="font-mono text-cyan-50">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-cyan-100/10">
        <div
          className={cn("h-full rounded-full transition-all", percentColor(percent))}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

export function StatsPanel({ readiness, stats }: StatsPanelProps) {
  const llm = readiness?.llm;
  const tts = readiness?.tts;
  const stt = readiness?.stt;

  return (
    <aside className="flex min-h-0 min-w-0 w-full max-w-full flex-col gap-4 rounded-md border border-cyan-200/12 bg-[#0c141b]/78 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
      <div>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-cyan-50">
            Stats
          </h2>
          <span
            className={cn(
              "rounded-sm px-2 py-1 text-[0.68rem] uppercase tracking-[0.1em]",
              readiness?.production_ready
                ? "bg-emerald-300/12 text-emerald-200"
                : "bg-amber-300/12 text-amber-200",
            )}
          >
            {readiness?.production_ready ? "Ready" : "Checking"}
          </span>
        </div>
      </div>

      <div className="grid gap-3">
        <StatRow
          label="CPU"
          value={formatValue(stats?.cpu_percent, "%")}
          percent={stats?.cpu_percent}
        />
        <StatRow
          label="RAM"
          value={
            stats?.ram_used_mb && stats?.ram_total_mb
              ? `${stats.ram_used_mb} / ${stats.ram_total_mb} MB`
              : "--"
          }
          percent={
            stats?.ram_used_mb && stats?.ram_total_mb
              ? (stats.ram_used_mb / stats.ram_total_mb) * 100
              : null
          }
        />
        <StatRow
          label="GPU"
          value={formatValue(stats?.gpu_percent, "%")}
          percent={stats?.gpu_percent}
        />
        <StatRow
          label="GPU temp"
          value={formatValue(stats?.gpu_temp_c, " C")}
          percent={stats?.gpu_temp_c ? (stats.gpu_temp_c / 95) * 100 : null}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-cyan-100/10 pt-3 text-[0.74rem] text-cyan-50/70">
        <div>
          <div className="text-cyan-50/45">Input tokens</div>
          <div className="font-mono text-cyan-50">{stats?.tokens_input ?? 0}</div>
        </div>
        <div>
          <div className="text-cyan-50/45">Output tokens</div>
          <div className="font-mono text-cyan-50">{stats?.tokens_output ?? 0}</div>
        </div>
        <div>
          <div className="text-cyan-50/45">Skills</div>
          <div className="font-mono text-cyan-50">{stats?.active_skills ?? 0}</div>
        </div>
        <div>
          <div className="text-cyan-50/45">Gateways</div>
          <div className="font-mono text-cyan-50">
            {stats?.gateway_connections ?? 0}
          </div>
        </div>
      </div>

      <div className="space-y-2 border-t border-cyan-100/10 pt-3 text-[0.78rem]">
        <RuntimeLine label="LLM" value={llm?.backend ?? llm?.provider ?? llm?.model} />
        <RuntimeLine label="TTS" value={tts?.engine ?? tts?.model} />
        <RuntimeLine label="STT" value={stt?.engine ?? stt?.model} />
      </div>
    </aside>
  );
}

function RuntimeLine({
  label,
  value,
}: {
  label: string;
  value: unknown;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-cyan-50/45">{label}</span>
      <span className="truncate text-right font-mono text-cyan-50/85">
        {typeof value === "string" && value ? value : "--"}
      </span>
    </div>
  );
}
