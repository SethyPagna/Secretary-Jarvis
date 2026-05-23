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
import {
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

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
import ChatPage from "@/pages/ChatPage";

type TerminalEntry = {
  kind: "input" | "output";
  text: string;
};

type TerminalLaunch = {
  command: string;
  id: number;
};

function base64ToAudioBlob(base64: string, mimeType: string): Blob {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

function terminalTextForSpeech(text: string): string {
  return text
    // eslint-disable-next-line no-control-regex -- stripping OSC terminal control sequences before TTS
    .replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, " ")
    // eslint-disable-next-line no-control-regex -- stripping ANSI terminal control sequences before TTS
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, " ")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith(">") && !/^jarvis\s/i.test(line))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1800);
}

const TOOL_TOGGLES = [
  { key: "terminal", label: "Terminal" },
  { key: "files", label: "Files" },
  { key: "web", label: "Web" },
  { key: "browser", label: "Browser" },
] as const;

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const awaitingVoiceResponseRef = useRef(false);
  const voiceOutputBufferRef = useRef("");
  const voiceOutputTimerRef = useRef<number | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [stats, setStats] = useState<RuntimeStatsResponse | null>(null);
  const [readiness, setReadiness] = useState<RuntimeReadinessResponse | null>(
    null,
  );
  const [smoke, setSmoke] = useState<RuntimeSmokeResponse | null>(null);
  const [smokeRunning, setSmokeRunning] = useState(false);
  const [terminalInput, setTerminalInput] = useState("");
  const [terminalLive, setTerminalLive] = useState(false);
  const [terminalLaunch, setTerminalLaunch] = useState<TerminalLaunch | null>(
    null,
  );
  const [quickTaskOpen, setQuickTaskOpen] = useState(false);
  const [quickTaskText, setQuickTaskText] = useState("");
  const [toolsOpen, setToolsOpen] = useState(false);
  const [statsVisible, setStatsVisible] = useState(true);
  const [enabledTools, setEnabledTools] = useState<Record<string, boolean>>({
    browser: false,
    files: true,
    terminal: true,
    web: true,
  });
  const [voiceOutput, setVoiceOutput] = useState(true);
  const [listening, setListening] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
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

  useEffect(() => {
    return () => {
      if (voiceOutputTimerRef.current !== null) {
        window.clearTimeout(voiceOutputTimerRef.current);
      }
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        recorder.stop();
      }
      voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
    };
  }, []);

  const orbState: OrbState = useMemo(() => {
    if (!status) return "offline";
    if (speaking) return "speaking";
    if (smokeRunning) return "thinking";
    if (listening) return "listening";
    if (voiceBusy) return "thinking";
    if (smoke && !smoke.production_ready) return "error";
    if (smoke?.tts && subsystemReady(smoke.tts)) return "speaking";
    return "idle";
  }, [listening, smoke, smokeRunning, speaking, status, voiceBusy]);

  const runLiveCommand = useCallback((command: string, message = "Running in live terminal.") => {
    setTerminalLive(true);
    setTerminalLaunch({ command, id: Date.now() });
    setTerminalEntries((entries) => [
      ...entries,
      { kind: "input", text: command },
      { kind: "output", text: message },
    ]);
  }, []);

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

    if (command.toLowerCase().includes("smoke")) {
      setTerminalEntries((entries) => [...entries, { kind: "input", text: command }]);
      void runSmoke();
      return;
    }

    if (command.toLowerCase() !== "status") {
      runLiveCommand(command);
      return;
    }

    setTerminalEntries((entries) => [
      ...entries,
      { kind: "input", text: command },
      {
        kind: "output",
        text: `Backend ${compactStatus(status, readiness)}. Gateway ${status?.gateway_state ?? "unknown"}.`,
      },
    ]);
  };

  const playSynthesizedSpeech = useCallback(
    async (rawText: string) => {
      if (!voiceOutput) return;
      const text = terminalTextForSpeech(rawText);
      if (!text) return;

      setSpeaking(true);
      let objectUrl: string | null = null;
      try {
        const result = await api.synthesizeSpeech(text);
        if (!result.success || !result.audio_base64) {
          throw new Error(result.error || "TTS did not return audio.");
        }

        const currentAudio = audioPlayerRef.current;
        if (currentAudio) {
          currentAudio.pause();
          if (currentAudio.src.startsWith("blob:")) {
            URL.revokeObjectURL(currentAudio.src);
          }
        }

        const audioBlob = base64ToAudioBlob(
          result.audio_base64,
          result.mime_type || "audio/mpeg",
        );
        objectUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(objectUrl);
        audioPlayerRef.current = audio;
        audio.onended = () => {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          if (audioPlayerRef.current === audio) audioPlayerRef.current = null;
          setSpeaking(false);
        };
        audio.onerror = () => {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          if (audioPlayerRef.current === audio) audioPlayerRef.current = null;
          setSpeaking(false);
        };
        await audio.play();
      } catch (error) {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        setSpeaking(false);
        setTerminalEntries((entries) => [
          ...entries,
          {
            kind: "output",
            text: error instanceof Error ? error.message : String(error),
          },
        ]);
      }
    },
    [voiceOutput],
  );

  const handleTerminalOutput = useCallback(
    (chunk: string) => {
      if (!awaitingVoiceResponseRef.current || !voiceOutput) return;
      voiceOutputBufferRef.current += chunk;
      if (voiceOutputTimerRef.current !== null) {
        window.clearTimeout(voiceOutputTimerRef.current);
      }
      voiceOutputTimerRef.current = window.setTimeout(() => {
        const bufferedOutput = voiceOutputBufferRef.current;
        voiceOutputBufferRef.current = "";
        awaitingVoiceResponseRef.current = false;
        void playSynthesizedSpeech(bufferedOutput);
      }, 1400);
    },
    [playSynthesizedSpeech, voiceOutput],
  );

  const handleRecordedVoice = useCallback(
    async (audio: Blob) => {
      if (audio.size === 0) {
        setTerminalEntries((entries) => [
          ...entries,
          { kind: "output", text: "No microphone audio was captured." },
        ]);
        return;
      }

      setVoiceBusy(true);
      setTerminalEntries((entries) => [
        ...entries,
        { kind: "output", text: "Transcribing voice input..." },
      ]);

      try {
        const result = await api.transcribeVoice(audio);
        const transcript = result.transcript?.trim() ?? "";
        if (!result.success || !transcript) {
          throw new Error(result.error || "STT returned an empty transcript.");
        }

        setTerminalInput(transcript);
        voiceOutputBufferRef.current = "";
        awaitingVoiceResponseRef.current = voiceOutput;
        runLiveCommand(transcript,
          `Voice transcript (${result.provider ?? result.engine ?? "stt"}): ${transcript}`,
        );
      } catch (error) {
        awaitingVoiceResponseRef.current = false;
        setTerminalEntries((entries) => [
          ...entries,
          {
            kind: "output",
            text: error instanceof Error ? error.message : String(error),
          },
        ]);
      } finally {
        setVoiceBusy(false);
      }
    },
    [runLiveCommand, voiceOutput],
  );

  const stopVoiceStream = useCallback(() => {
    voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
    voiceStreamRef.current = null;
  }, []);

  const stopVoiceRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
      return;
    }
    stopVoiceStream();
    setListening(false);
  }, [stopVoiceStream]);

  const startVoiceRecording = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setTerminalEntries((entries) => [
        ...entries,
        { kind: "output", text: "Browser audio recorder unavailable." },
      ]);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceStreamRef.current = stream;
      const preferredMime = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
      ].find((mime) => MediaRecorder.isTypeSupported(mime));
      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);

      voiceChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          voiceChunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        const recordedAudio = new Blob(voiceChunksRef.current, {
          type: recorder.mimeType || preferredMime || "audio/webm",
        });
        mediaRecorderRef.current = null;
        voiceChunksRef.current = [];
        stopVoiceStream();
        setListening(false);
        void handleRecordedVoice(recordedAudio);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setListening(true);
      setTerminalEntries((entries) => [
        ...entries,
        { kind: "output", text: "Listening..." },
      ]);
    } catch {
      stopVoiceStream();
      setListening(false);
      setTerminalEntries((entries) => [
        ...entries,
        { kind: "output", text: "Microphone permission unavailable." },
      ]);
    }
  }, [handleRecordedVoice, stopVoiceStream]);

  const toggleMic = async () => {
    if (listening) {
      stopVoiceRecording();
      return;
    }

    await startVoiceRecording();
  };

  const handleQuickTaskSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const command = quickTaskText.trim();
    if (!command) return;

    setQuickTaskOpen(false);
    setQuickTaskText("");
    runLiveCommand(command, "Quick task dispatched.");
  };

  const handleAttachmentChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    setTerminalEntries((entries) => [
      ...entries,
      {
        kind: "output",
        text: `Attached ${files.length} file${files.length === 1 ? "" : "s"}: ${files
          .map((file) => file.name)
          .join(", ")}`,
      },
    ]);
    event.target.value = "";
  };

  const toggleTool = (key: string) => {
    setEnabledTools((tools) => ({
      ...tools,
      [key]: !tools[key],
    }));
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
              active={listening || voiceBusy}
              busy={voiceBusy}
              onClick={() => void toggleMic()}
            />
            <QuickAction
              label="Quick Task"
              icon={Zap}
              onClick={() => setQuickTaskOpen((value) => !value)}
              active={quickTaskOpen}
            />
            <QuickAction
              label="Attach"
              icon={Paperclip}
              onClick={() => fileInputRef.current?.click()}
            />
            <QuickAction
              label="Tools"
              icon={Settings2}
              active={toolsOpen}
              onClick={() => setToolsOpen((value) => !value)}
            />
            <QuickAction
              label={voiceOutput ? "Mute" : "Unmute"}
              icon={voiceOutput ? Volume2 : VolumeX}
              active={voiceOutput}
              onClick={() => setVoiceOutput((value) => !value)}
            />
            <QuickAction
              label="Stats"
              icon={Gauge}
              active={statsVisible}
              onClick={() => setStatsVisible((value) => !value)}
            />
          </div>

          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            onChange={handleAttachmentChange}
            aria-label="Attach files"
          />

          {quickTaskOpen && (
            <form
              className="mt-3 flex w-full max-w-3xl flex-col gap-2 rounded-md border border-cyan-200/14 bg-black/32 p-3"
              onSubmit={handleQuickTaskSubmit}
            >
              <label className="text-[0.72rem] uppercase tracking-[0.1em] text-cyan-50/55">
                Quick task
              </label>
              <div className="flex gap-2">
                <input
                  value={quickTaskText}
                  onChange={(event) => setQuickTaskText(event.target.value)}
                  className="h-10 min-w-0 flex-1 rounded-md border border-cyan-200/12 bg-cyan-950/18 px-3 text-sm text-cyan-50 outline-none transition placeholder:text-cyan-50/28 focus:border-cyan-200/42"
                  placeholder="What should JARVIS do?"
                  autoFocus
                />
                <button
                  type="submit"
                  className="inline-flex h-10 items-center gap-2 rounded-md bg-cyan-200 px-3 text-[0.72rem] font-semibold uppercase tracking-[0.09em] text-slate-950 transition hover:bg-cyan-100"
                >
                  <Play className="h-4 w-4" />
                  Run
                </button>
              </div>
            </form>
          )}

          {toolsOpen && (
            <div className="mt-3 grid w-full max-w-3xl grid-cols-2 gap-2 rounded-md border border-cyan-200/14 bg-black/32 p-3 sm:grid-cols-4">
              {TOOL_TOGGLES.map((tool) => (
                <button
                  type="button"
                  key={tool.key}
                  onClick={() => toggleTool(tool.key)}
                  className={cn(
                    "h-9 rounded-md border px-2 text-[0.72rem] font-semibold uppercase tracking-[0.08em] transition",
                    enabledTools[tool.key]
                      ? "border-emerald-200/32 bg-emerald-300/12 text-emerald-100"
                      : "border-cyan-200/12 bg-cyan-200/5 text-cyan-50/62 hover:border-cyan-200/28 hover:text-cyan-50",
                  )}
                  aria-pressed={enabledTools[tool.key]}
                >
                  {tool.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {statsVisible ? (
          <StatsPanel readiness={readiness} stats={stats} />
        ) : (
          <button
            type="button"
            className="flex min-h-[160px] min-w-0 w-full max-w-full items-center justify-center rounded-md border border-cyan-200/12 bg-[#0c141b]/50 p-4 text-sm uppercase tracking-[0.12em] text-cyan-50/62 transition hover:border-cyan-200/28 hover:text-cyan-50"
            onClick={() => setStatsVisible(true)}
          >
            Stats hidden
          </button>
        )}
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

        <div
          className={cn(
            "min-h-0 overflow-hidden rounded-sm bg-black/28",
            terminalLive
              ? "h-[min(42vh,420px)] min-h-[280px]"
              : "overflow-y-auto p-3 font-mono text-[0.82rem] leading-relaxed text-cyan-50/82",
          )}
        >
          {terminalLive ? (
            <ChatPage
              className="h-full"
              initialInput={terminalLaunch?.command ?? null}
              initialInputKey={terminalLaunch?.id ?? null}
              isActive
              onOutputData={handleTerminalOutput}
              showPlugins={false}
              showSidebar={false}
            />
          ) : (
            terminalEntries.slice(-6).map((entry, index) => (
              <div
                key={`${entry.kind}-${index}-${entry.text}`}
                className={cn(
                  entry.kind === "input" ? "text-emerald-200" : "text-cyan-50/72",
                )}
              >
                <span className="text-cyan-100/35">
                  {entry.kind === "input" ? ">" : "jarvis"}
                </span>{" "}
                {entry.text}
              </div>
            ))
          )}
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
