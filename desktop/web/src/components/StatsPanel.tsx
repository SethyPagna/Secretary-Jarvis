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
  if (value === null || value === undefined) return "N/A";
  return `${value}${suffix}`;
}

function percentColor(value: number | null | undefined): string {
  if (value === null || value === undefined) return "bg-cyan-200/20";
  if (value >= 85) return "bg-red-400";
  if (value >= 65) return "bg-amber-300";
  return "bg-emerald-300";
}

function StatRow({
  detail,
  label,
  value,
  percent,
}: {
  detail?: string;
  label: string;
  value: string;
  percent?: number | null;
}) {
  const unavailable = percent === null || percent === undefined;
  const width = unavailable ? 0 : Math.max(3, Math.min(100, percent));

  return (
    <div className="space-y-1" title={detail}>
      <div className="flex min-w-0 items-center justify-between gap-3 text-[0.75rem] uppercase tracking-[0.08em] text-slate-200/72">
        <span className="min-w-0 truncate">{label}</span>
        <span className="min-w-0 max-w-[70%] truncate text-right font-mono text-white">{value}</span>
      </div>
      <div
        className={cn(
          "h-1.5 overflow-hidden rounded-full",
          unavailable ? "bg-white/7 ring-1 ring-inset ring-white/8" : "bg-white/10",
        )}
      >
        <div
          className={cn("h-full rounded-full transition-all", percentColor(percent))}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

function cleanRuntimeLabel(value: unknown): string {
  if (typeof value !== "string" || !value) return "--";
  const normalized = value.replace(/\\/g, "/");
  const leaf = normalized.split("/").filter(Boolean).at(-1) ?? value;
  return leaf
    .replace(/^openai__/, "")
    .replace(/^hexgrad__/, "")
    .replace(/__/g, " / ")
    .replace(/whisper-large-v3-turbo/i, "whisper v3 turbo");
}

function formatRate(value: number | null | undefined): string {
  if (value === null || value === undefined) return "0.00/s";
  return `${Number(value).toFixed(2)}/s`;
}

export function StatsPanel({ readiness, stats }: StatsPanelProps) {
  const llm = readiness?.llm;
  const tts = readiness?.tts;
  const stt = readiness?.stt;
  const llmRuntime = stats?.llm_runtime;
  const hardware = stats?.hardware_status ?? {};
  const warnings = stats?.warnings?.length ? stats.warnings.join(" ") : "Live hardware sample";
  const live = Boolean(stats?.timestamp);
  const blockingIssues = readiness?.["blocking_issues"];
  const badgeTitle = blockingIssues
    ? JSON.stringify(blockingIssues)
    : warnings;

  return (
    <aside className="flex h-full max-h-full min-h-0 min-w-0 w-full max-w-full flex-col gap-2 overflow-hidden rounded-md border border-white/12 bg-[#10151d]/90 p-3 text-slate-100 shadow-[0_20px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl">
      <div className="shrink-0">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-white">
            Stats
          </h2>
          <span
            className={cn(
              "rounded-sm px-2 py-1 text-[0.68rem] uppercase tracking-[0.1em]",
              live
                ? "bg-emerald-300/12 text-emerald-200"
                : "bg-amber-300/12 text-amber-200",
            )}
            title={badgeTitle}
          >
            {live ? "Live" : "Waiting"}
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        <StatRow
          label="CPU"
          value={formatValue(stats?.cpu_percent, "%")}
          percent={stats?.cpu_percent}
          detail={`Total CPU. Process CPU: ${formatValue(stats?.process_cpu_percent, "%")}. ${warnings}`}
        />
        <StatRow
          label="RAM"
          value={
            stats?.ram_used_mb && stats?.ram_total_mb
              ? `${stats.ram_used_mb} / ${stats.ram_total_mb} MB`
              : "N/A"
          }
          percent={
            stats?.ram_used_mb && stats?.ram_total_mb
              ? (stats.ram_used_mb / stats.ram_total_mb) * 100
              : null
          }
          detail={`System RAM. JARVIS process RSS: ${formatValue(stats?.process_ram_mb, " MB")}.`}
        />
        <StatRow
          label="GPU"
          value={formatValue(stats?.gpu_percent, "%")}
          percent={stats?.gpu_percent}
          detail={`GPU source: ${hardware.gpu_source ?? "unavailable"}. ${warnings}`}
        />
        <StatRow
          label="GPU temp"
          value={formatValue(stats?.gpu_temp_c, " C")}
          percent={stats?.gpu_temp_c ? (stats.gpu_temp_c / 95) * 100 : null}
          detail={`GPU temperature source: ${hardware.gpu_temp_source ?? "unavailable"}.`}
        />
        <StatRow
          label="CPU temp"
          value={formatValue(stats?.cpu_temp_c, " C")}
          percent={stats?.cpu_temp_c ? (stats.cpu_temp_c / 95) * 100 : null}
          detail={`CPU temperature source: ${hardware.cpu_temp_source ?? "unavailable"}.`}
        />
      </div>

      <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-1.5 border-t border-white/10 pt-2 text-[0.7rem] text-slate-200/78">
        <div className="min-w-0" title="Live token throughput from the current desktop chat counter.">
          <div className="text-slate-300/58">Tokens/s</div>
          <div className="font-mono text-white">{formatRate(stats?.tokens_per_second)}</div>
        </div>
        <div className="min-w-0">
          <div className="text-slate-300/58">Skills</div>
          <div
            className="truncate font-mono text-white"
            title={`${stats?.active_skills ?? 0} active, ${stats?.listed_skills ?? 0} listed, ${stats?.total_skill_assets ?? 0} total skill assets`}
          >
            {stats?.active_skills ?? 0} / {stats?.listed_skills ?? 0}
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-slate-300/58">Gateways</div>
          <div className="font-mono text-white">
            {stats?.gateway_connections ?? 0}
          </div>
        </div>
        <div className="min-w-0" title={`Active soul: ${stats?.active_soul ?? "jarvis"}`}>
          <div className="text-slate-300/58">Souls online</div>
          <div className="font-mono text-white">
            {stats?.souls_online ?? 1} / {stats?.souls_total ?? 1}
          </div>
        </div>
        <div className="min-w-0" title={(stats?.delegate_souls ?? []).join(", ") || "Delegate souls ready"}>
          <div className="text-slate-300/58">Active soul</div>
          <div className="truncate font-mono text-white">{stats?.active_soul ?? "jarvis"}</div>
        </div>
      </div>

      <div className="shrink-0 space-y-1.5 overflow-hidden border-t border-white/10 pt-2 text-[0.7rem]">
        <RuntimeLine
          label="LLM"
          value={llmRuntime?.model || llm?.model || llm?.backend || llm?.provider}
          detail={
            llmRuntime?.endpoint
              ? `${llmRuntime.backend || "local"} ${llmRuntime.running ? "running" : "configured"} at ${llmRuntime.endpoint}`
              : undefined
          }
        />
        <RuntimeLine label="TTS" value={tts?.engine ?? tts?.model} />
        <RuntimeLine
          label="STT"
          value={stt?.model_folder ?? stt?.model ?? stt?.engine}
        />
      </div>
    </aside>
  );
}

function RuntimeLine({
  detail,
  label,
  value,
}: {
  detail?: string;
  label: string;
  value: unknown;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3" title={detail}>
      <span className="shrink-0 text-slate-300/58">{label}</span>
      <span className="min-w-0 max-w-[64%] truncate text-right font-mono text-white/90">
        {cleanRuntimeLabel(value)}
      </span>
    </div>
  );
}
