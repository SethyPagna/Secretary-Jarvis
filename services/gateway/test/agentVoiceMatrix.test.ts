import { describe, expect, it } from "vitest";
import { defaultAgentSouls, seededStatus, type VoiceRuntimeReadiness } from "@jarvis/core";
import { buildAgentVoiceMatrix } from "../src/agentVoiceMatrix.js";

describe("agent voice matrix", () => {
  it("joins every soul to a distinct voice profile and TTS test request", () => {
    const matrix = buildAgentVoiceMatrix({
      generatedAt: "2026-05-16T00:00:00.000Z",
      agents: defaultAgentSouls,
      voiceProfiles: seededStatus.voiceProfiles ?? [],
      voiceAssets: seededStatus.voiceAssets,
      readiness: readyVoiceRuntime(),
    });

    expect(matrix.entries).toHaveLength(8);
    expect(matrix.summary.distinctProfiles).toBe(8);
    expect(matrix.summary.ttsReady).toBe(true);
    expect(matrix.entries.map((entry) => entry.agentId).sort()).toEqual(defaultAgentSouls.map((agent) => agent.id).sort());
    expect(matrix.entries.find((entry) => entry.agentId === "sentinel")).toMatchObject({
      enginePreference: "windows-sapi",
      status: "ready",
      ttsRequest: {
        agentId: "sentinel",
        voiceProfileId: "voice-profile-sentinel",
      },
    });
    expect(matrix.entries.every((entry) => entry.testPhrase.length > 12)).toBe(true);
  });
});

function readyVoiceRuntime(): VoiceRuntimeReadiness {
  return {
    primaryStt: { id: "stt-whisper", label: "Whisper", kind: "stt", status: "ready-asset", installed: true, notes: [] },
    tts: [{ id: "tts-sapi", label: "Windows SAPI", kind: "tts", status: "ready", installed: true, notes: [] }],
    fallbackStt: [],
    vad: { id: "vad", label: "VAD", kind: "vad", status: "staged", installed: false, notes: [] },
    wakeWord: { id: "wake", label: "Wake", kind: "wake-word", status: "staged", installed: false, notes: [] },
    identitySamples: [],
    summary: { sttReady: true, ttsReady: true, sampleCount: 4, missingRequired: 0 },
    privacy: { micCaptureActive: false, speakingActive: false, note: "test" },
  };
}
