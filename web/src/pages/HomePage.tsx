import {
  Activity,
  Gauge,
  Mic,
  Paperclip,
  Play,
  Settings2,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { JarvisOrb, type OrbState } from "@/components/JarvisOrb";
import { StatsPanel } from "@/components/StatsPanel";
import {
  api,
  type RuntimeReadinessResponse,
  type RuntimeSmokeResponse,
  type RuntimeStatsResponse,
  type StatusResponse,
} from "@/lib/api";
import { cn } from "@/lib/utils";

type TerminalEntry = {
  kind: "input" | "output";
  text: string;
};

function subsystemReady(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return record.ready === true || record.ok === true || record.status === "ready";
}

function compactStatus(
  status: StatusResponse | null,
  readiness: RuntimeReadinessResponse | null,
): string {
  if (!status) return "offline";
  if (readiness?.production_ready) return "ready";
  if (subsystemReady(readiness?.llm)) return "model ready";
  return "checking";
}

function smokeSummary(smoke: RuntimeSmokeResponse): string {
  const llmSpeed = smoke.llm?.tokens_per_second;
  const llm = llmSpeed ? `${llmSpeed.toFixed(2)} tokens/s` : smoke.llm?.status;
  const tts = smoke.tts?.latency_ms
    ? `${Math.round(smoke.tts.latency_ms)} ms TTS`
    : smoke.tts?.status;
  const stt = smoke.stt?.latency_ms
    ? `${Math.round(smoke.stt.latency_ms)} ms STT`
    : smoke.stt?.status;

  return [llm, tts, stt].filter(Boolean).join(" | ") || "runtime checked";
}

export default function HomePage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [stats, setStats] = useState<RuntimeStatsResponse | null>(null);
  const [readiness, setReadiness] = useState<RuntimeReadinessResponse | null>(
    null,
  );
  const [smoke, setSmoke] = useState<RuntimeSmokeResponse | null>(null);
  const [smokeRunning, setSmokeRunning] = useState(false);
  const [terminalInput, setTerminalInput] = useState("");
  const [voiceOutput, setVoiceOutput] = useState(true);
  const [listening, setListening] = useState(false);
  const [terminalEntries, setTerminalEntries] = useState<TerminalEntry[]>([
    { kind: "output", text: "JARVIS desktop backend linked." },
  ]);

  useEffect(() => {
    let cancelled = false;

    const refreshStaticRuntime = () => {
      void Promise.allSettled([api.getStatus(), api.getRuntimeReadiness()]).then(
        ([statusResult, readinessResult]) => {
          if (cancelled) return;
          if (statusResult.status === "fulfilled") setStatus(statusResult.value);
          if (readinessResult.status === "fulfilled") {
            setReadiness(readinessResult.value);
          }
        },
      );
    };

    refreshStaticRuntime();
    const runtimeTimer = window.setInterval(refreshStaticRuntime, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(runtimeTimer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const refreshStats = () => {
      void api
        .getRuntimeStats()
        .then((nextStats) => {
          if (!cancelled) setStats(nextStats);
        })
        .catch(() => {
          if (!cancelled) setStats(null);
        });
    };

    refreshStats();
    const statsTimer = window.setInterval(refreshStats, 1_000);
    return () => {
      cancelled = true;
      window.clearInterval(statsTimer);
    };
  }, []);

  const orbState: OrbState = useMemo(() => {
    if (!status) return "offline";
    if (smokeRunning) return "thinking";
    if (listening) return "listening";
    if (smoke && !smoke.production_ready) return "error";
    if (smoke?.tts && subsystemReady(smoke.tts)) return "speaking";
    return "idle";
  }, [listening, smoke, smokeRunning, status]);

  const runSmoke = async () => {
    setSmokeRunning(true);
    setTerminalEntries((entries) => [
      ...entries,
      { kind: "input", text: "runtime smoke" },
    ]);

    try {
      const result = await api.getRuntimeSmokeTest();
      setSmoke(result);
      setTerminalEntries((entries) => [
        ...entries,
        {
          kind: "output",
          text: result.production_ready
            ? `Runtime ready: ${smokeSummary(result)}`
            : `Runtime blockers: ${(result.blockers ?? []).join(", ") || "unknown"}`,
        },
      ]);
    } catch (error) {
      setTerminalEntries((entries) => [
        ...entries,
        {
          kind: "output",
          text: error instanceof Error ? error.message : String(error),
        },
      ]);
    } finally {
      setSmokeRunning(false);
    }
  };

  const submitTerminal = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const command = terminalInput.trim();
    if (!command) return;

    setTerminalInput("");
    setTerminalEntries((entries) => [...entries, { kind: "input", text: command }]);

    if (command.toLowerCase().includes("smoke")) {
      void runSmoke();
      return;
    }

    if (command.toLowerCase() !== "status") {
      const params = new URLSearchParams({ prefill: command });
      setTerminalEntries((entries) => [
        ...entries,
        { kind: "output", text: "Opening live terminal." },
      ]);
      navigate(`/chat?${params.toString()}`);
      return;
    }

    setTerminalEntries((entries) => [
      ...entries,
      {
        kind: "output",
        text: `Backend ${compactStatus(status, readiness)}. Gateway ${status?.gateway_state ?? "unknown"}.`,
      },
    ]);
  };

  const toggleMic = async () => {
    if (listening) {
      setListening(false);
      return;
    }

    try {
      await navigator.mediaDevices?.getUserMedia({ audio: true });
      setListening(true);
    } catch {
      setListening(false);
      setTerminalEntries((entries) => [
        ...entries,
        { kind: "output", text: "Microphone permission unavailable." },
      ]);
    }
  };

  const statusLabel = compactStatus(status, readiness);
  const activeVoice = readiness?.tts?.engine ?? "voice";

  return (
    <main className="flex min-h-0 min-w-0 w-full max-w-[calc(100vw-1.5rem)] flex-1 flex-col gap-4 overflow-x-hidden text-cyan-50 lg:max-w-full">
      <section className="grid min-h-0 min-w-0 w-full max-w-full flex-1 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_310px]">
        <div className="flex min-h-[380px] min-w-0 w-full max-w-full flex-col items-center justify-center rounded-md border border-cyan-200/10 bg-[#080e14]/72 px-4 py-6 shadow-[0_24px_90px_rgba(0,0,0,0.24)] sm:px-5">
          <JarvisOrb state={orbState} />

          <div className="mt-4 flex flex-col items-center gap-2 text-center">
            <p className="text-2xl font-semibold tracking-[0.01em] text-cyan-50">
              How can I help?
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 text-[0.78rem] uppercase tracking-[0.11em] text-cyan-50/58">
              <span>{statusLabel}</span>
              <span className="text-cyan-100/25">|</span>
              <span>{activeVoice}</span>
              <span className="text-cyan-100/25">|</span>
              <span>{stats?.tokens_total_lifetime ?? 0} lifetime tokens</span>
            </div>
          </div>

          <div className="mt-5 grid min-w-0 w-full max-w-3xl grid-cols-2 gap-2 sm:grid-cols-6">
            <QuickAction
              label="Voice"
              icon={Mic}
              active={listening}
              onClick={() => void toggleMic()}
            />
            <QuickAction
              label="Quick Task"
              icon={Zap}
              onClick={() => void runSmoke()}
              busy={smokeRunning}
            />
            <QuickAction label="Attach" icon={Paperclip} />
            <QuickAction label="Tools" icon={Settings2} />
            <QuickAction
              label={voiceOutput ? "Mute" : "Unmute"}
              icon={voiceOutput ? Volume2 : VolumeX}
              active={voiceOutput}
              onClick={() => setVoiceOutput((value) => !value)}
            />
            <QuickAction label="Stats" icon={Gauge} />
          </div>
        </div>

        <StatsPanel readiness={readiness} stats={stats} />
      </section>

      <section className="grid min-h-[190px] min-w-0 w-full max-w-full gap-3 rounded-md border border-cyan-200/12 bg-[#05080d]/92 p-3 shadow-[0_16px_60px_rgba(0,0,0,0.22)]">
        <div className="flex items-center justify-between gap-3 border-b border-cyan-100/10 pb-2">
          <div className="flex items-center gap-2 text-[0.78rem] uppercase tracking-[0.12em] text-cyan-50/64">
            <Activity className="h-4 w-4 text-cyan-200" />
            <span>Terminal / Chat Input</span>
          </div>
          <button
            type="button"
            className="inline-flex h-8 items-center gap-2 rounded-md border border-cyan-200/12 px-3 text-[0.74rem] uppercase tracking-[0.1em] text-cyan-50/78 transition hover:border-cyan-200/28 hover:bg-cyan-200/8"
            onClick={() => void runSmoke()}
            disabled={smokeRunning}
          >
            <Play className="h-3.5 w-3.5" />
            Run
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto rounded-sm bg-black/28 p-3 font-mono text-[0.82rem] leading-relaxed text-cyan-50/82">
          {terminalEntries.slice(-6).map((entry, index) => (
            <div
              key={`${entry.kind}-${index}-${entry.text}`}
              className={cn(entry.kind === "input" ? "text-emerald-200" : "text-cyan-50/72")}
            >
              <span className="text-cyan-100/35">
                {entry.kind === "input" ? ">" : "jarvis"}
              </span>{" "}
              {entry.text}
            </div>
          ))}
        </div>

        <form className="flex items-center gap-2" onSubmit={submitTerminal}>
          <input
            value={terminalInput}
            onChange={(event) => setTerminalInput(event.target.value)}
            className="h-10 min-w-0 flex-1 rounded-md border border-cyan-200/12 bg-cyan-950/18 px-3 font-mono text-[0.86rem] text-cyan-50 outline-none transition placeholder:text-cyan-50/28 focus:border-cyan-200/42"
            placeholder="status, smoke, or task"
          />
          <button
            type="submit"
            className="inline-flex h-10 items-center gap-2 rounded-md bg-cyan-200 px-4 text-[0.76rem] font-semibold uppercase tracking-[0.1em] text-slate-950 transition hover:bg-cyan-100"
          >
            <Play className="h-4 w-4" />
            Run
          </button>
        </form>
      </section>
    </main>
  );
}

function QuickAction({
  active,
  busy,
  icon: Icon,
  label,
  onClick,
}: {
  active?: boolean;
  busy?: boolean;
  icon: typeof Mic;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        "inline-flex h-10 min-w-0 items-center justify-center gap-2 rounded-md border px-2",
        "text-[0.72rem] font-semibold uppercase tracking-[0.09em] transition",
        active
          ? "border-cyan-200/38 bg-cyan-200/16 text-cyan-50"
          : "border-cyan-200/12 bg-cyan-200/5 text-cyan-50/72 hover:border-cyan-200/30 hover:bg-cyan-200/10 hover:text-cyan-50",
        busy && "cursor-wait opacity-70",
      )}
    >
      <Icon className={cn("h-4 w-4", busy && "animate-pulse")} />
      <span className="truncate">{label}</span>
    </button>
  );
}
