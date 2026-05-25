import {
  Activity,
  Gauge,
  Mic,
  Paperclip,
  Play,
  Settings2,
  Volume2,
  VolumeX,
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
  type DesktopChatResponse,
  type RuntimeReadinessResponse,
  type RuntimeSmokeResponse,
  type RuntimeStatsResponse,
  type StatusResponse,
  type TeamSoulInfo,
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

function isExplicitShellCommand(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed) return false;
  if (/^[$>]/.test(trimmed)) return true;
  if (/^(powershell|pwsh|cmd|dir|cd|ls|type|cat|git|npm|py|python|node|jarvis)\b/i.test(trimmed)) {
    return true;
  }
  return false;
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
  const speechQueueRef = useRef<Promise<void>>(Promise.resolve());
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [stats, setStats] = useState<RuntimeStatsResponse | null>(null);
  const [readiness, setReadiness] = useState<RuntimeReadinessResponse | null>(
    null,
  );
  const [smoke, setSmoke] = useState<RuntimeSmokeResponse | null>(null);
  const [teamSouls, setTeamSouls] = useState<TeamSoulInfo[]>([]);
  const [autoVoiceArmed, setAutoVoiceArmed] = useState(true);
  const [smokeRunning, setSmokeRunning] = useState(false);
  const [terminalInput, setTerminalInput] = useState("");
  const [terminalLive, setTerminalLive] = useState(false);
  const [terminalLaunch, setTerminalLaunch] = useState<TerminalLaunch | null>(
    null,
  );
  const [toolsOpen, setToolsOpen] = useState(false);
  const [statsVisible, setStatsVisible] = useState(true);
  const [enabledTools, setEnabledTools] = useState<Record<string, boolean>>({
    browser: true,
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
      void Promise.allSettled([
        api.getStatus(),
        api.getRuntimeReadiness(),
        api.getTeamSouls(),
      ]).then(
        ([statusResult, readinessResult, soulsResult]) => {
          if (cancelled) return;
          if (statusResult.status === "fulfilled") setStatus(statusResult.value);
          if (readinessResult.status === "fulfilled") {
            setReadiness(readinessResult.value);
          }
          if (soulsResult.status === "fulfilled") {
            setTeamSouls(soulsResult.value.souls);
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

  const appendTerminalOutput = useCallback((text: string) => {
    if (!text) return;
    setTerminalEntries((entries) => {
      const last = entries.at(-1);
      if (last?.kind === "output") {
        return [
          ...entries.slice(0, -1),
          { ...last, text: `${last.text}${text}` },
        ];
      }
      return [...entries, { kind: "output", text }];
    });
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

    if (command.toLowerCase() === "status") {
      setTerminalEntries((entries) => [
        ...entries,
        { kind: "input", text: command },
        {
          kind: "output",
          text: `Backend ${compactStatus(status, readiness)}. Gateway ${status?.gateway_state ?? "unknown"}.`,
        },
      ]);
      return;
    }

    if (isExplicitShellCommand(command)) {
      runLiveCommand(command.replace(/^[$>]\s*/, ""));
      return;
    }

    void runDesktopAgentTurn(command, "typed");
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

  const queueSynthesizedSpeech = useCallback(
    (rawText: string) => {
      const text = terminalTextForSpeech(rawText);
      if (!text || !voiceOutput) return;
      speechQueueRef.current = speechQueueRef.current
        .catch(() => undefined)
        .then(() => playSynthesizedSpeech(text));
    },
    [playSynthesizedSpeech, voiceOutput],
  );

  const flushVoiceOutputBuffer = useCallback(() => {
    const bufferedOutput = voiceOutputBufferRef.current;
    voiceOutputBufferRef.current = "";
    if (bufferedOutput.trim()) {
      queueSynthesizedSpeech(bufferedOutput);
    }
  }, [queueSynthesizedSpeech]);

  const queueVoiceDelta = useCallback(
    (chunk: string, force = false) => {
      if (!voiceOutput) return;
      voiceOutputBufferRef.current += chunk;
      const buffered = voiceOutputBufferRef.current;
      if (
        force ||
        buffered.length > 220 ||
        /[.!?]\s$/.test(buffered) ||
        /\n\n$/.test(buffered)
      ) {
        flushVoiceOutputBuffer();
      }
    },
    [flushVoiceOutputBuffer, voiceOutput],
  );

  const handleDesktopChatDone = useCallback(
    (result: DesktopChatResponse) => {
      queueVoiceDelta("", true);
      setTerminalEntries((entries) => [
        ...entries,
        {
          kind: "output",
          text: `\n[${result.input_tokens} in / ${result.output_tokens} out | ${Math.round(result.latency_ms)} ms]`,
        },
      ]);
      void api.getRuntimeStats().then(setStats).catch(() => undefined);
    },
    [queueVoiceDelta],
  );

  const runDesktopAgentTurn = useCallback(
    async (prompt: string, source: "typed" | "voice") => {
      const cleanPrompt = prompt.trim();
      if (!cleanPrompt) return;
      setVoiceBusy(true);
      setTerminalLive(false);
      voiceOutputBufferRef.current = "";
      awaitingVoiceResponseRef.current = voiceOutput;
      setTerminalEntries((entries) => [
        ...entries,
        { kind: "input", text: source === "voice" ? `voice: ${cleanPrompt}` : cleanPrompt },
        { kind: "output", text: "" },
      ]);

      try {
        await api.streamDesktopChat(cleanPrompt, {
          onDelta: (text) => {
            appendTerminalOutput(text);
            queueVoiceDelta(text);
          },
          onDone: handleDesktopChatDone,
          onError: (message) => {
            appendTerminalOutput(`\n${message}`);
            awaitingVoiceResponseRef.current = false;
          },
        });
      } catch (error) {
        appendTerminalOutput(
          `\n${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        awaitingVoiceResponseRef.current = false;
        queueVoiceDelta("", true);
        setVoiceBusy(false);
      }
    },
    [appendTerminalOutput, handleDesktopChatDone, queueVoiceDelta, voiceOutput],
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
        setTerminalEntries((entries) => [
          ...entries,
          {
            kind: "output",
            text: `Voice transcript (${result.provider ?? result.engine ?? "stt"}): ${transcript}`,
          },
        ]);
        await runDesktopAgentTurn(transcript, "voice");
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
    [runDesktopAgentTurn],
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

  useEffect(() => {
    if (!autoVoiceArmed || listening || voiceBusy) return;
    if (!readiness?.production_ready) return;
    if (!navigator.permissions?.query) return;

    let cancelled = false;
    navigator.permissions
      .query({ name: "microphone" as PermissionName })
      .then((permission) => {
        if (cancelled || permission.state !== "granted") return;
        void startVoiceRecording();
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [
    autoVoiceArmed,
    listening,
    readiness?.production_ready,
    startVoiceRecording,
    voiceBusy,
  ]);

  const toggleMic = async () => {
    if (listening) {
      stopVoiceRecording();
      return;
    }

    await startVoiceRecording();
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
  const visibleSouls = teamSouls
    .filter((soul) => soul.id !== "jarvis")
    .slice(0, 7);

  return (
    <main
      className="relative isolate flex min-h-0 min-w-0 w-full max-w-[calc(100vw-1.5rem)] flex-1 flex-col gap-3 overflow-hidden px-0 py-0 text-slate-100 lg:max-w-full"
      style={{
        backgroundImage:
          "radial-gradient(circle at 18% 20%, rgba(0, 212, 255, 0.2), transparent 28%), radial-gradient(circle at 76% 16%, rgba(184, 108, 255, 0.14), transparent 30%), radial-gradient(circle at 52% 82%, rgba(255, 102, 0, 0.08), transparent 34%), linear-gradient(135deg, #080b10 0%, #111822 46%, #07090f 100%)",
      }}
    >
      <div className="jarvis-cosmic-field pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div
          className="absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.75) 0 1px, transparent 1.4px), radial-gradient(circle, rgba(0,212,255,0.6) 0 1px, transparent 1.6px), radial-gradient(circle, rgba(184,108,255,0.5) 0 1px, transparent 1.5px)",
            backgroundPosition: "0 0, 42px 28px, 88px 64px",
            backgroundSize: "120px 120px, 170px 170px, 230px 230px",
          }}
        />
        <div
          className="absolute inset-x-[-12%] top-[-18%] h-[52%] opacity-55 blur-3xl"
          style={{
            background:
              "linear-gradient(110deg, transparent 5%, rgba(0,212,255,0.18) 28%, rgba(184,108,255,0.2) 52%, rgba(255,102,0,0.12) 72%, transparent 95%)",
            transform: "rotate(-7deg)",
          }}
        />
      </div>
      <section className="grid min-h-0 min-w-0 w-full max-w-full flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_330px] 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="relative flex min-h-[310px] min-w-0 w-full max-w-full flex-col items-center justify-center overflow-visible px-4 py-3 sm:px-5">
          <div
            className="pointer-events-none absolute inset-x-[8%] top-[8%] h-px opacity-60"
            style={{
              background:
                "linear-gradient(90deg, transparent, rgba(0,212,255,0.44), rgba(184,108,255,0.4), transparent)",
            }}
          />
          <div className="relative grid min-h-[245px] w-full max-w-[620px] place-items-center overflow-visible">
            <TeamSoulOrbit souls={visibleSouls} activeSoul={stats?.active_soul ?? "jarvis"} />
            <JarvisOrb state={orbState} className="z-10" />
          </div>

          <div className="mt-2 flex flex-col items-center gap-2 text-center">
            <p className="text-xl font-semibold tracking-[0.01em] text-white drop-shadow-[0_0_18px_rgba(0,212,255,0.24)] sm:text-2xl">
              How can I help?
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 text-[0.78rem] uppercase tracking-[0.08em] text-slate-200/70">
              <span>{statusLabel}</span>
              <span className="text-cyan-100/25">|</span>
              <span>{activeVoice}</span>
              <span className="text-cyan-100/25">|</span>
              <span>{readiness?.stt?.ready ? "mic ready" : "mic checking"}</span>
              <span className="text-cyan-100/25">|</span>
              <span>{stats?.tokens_total_lifetime ?? 0} lifetime tokens</span>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            onChange={handleAttachmentChange}
            aria-label="Attach files"
          />

          {toolsOpen && (
            <div className="mt-3 grid w-full max-w-3xl grid-cols-2 gap-2 rounded-md border border-cyan-200/16 bg-black/42 p-3 shadow-[0_18px_54px_rgba(0,0,0,0.26)] backdrop-blur-xl sm:grid-cols-4">
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

      <section className="grid min-h-[180px] min-w-0 w-full max-w-full gap-3 rounded-md border border-white/12 bg-[#0d1219]/94 p-3 shadow-[0_16px_60px_rgba(0,0,0,0.25)]">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-2">
          <div className="flex items-center gap-2 text-[0.82rem] uppercase tracking-[0.08em] text-slate-200/76">
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
              : "overflow-y-auto p-3 font-mono text-[0.9rem] leading-relaxed text-slate-100/88",
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

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2">
          <div className="text-[0.7rem] uppercase tracking-[0.12em] text-slate-300/58">
            Steering
          </div>
          <div className="flex items-center gap-2">
            <QuickAction
              label={listening ? "Stop listening" : "Voice input"}
              icon={Mic}
              active={autoVoiceArmed || listening || voiceBusy}
              busy={voiceBusy}
              onClick={() => {
                setAutoVoiceArmed(true);
                void toggleMic();
              }}
            />
            <QuickAction
              label="Tools"
              icon={Settings2}
              active={toolsOpen}
              onClick={() => setToolsOpen((value) => !value)}
            />
            <QuickAction
              label={voiceOutput ? "Voice output on" : "Voice output muted"}
              icon={voiceOutput ? Volume2 : VolumeX}
              active={voiceOutput}
              onClick={() => setVoiceOutput((value) => !value)}
            />
            <QuickAction
              label={statsVisible ? "Hide stats" : "Show stats"}
              icon={Gauge}
              active={statsVisible}
              onClick={() => setStatsVisible((value) => !value)}
            />
          </div>
        </div>

        <form className="flex items-center gap-2" onSubmit={submitTerminal}>
          <input
            value={terminalInput}
            onChange={(event) => setTerminalInput(event.target.value)}
            className="h-11 min-w-0 flex-1 rounded-md border border-white/12 bg-white/6 px-3 font-mono text-[0.92rem] text-white outline-none transition placeholder:text-slate-300/38 focus:border-cyan-200/48"
            placeholder="Ask JARVIS, say a command, or run status"
          />
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-cyan-200/12 bg-cyan-200/5 text-cyan-50/78 transition hover:border-cyan-200/30 hover:bg-cyan-200/10 hover:text-cyan-50"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Attach files"
            title="Attach files"
          >
            <Paperclip className="h-5 w-5" />
          </button>
          <button
            type="submit"
            className="inline-flex h-11 items-center gap-2 rounded-md bg-cyan-200 px-4 text-[0.78rem] font-semibold uppercase tracking-[0.08em] text-slate-950 transition hover:bg-cyan-100"
          >
            <Play className="h-4 w-4" />
            Run
          </button>
        </form>
      </section>
    </main>
  );
}

function TeamSoulOrbit({
  activeSoul,
  souls,
}: {
  activeSoul: string;
  souls: TeamSoulInfo[];
}) {
  if (souls.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {souls.map((soul, index) => {
        const angle = -118 + index * (236 / Math.max(1, souls.length - 1));
        const radiusX = 41;
        const radiusY = 36;
        const x = 50 + Math.cos((angle * Math.PI) / 180) * radiusX;
        const y = 52 + Math.sin((angle * Math.PI) / 180) * radiusY;
        const isActive = soul.id === activeSoul;

        return (
          <div
            key={soul.id}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
            style={{ left: `${x}%`, top: `${y}%` }}
            title={`${soul.name}: ${soul.when_to_use}`}
          >
            <span
              className={cn(
                "grid h-10 w-10 place-items-center rounded-full border bg-[#0b1820]/80 shadow-[0_0_28px_rgba(0,212,255,0.18)] backdrop-blur",
                isActive
                  ? "border-cyan-100/70 text-cyan-50"
                  : soul.ready
                    ? "border-cyan-200/22 text-cyan-100/78"
                    : "border-amber-200/30 text-amber-100/75",
              )}
            >
              <span className="h-4 w-4 rounded-full bg-cyan-200 shadow-[0_0_18px_rgba(125,249,255,0.72)]" />
            </span>
            <span className="max-w-[5rem] truncate rounded-sm bg-black/36 px-1.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-cyan-50/72 backdrop-blur">
              {soul.name}
            </span>
          </div>
        );
      })}
    </div>
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
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={busy}
      className={cn(
        "inline-flex h-9 w-9 min-w-0 items-center justify-center rounded-md border",
        "transition",
        active
          ? "border-cyan-200/38 bg-cyan-200/16 text-cyan-50"
          : "border-cyan-200/12 bg-cyan-200/5 text-cyan-50/72 hover:border-cyan-200/30 hover:bg-cyan-200/10 hover:text-cyan-50",
        busy && "cursor-wait opacity-70",
      )}
    >
      <Icon className={cn("h-[18px] w-[18px] shrink-0", busy && "animate-pulse")} />
    </button>
  );
}
