import type { TranscriptChunk, VoiceSession } from "./types.js";

export function createVoiceSession(params: {
  id: string;
  sttEngineId?: string;
  ttsEngineId?: string;
  now: string;
  toolsReady: boolean;
}): VoiceSession {
  return {
    id: params.id,
    state: params.toolsReady ? "idle" : "missing-tools",
    sttEngineId: params.sttEngineId ?? "whisper-large-v3-turbo",
    ttsEngineId: params.ttsEngineId ?? "piper-local",
    vadEnabled: true,
    transcript: [],
    updatedAt: params.now,
    message: params.toolsReady
      ? "Voice loop is ready for local STT/TTS."
      : "Voice loop is wired but local STT/TTS tools are missing.",
  };
}

export function appendTranscriptChunk(session: VoiceSession, chunk: TranscriptChunk, updatedAt: string): VoiceSession {
  return {
    ...session,
    state: chunk.final ? "idle" : "transcribing",
    transcript: [...session.transcript, chunk],
    updatedAt,
    message: chunk.final ? "Transcription finished." : "Transcribing local audio.",
  };
}
