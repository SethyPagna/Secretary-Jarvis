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
      <div className="flex items-center justify-between gap-3 text-[0.75rem] uppercase tracking-[0.08em] text-slate-200/72">
        <span>{label}</span>
        <span className="font-mono text-white">{value}</span>
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
    .replace(/whisper-large-v3-turbo/i, "whisper v3 turbo")
    .replace("docker-local-voice", "kokoro")
    .replace("docker-faster-whisper", "faster-whisper");
}

export function StatsPanel({ readiness, stats }: StatsPanelProps) {
  const llm = readiness?.llm;
  const tts = readiness?.tts;
  const stt = readiness?.stt;
  const hardware = stats?.hardware_status ?? {};
  const warnings = stats?.warnings?.length ? stats.warnings.join(" ") : "Live hardware sample";

  return (
    <aside className="flex min-h-0 min-w-0 w-full max-w-full flex-col gap-3 rounded-md border border-white/12 bg-[#10151d]/90 p-4 text-slate-100 shadow-[0_20px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl">
      <div>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-white">
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

      <div className="grid gap-2.5">
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

      <div className="grid grid-cols-2 gap-2 border-t border-white/10 pt-3 text-[0.78rem] text-slate-200/78">
        <div>
          <div className="text-slate-300/58">Input tokens</div>
          <div className="font-mono text-white">{stats?.tokens_input ?? 0}</div>
        </div>
        <div>
          <div className="text-slate-300/58">Output tokens</div>
          <div className="font-mono text-white">{stats?.tokens_output ?? 0}</div>
        </div>
        <div>
          <div className="text-slate-300/58">Skills</div>
          <div className="font-mono text-white">{stats?.active_skills ?? 0}</div>
        </div>
        <div>
          <div className="text-slate-300/58">Gateways</div>
          <div className="font-mono text-white">
            {stats?.gateway_connections ?? 0}
          </div>
        </div>
        <div title={`Active soul: ${stats?.active_soul ?? "jarvis"}`}>
          <div className="text-slate-300/58">Souls online</div>
          <div className="font-mono text-white">
            {stats?.souls_online ?? 1} / {stats?.souls_total ?? 1}
          </div>
        </div>
        <div title={(stats?.delegate_souls ?? []).join(", ") || "Delegate souls ready"}>
          <div className="text-slate-300/58">Active soul</div>
          <div className="truncate font-mono text-white">{stats?.active_soul ?? "jarvis"}</div>
        </div>
      </div>

      <div className="space-y-2 border-t border-white/10 pt-3 text-[0.8rem]">
        <RuntimeLine label="LLM" value={llm?.model ?? llm?.backend ?? llm?.provider} />
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
  label,
  value,
}: {
  label: string;
  value: unknown;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-300/58">{label}</span>
      <span className="truncate text-right font-mono text-white/90">
        {cleanRuntimeLabel(value)}
      </span>
    </div>
  );
}
