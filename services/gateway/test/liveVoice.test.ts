import { describe, expect, it } from "vitest";
import { appendLiveTranscriptChunk, commitLiveTranscript, startLiveVoiceSession, stopLiveVoiceSession } from "../src/liveVoice.js";

describe("live voice session bridge", () => {
  const now = "2026-05-16T00:00:00.000Z";

  it("starts, collects transcript chunks, and commits concise text", () => {
    const started = startLiveVoiceSession({
      id: "voice-session-test",
      now,
      toolsReady: true,
    });

    expect(started.voiceSession.state).toBe("listening");
    expect(started.hudState).toBe("listening");

    const partial = appendLiveTranscriptChunk({
      existing: started.voiceSession,
      id: "voice-session-test",
      chunkId: "chunk-1",
      now: "2026-05-16T00:00:01.000Z",
      toolsReady: true,
      text: "Jarvis, summarize",
    });
    const final = appendLiveTranscriptChunk({
      existing: partial.voiceSession,
      id: "voice-session-test",
      chunkId: "chunk-2",
      now: "2026-05-16T00:00:02.000Z",
      toolsReady: true,
      text: "today's local runtime status.",
      final: true,
    });
    const committed = commitLiveTranscript({
      existing: final.voiceSession,
      id: "voice-session-test",
      now: "2026-05-16T00:00:03.000Z",
      toolsReady: true,
    });

    expect(final.voiceSession.transcript).toHaveLength(2);
    expect(committed.committable).toBe(true);
    expect(committed.text).toBe("Jarvis, summarize today's local runtime status.");
    expect(committed.hudState).toBe("thinking");
  });

  it("keeps the session guarded when STT tools are not ready", () => {
    const started = startLiveVoiceSession({
      id: "voice-session-missing",
      now,
      toolsReady: false,
    });
    const stopped = stopLiveVoiceSession({
      existing: started.voiceSession,
      id: "voice-session-missing",
      now: "2026-05-16T00:00:01.000Z",
      toolsReady: false,
      reason: "owner stopped staged voice session",
    });

    expect(started.voiceSession.state).toBe("missing-tools");
    expect(started.hudState).toBe("error");
    expect(stopped.voiceSession.state).toBe("missing-tools");
    expect(stopped.message).toContain("owner stopped");
  });
});
