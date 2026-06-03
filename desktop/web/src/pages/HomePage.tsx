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
  lazy,
  useMemo,
  useRef,
  useState,
  Suspense,
  type ChangeEvent,
  type FormEvent,
} from "react";

import type { OrbState } from "@/components/JarvisOrb";
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

const JarvisOrb = lazy(() =>
  import("@/components/JarvisOrb").then((module) => ({
    default: module.JarvisOrb,
  })),
);

type TerminalEntry = {
  kind: "input" | "output";
  text: string;
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

const VOICE_SPEECH_THRESHOLD = 0.035;
const VOICE_AUTO_STOP_SILENCE_MS = 520;
const VOICE_MAX_NO_SPEECH_MS = 30_000;
const VOICE_EMPTY_RETRY_DELAY_MS = 3_500;
const VOICE_MAX_EMPTY_RETRIES = 2;
const VOICE_SILENT_MONITOR_RESTART_MS = 250;
const VOICE_LIVE_TRANSCRIBE_INTERVAL_MS = 1_600;
const RUNTIME_POLL_VISIBLE_MS = 10_000;
const RUNTIME_POLL_BACKGROUND_MS = 30_000;
const STATS_POLL_VISIBLE_MS = 1_000;
const STATS_POLL_BACKGROUND_MS = 5_000;

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
  if (
    subsystemReady(readiness?.llm) ||
    subsystemReady(readiness?.tts) ||
    subsystemReady(readiness?.stt)
  ) {
    return "ready";
  }
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
  const voiceOutputBufferRef = useRef("");
  const speechQueueRef = useRef<Promise<void>>(Promise.resolve());
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const audioMeterContextRef = useRef<AudioContext | null>(null);
  const audioMeterFrameRef = useRef<number | null>(null);
  const audioMeterSourceRef = useRef<AudioNode | null>(null);
  const autoVoicePromptedRef = useRef(false);
  const voiceLiveAnnouncedRef = useRef(false);
  const voiceLiveTranscriptRef = useRef("");
  const voiceLastSnapshotAtRef = useRef(0);
  const voiceSnapshotInFlightRef = useRef(false);
  const voiceHadSpeechRef = useRef(false);
  const voiceSilenceStartedAtRef = useRef<number | null>(null);
  const voiceRecordingStartedAtRef = useRef<number | null>(null);
  const voiceEmptyCapturesRef = useRef(0);
  const voiceRetryTimerRef = useRef<number | null>(null);
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
  const [toolsOpen, setToolsOpen] = useState(false);
  const [statsVisible, setStatsVisible] = useState(true);
  const [enabledTools, setEnabledTools] = useState<Record<string, boolean>>({
    browser: true,
    files: true,
    terminal: true,
    web: true,
  });
  const [voiceOutput, setVoiceOutput] = useState(true);
  const [voiceRetryAt, setVoiceRetryAt] = useState(0);
  const [listening, setListening] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [terminalEntries, setTerminalEntries] = useState<TerminalEntry[]>([
    { kind: "output", text: "JARVIS desktop backend linked." },
  ]);

  const stopAudioMeter = useCallback(() => {
    if (audioMeterFrameRef.current !== null) {
      window.cancelAnimationFrame(audioMeterFrameRef.current);
      audioMeterFrameRef.current = null;
    }

    try {
      audioMeterSourceRef.current?.disconnect();
    } catch {
      // Source may already be disconnected by the browser.
    }
    audioMeterSourceRef.current = null;

    const context = audioMeterContextRef.current;
    audioMeterContextRef.current = null;
    if (context && context.state !== "closed") {
      void context.close().catch(() => undefined);
    }

    setAudioLevel(0);
  }, []);

  const monitorAnalyser = useCallback((analyser: AnalyserNode) => {
    const samples = new Uint8Array(analyser.fftSize);

    const tick = () => {
      analyser.getByteTimeDomainData(samples);
      let total = 0;
      for (let index = 0; index < samples.length; index += 1) {
        const centered = (samples[index] - 128) / 128;
        total += centered * centered;
      }
      const rms = Math.sqrt(total / samples.length);
      setAudioLevel(Math.min(1, rms * 4.5));
      audioMeterFrameRef.current = window.requestAnimationFrame(tick);
    };

    tick();
  }, []);

  const startStreamAudioMeter = useCallback(
    (stream: MediaStream) => {
      stopAudioMeter();
      const AudioContextConstructor =
        window.AudioContext ??
        (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioContextConstructor) return;

      const context = new AudioContextConstructor();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.72;
      const source = context.createMediaStreamSource(stream);
      source.connect(analyser);
      audioMeterContextRef.current = context;
      audioMeterSourceRef.current = source;
      monitorAnalyser(analyser);
    },
    [monitorAnalyser, stopAudioMeter],
  );

  const startPlaybackAudioMeter = useCallback(
    (audio: HTMLAudioElement) => {
      stopAudioMeter();
      const AudioContextConstructor =
        window.AudioContext ??
        (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioContextConstructor) return;

      const context = new AudioContextConstructor();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.78;
      const source = context.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(context.destination);
      audioMeterContextRef.current = context;
      audioMeterSourceRef.current = source;
      monitorAnalyser(analyser);
    },
    [monitorAnalyser, stopAudioMeter],
  );

  useEffect(() => {
    let cancelled = false;
    let runtimeTimer: number | null = null;
    let bootstrapped = false;

    const runtimePollDelay = () =>
      document.visibilityState === "visible"
        ? RUNTIME_POLL_VISIBLE_MS
        : RUNTIME_POLL_BACKGROUND_MS;

    const refreshLiveRuntime = () =>
      Promise.allSettled([
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

    const refreshStaticRuntime = () => {
      const runtimeRequest = bootstrapped
        ? refreshLiveRuntime()
        : api
            .getDesktopBootstrap()
            .then((bootstrap) => {
              bootstrapped = true;
              if (cancelled) return;
              setStatus(bootstrap.status);
              setReadiness(bootstrap.readiness);
              setTeamSouls(bootstrap.souls.souls);
              if (bootstrap.stats) setStats(bootstrap.stats);
              void refreshLiveRuntime();
            })
            .catch(() => {
              bootstrapped = true;
              return refreshLiveRuntime();
            });

      void runtimeRequest.finally(() => {
        if (!cancelled) {
          runtimeTimer = window.setTimeout(refreshStaticRuntime, runtimePollDelay());
        }
      });
    };

    refreshStaticRuntime();
    return () => {
      cancelled = true;
      if (runtimeTimer !== null) {
        window.clearTimeout(runtimeTimer);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let statsTimer: number | null = null;

    const statsPollDelay = () =>
      document.visibilityState === "visible" && statsVisible
        ? STATS_POLL_VISIBLE_MS
        : STATS_POLL_BACKGROUND_MS;

    const refreshStats = () => {
      void api
        .getRuntimeStats()
        .then((nextStats) => {
          if (!cancelled) setStats(nextStats);
        })
        .catch(() => {
          if (!cancelled) setStats(null);
        })
        .finally(() => {
          if (!cancelled) {
            statsTimer = window.setTimeout(refreshStats, statsPollDelay());
          }
        });
    };

    refreshStats();
    return () => {
      cancelled = true;
      if (statsTimer !== null) {
        window.clearTimeout(statsTimer);
      }
    };
  }, [statsVisible]);

  useEffect(() => {
    return () => {
      if (voiceRetryTimerRef.current !== null) {
        window.clearTimeout(voiceRetryTimerRef.current);
        voiceRetryTimerRef.current = null;
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
      stopAudioMeter();
    };
  }, [stopAudioMeter]);

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

  const runTerminalCommand = useCallback(async (command: string) => {
    setTerminalEntries((entries) => [
      ...entries,
      { kind: "input", text: command },
      { kind: "output", text: "Running command..." },
    ]);

    try {
      const result = await api.runTerminalCommand(command);
      setTerminalEntries((entries) => [
        ...entries.slice(0, -1),
        {
          kind: "output",
          text: result.output?.trim() || "Command completed with no output.",
        },
      ]);
    } catch (error) {
      setTerminalEntries((entries) => [
        ...entries.slice(0, -1),
        {
          kind: "output",
          text: error instanceof Error ? error.message : String(error),
        },
      ]);
    }
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
      void runTerminalCommand(command.replace(/^[$>]\s*/, ""));
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
          stopAudioMeter();
          setSpeaking(false);
        };
        audio.onerror = () => {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          if (audioPlayerRef.current === audio) audioPlayerRef.current = null;
          stopAudioMeter();
          setSpeaking(false);
        };
        startPlaybackAudioMeter(audio);
        await audio.play();
      } catch (error) {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        stopAudioMeter();
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
    [startPlaybackAudioMeter, stopAudioMeter, voiceOutput],
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
        buffered.length > 140 ||
        /[.!?]["')\]]?\s$/.test(buffered) ||
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
      if (source === "voice") {
        setTerminalInput("");
      }
      const agentPrompt =
        source === "voice"
          ? `Spoken user message: ${cleanPrompt}\n\nRespond naturally, briefly, and directly. Do not echo disfluent transcription artifacts.`
          : cleanPrompt;
      setVoiceBusy(true);
      voiceOutputBufferRef.current = "";
      setTerminalEntries((entries) => [
        ...entries,
        { kind: "input", text: source === "voice" ? `voice: ${cleanPrompt}` : cleanPrompt },
        { kind: "output", text: "" },
      ]);

      try {
        await api.streamDesktopChat(agentPrompt, {
          onDelta: (text) => {
            appendTerminalOutput(text);
            queueVoiceDelta(text);
          },
          onDone: handleDesktopChatDone,
          onError: (message) => {
            appendTerminalOutput(`\n${message}`);
          },
        });
      } catch (error) {
        appendTerminalOutput(
          `\n${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        queueVoiceDelta("", true);
        setVoiceBusy(false);
      }
    },
    [appendTerminalOutput, handleDesktopChatDone, queueVoiceDelta],
  );

  const transcribeVoiceSnapshot = useCallback(
    async (audio: Blob, mode: "live" | "final"): Promise<string> => {
      if (audio.size === 0) return "";
      const result = await api.transcribeVoice(audio);
      const transcript = result.transcript?.trim() ?? "";
      if (!result.success || !transcript) {
        if (mode === "final") {
          throw new Error(result.error || "STT returned an empty transcript.");
        }
        return "";
      }

      voiceLiveTranscriptRef.current = transcript;
      setTerminalInput(transcript);
      return transcript;
    },
    [],
  );

  const queueLiveVoiceTranscription = useCallback(
    (mimeType: string) => {
      const now = Date.now();
      if (voiceSnapshotInFlightRef.current) return;
      if (now - voiceLastSnapshotAtRef.current < VOICE_LIVE_TRANSCRIBE_INTERVAL_MS) return;
      if (!voiceHadSpeechRef.current || voiceChunksRef.current.length < 2) return;

      const audio = new Blob([...voiceChunksRef.current], { type: mimeType || "audio/webm" });
      if (audio.size < 1024) return;

      voiceSnapshotInFlightRef.current = true;
      voiceLastSnapshotAtRef.current = now;
      void transcribeVoiceSnapshot(audio, "live")
        .catch(() => undefined)
        .finally(() => {
          voiceSnapshotInFlightRef.current = false;
        });
    },
    [transcribeVoiceSnapshot],
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
        { kind: "output", text: "JARVIS is hearing you..." },
      ]);

      try {
        const transcript = await transcribeVoiceSnapshot(audio, "final");

        voiceEmptyCapturesRef.current = 0;
        await runDesktopAgentTurn(transcript, "voice");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const shouldKeepListening =
          autoVoiceArmed &&
          (message.toLowerCase().includes("empty transcript") ||
            message.toLowerCase().includes("no microphone audio") ||
            message.toLowerCase().includes("not catch"));
        if (shouldKeepListening) {
          voiceEmptyCapturesRef.current += 1;
          if (voiceEmptyCapturesRef.current >= VOICE_MAX_EMPTY_RETRIES) {
            setAutoVoiceArmed(false);
          } else {
            const retryAt = Date.now() + VOICE_EMPTY_RETRY_DELAY_MS;
            setVoiceRetryAt(retryAt);
            if (voiceRetryTimerRef.current !== null) {
              window.clearTimeout(voiceRetryTimerRef.current);
            }
            voiceRetryTimerRef.current = window.setTimeout(() => {
              voiceRetryTimerRef.current = null;
              setVoiceRetryAt(0);
            }, VOICE_EMPTY_RETRY_DELAY_MS);
          }
        }
        setTerminalEntries((entries) => [
          ...entries,
          {
            kind: "output",
            text: shouldKeepListening
              ? voiceEmptyCapturesRef.current >= VOICE_MAX_EMPTY_RETRIES
                ? "I did not catch speech twice. Voice is paused until the microphone has a clear signal."
                : "I did not catch that. Listening again shortly."
              : message,
          },
        ]);
      } finally {
        setVoiceBusy(false);
      }
    },
    [autoVoiceArmed, runDesktopAgentTurn, transcribeVoiceSnapshot],
  );

  const stopVoiceStream = useCallback(() => {
    voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
    voiceStreamRef.current = null;
    stopAudioMeter();
  }, [stopAudioMeter]);

  const stopVoiceRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
      return;
    }
    stopVoiceStream();
    setListening(false);
    voiceSilenceStartedAtRef.current = null;
    voiceRecordingStartedAtRef.current = null;
  }, [stopVoiceStream]);

  const startVoiceRecording = useCallback(async () => {
    if (!subsystemReady(readiness?.stt)) {
      setTerminalEntries((entries) => [
        ...entries,
        { kind: "output", text: "STT is not ready yet. Waiting for the Whisper model." },
      ]);
      return;
    }

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
      voiceLiveTranscriptRef.current = "";
      voiceLastSnapshotAtRef.current = 0;
      voiceSnapshotInFlightRef.current = false;
      voiceHadSpeechRef.current = false;
      voiceSilenceStartedAtRef.current = null;
      voiceRecordingStartedAtRef.current = Date.now();
      startStreamAudioMeter(stream);
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
          queueLiveVoiceTranscription(recorder.mimeType || preferredMime || "audio/webm");
        }
      };
      recorder.onstop = () => {
        const hadSpeech = voiceHadSpeechRef.current;
        const liveTranscript = voiceLiveTranscriptRef.current.trim();
        const recordedAudio = new Blob(voiceChunksRef.current, {
          type: recorder.mimeType || preferredMime || "audio/webm",
        });
        mediaRecorderRef.current = null;
        voiceChunksRef.current = [];
        stopVoiceStream();
        setListening(false);
        voiceSilenceStartedAtRef.current = null;
        voiceRecordingStartedAtRef.current = null;
        if (!hadSpeech) {
          setVoiceRetryAt(Date.now() + VOICE_SILENT_MONITOR_RESTART_MS);
          window.setTimeout(() => setVoiceRetryAt(0), VOICE_SILENT_MONITOR_RESTART_MS);
          return;
        }
        if (liveTranscript) {
          voiceEmptyCapturesRef.current = 0;
          setTerminalInput("");
          void runDesktopAgentTurn(liveTranscript, "voice");
          return;
        }
        void handleRecordedVoice(recordedAudio);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setListening(true);
      if (!voiceLiveAnnouncedRef.current) {
        voiceLiveAnnouncedRef.current = true;
        setTerminalEntries((entries) => [
          ...entries,
          { kind: "output", text: "Voice is live." },
        ]);
      }
    } catch {
      stopVoiceStream();
      setListening(false);
      voiceSilenceStartedAtRef.current = null;
      voiceRecordingStartedAtRef.current = null;
      setTerminalEntries((entries) => [
        ...entries,
        { kind: "output", text: "Microphone permission unavailable." },
      ]);
    }
  }, [
    handleRecordedVoice,
    queueLiveVoiceTranscription,
    readiness?.stt,
    runDesktopAgentTurn,
    startStreamAudioMeter,
    stopVoiceStream,
  ]);

  useEffect(() => {
    if (!autoVoiceArmed || listening || voiceBusy || speaking) return;
    if (!subsystemReady(readiness?.stt)) return;
    if (voiceRetryAt && Date.now() < voiceRetryAt) return;

    let cancelled = false;
    const requestInitialPermission = () => {
      if (cancelled || autoVoicePromptedRef.current) return;
      autoVoicePromptedRef.current = true;
      void startVoiceRecording();
    };

    if (!navigator.permissions?.query) {
      void startVoiceRecording();
      return () => {
        cancelled = true;
      };
    }

    navigator.permissions
      .query({ name: "microphone" as PermissionName })
      .then((permission) => {
        if (cancelled || permission.state === "denied") return;
        if (permission.state === "granted") {
          void startVoiceRecording();
          return;
        }
        requestInitialPermission();
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [
    autoVoiceArmed,
    listening,
    readiness?.stt?.ready,
    speaking,
    startVoiceRecording,
    voiceBusy,
    voiceRetryAt,
  ]);

  useEffect(() => {
    if (!listening) return;
    const now = Date.now();
    if (voiceRecordingStartedAtRef.current === null) {
      voiceRecordingStartedAtRef.current = now;
    }

    if (audioLevel >= VOICE_SPEECH_THRESHOLD) {
      voiceHadSpeechRef.current = true;
      voiceSilenceStartedAtRef.current = null;
      return;
    }

    if (voiceHadSpeechRef.current) {
      if (voiceSilenceStartedAtRef.current === null) {
        voiceSilenceStartedAtRef.current = now;
      }
      if (now - voiceSilenceStartedAtRef.current >= VOICE_AUTO_STOP_SILENCE_MS) {
        stopVoiceRecording();
      }
      return;
    }

    if (now - voiceRecordingStartedAtRef.current >= VOICE_MAX_NO_SPEECH_MS) {
      stopVoiceRecording();
    }
  }, [audioLevel, listening, stopVoiceRecording]);

  const toggleMic = async () => {
    if (listening) {
      stopVoiceRecording();
      return;
    }

    voiceEmptyCapturesRef.current = 0;
    autoVoicePromptedRef.current = false;
    voiceLiveAnnouncedRef.current = false;
    voiceLiveTranscriptRef.current = "";
    setVoiceRetryAt(0);
    setAutoVoiceArmed(true);
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
  const sttReady = subsystemReady(readiness?.stt);
  const micLabel = sttReady
    ? "mic ready"
    : autoVoiceArmed
      ? "mic waiting"
      : "mic paused";
  const tokenRateLabel = `${(stats?.tokens_per_second ?? 0).toFixed(2)} tokens/s`;
  const visibleSouls = teamSouls
    .filter((soul) => soul.id !== "jarvis")
    .slice(0, 7);

  return (
    <main
      className="relative isolate flex h-full max-h-full min-h-0 min-w-0 w-full max-w-[calc(100vw-1.5rem)] flex-1 flex-col gap-3 overflow-hidden px-0 py-0 text-slate-100 lg:max-w-full"
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
      <section className="grid min-h-0 min-w-0 w-full max-w-full flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(230px,280px)] 2xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="relative flex min-h-0 min-w-0 w-full max-w-full flex-col items-center justify-center overflow-hidden px-4 py-3 sm:px-5">
          <div
            className="pointer-events-none absolute inset-x-[8%] top-[8%] h-px opacity-60"
            style={{
              background:
                "linear-gradient(90deg, transparent, rgba(0,212,255,0.44), rgba(184,108,255,0.4), transparent)",
            }}
          />
          <div className="relative grid min-h-[210px] w-full max-w-[620px] place-items-center overflow-visible">
            <TeamSoulOrbit souls={visibleSouls} activeSoul={stats?.active_soul ?? "jarvis"} />
            <Suspense fallback={<OrbLoadingFallback />}>
              <JarvisOrb audioLevel={audioLevel} state={orbState} className="z-10" />
            </Suspense>
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
              <span>{micLabel}</span>
              <span className="text-cyan-100/25">|</span>
              <span>{tokenRateLabel}</span>
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
            className="flex h-full min-h-[160px] min-w-0 w-full max-w-full items-center justify-center rounded-md border border-cyan-200/12 bg-[#0c141b]/50 p-4 text-sm uppercase tracking-[0.12em] text-cyan-50/62 transition hover:border-cyan-200/28 hover:text-cyan-50"
            onClick={() => setStatsVisible(true)}
          >
            Stats hidden
          </button>
        )}
      </section>

      <section className="grid h-[clamp(190px,30dvh,340px)] min-h-0 min-w-0 w-full max-w-full shrink-0 gap-3 rounded-md border border-white/12 bg-[#0d1219]/94 p-3 shadow-[0_16px_60px_rgba(0,0,0,0.25)]">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-2">
          <div className="flex items-center gap-2 text-[0.82rem] uppercase tracking-[0.08em] text-slate-200/76">
            <Activity className="h-4 w-4 text-cyan-200" />
            <span>Terminal / Chat Input</span>
          </div>
          <span
            className="rounded-sm border border-cyan-200/12 px-2 py-1 text-[0.66rem] uppercase tracking-[0.1em] text-cyan-50/62"
            title="Type 'smoke' and press Run for a live runtime check."
          >
            Chat stream
          </span>
        </div>

        <div className="min-h-0 overflow-y-auto rounded-sm bg-black/28 p-3 font-mono text-[0.9rem] leading-relaxed text-slate-100/88">
          {terminalEntries.slice(-10).map((entry, index) => (
            <div
              key={`${entry.kind}-${index}-${entry.text}`}
              className={cn(
                "whitespace-pre-wrap break-words",
                entry.kind === "input" ? "text-emerald-200" : "text-cyan-50/72",
              )}
            >
              <span className="text-cyan-100/35">
                {entry.kind === "input" ? ">" : "jarvis"}
              </span>{" "}
              {entry.text}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2">
          <div className="text-[0.7rem] uppercase tracking-[0.12em] text-slate-300/58">
            Steering
          </div>
          <AudioLevelMeter level={audioLevel} active={listening || speaking || voiceBusy} />
          <div className="flex items-center gap-2">
            <QuickAction
              label={listening ? "Listening" : autoVoiceArmed ? "Voice live" : "Talk"}
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

  const orbitPoints = [
    { x: 28, y: 24 },
    { x: 50, y: 17 },
    { x: 72, y: 24 },
    { x: 80, y: 48 },
    { x: 67, y: 73 },
    { x: 33, y: 73 },
    { x: 20, y: 48 },
  ];

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {souls.map((soul, index) => {
        const point = orbitPoints[index % orbitPoints.length];
        const isActive = soul.id === activeSoul;

        return (
          <div
            key={soul.id}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
            style={{ left: `${point.x}%`, top: `${point.y}%` }}
            title={`${soul.name}: ${soul.when_to_use}`}
          >
            <span
              className={cn(
                "grid h-8 w-8 place-items-center rounded-full border bg-[#0b1820]/80 shadow-[0_0_24px_rgba(0,212,255,0.16)] backdrop-blur",
                isActive
                  ? "border-cyan-100/70 text-cyan-50"
                  : soul.ready
                    ? "border-cyan-200/22 text-cyan-100/78"
                    : "border-amber-200/30 text-amber-100/75",
              )}
            >
              <span className="h-3 w-3 rounded-full bg-cyan-200 shadow-[0_0_16px_rgba(125,249,255,0.72)]" />
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

function OrbLoadingFallback() {
  return (
    <div
      aria-label="Loading JARVIS orb"
      className="relative z-10 grid aspect-square w-[clamp(150px,18vw,215px)] place-items-center overflow-visible"
    >
      <div className="h-[58%] w-[58%] rounded-full bg-cyan-100/72 shadow-[0_0_46px_rgba(125,249,255,0.34),0_0_90px_rgba(184,108,255,0.22)]" />
    </div>
  );
}

function AudioLevelMeter({
  active,
  level,
}: {
  active: boolean;
  level: number;
}) {
  const normalized = Math.max(0.04, Math.min(1, level));

  return (
    <div
      className={cn(
        "hidden h-9 min-w-[150px] items-end gap-1 rounded-md border border-cyan-200/12 bg-cyan-200/5 px-2 py-1.5 sm:flex",
        active ? "opacity-100" : "opacity-42",
      )}
      aria-label="Live voice level"
      title="Live voice level"
    >
      {Array.from({ length: 18 }).map((_, index) => {
        const phase = (index + 1) / 18;
        const height = active
          ? 18 * Math.max(0.16, Math.sin(phase * Math.PI) * normalized)
          : 3 + (index % 3);
        return (
          <span
            key={index}
            className="w-1 rounded-full bg-cyan-100 shadow-[0_0_10px_rgba(125,249,255,0.42)]"
            style={{ height }}
          />
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
