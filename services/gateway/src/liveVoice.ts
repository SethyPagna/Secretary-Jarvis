import { appendTranscriptChunk, createVoiceSession, type TranscriptChunk, type VoiceSession } from "@jarvis/core";

export interface LiveVoiceSessionResult {
  voiceSession: VoiceSession;
  hudState: "idle" | "listening" | "thinking" | "error";
  message: string;
}

export function startLiveVoiceSession(params: {
  existing?: VoiceSession;
  id: string;
  now: string;
  toolsReady: boolean;
  resetTranscript?: boolean;
}): LiveVoiceSessionResult {
  const base =
    params.existing && !params.resetTranscript
      ? { ...params.existing, updatedAt: params.now }
      : createVoiceSession({ id: params.existing?.id ?? params.id, now: params.now, toolsReady: params.toolsReady });
  const voiceSession: VoiceSession = params.toolsReady
    ? {
        ...base,
        state: "listening",
        updatedAt: params.now,
        message: "Listening locally. Say a command or type a transcript chunk.",
      }
    : {
        ...base,
        state: "missing-tools",
        updatedAt: params.now,
        message: "Voice listening is wired, but STT runtime dependencies are not ready.",
      };

  return {
    voiceSession,
    hudState: params.toolsReady ? "listening" : "error",
    message: voiceSession.message,
  };
}

export function stopLiveVoiceSession(params: {
  existing?: VoiceSession;
  id: string;
  now: string;
  toolsReady: boolean;
  reason?: string;
}): LiveVoiceSessionResult {
  const base = params.existing ?? createVoiceSession({ id: params.id, now: params.now, toolsReady: params.toolsReady });
  const voiceSession: VoiceSession = {
    ...base,
    state: params.toolsReady ? "idle" : "missing-tools",
    updatedAt: params.now,
    message: params.reason?.trim() || "Listening stopped.",
  };

  return {
    voiceSession,
    hudState: "idle",
    message: voiceSession.message,
  };
}

export function appendLiveTranscriptChunk(params: {
  existing?: VoiceSession;
  id: string;
  chunkId: string;
  now: string;
  toolsReady: boolean;
  text: string;
  final?: boolean;
  confidence?: number;
  startMs?: number;
  endMs?: number;
  engineId?: string;
}): LiveVoiceSessionResult {
  const text = params.text.trim();
  const base =
    params.existing ??
    createVoiceSession({
      id: params.id,
      now: params.now,
      toolsReady: params.toolsReady,
    });
  if (!text) {
    return {
      voiceSession: {
        ...base,
        state: "error",
        updatedAt: params.now,
        message: "Transcript chunk text is required.",
      },
      hudState: "error",
      message: "Transcript chunk text is required.",
    };
  }

  const lastEnd = base.transcript.at(-1)?.endMs ?? 0;
  const chunk: TranscriptChunk = {
    id: params.chunkId,
    text,
    startMs: params.startMs ?? lastEnd,
    endMs: params.endMs ?? lastEnd + Math.max(600, text.length * 45),
    confidence: Math.max(0, Math.min(1, params.confidence ?? 0.82)),
    engineId: params.engineId ?? base.sttEngineId,
    final: params.final ?? false,
  };
  const appended = appendTranscriptChunk(base, chunk, params.now);
  const voiceSession: VoiceSession = {
    ...appended,
    state: chunk.final ? "idle" : "transcribing",
    message: chunk.final ? "Transcript ready to send." : "Transcript chunk captured.",
  };

  return {
    voiceSession,
    hudState: chunk.final ? "thinking" : "listening",
    message: voiceSession.message,
  };
}

export function transcriptText(session?: VoiceSession): string {
  return (session?.transcript ?? [])
    .map((chunk) => chunk.text.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function commitLiveTranscript(params: {
  existing?: VoiceSession;
  id: string;
  now: string;
  toolsReady: boolean;
}): LiveVoiceSessionResult & { text: string; committable: boolean } {
  const base =
    params.existing ??
    createVoiceSession({
      id: params.id,
      now: params.now,
      toolsReady: params.toolsReady,
    });
  const text = transcriptText(base);
  const voiceSession: VoiceSession = {
    ...base,
    state: text ? "idle" : "error",
    updatedAt: params.now,
    message: text ? "Transcript committed to Jarvis." : "No transcript is available to commit.",
  };

  return {
    voiceSession,
    hudState: text ? "thinking" : "error",
    message: voiceSession.message,
    text,
    committable: Boolean(text),
  };
}
