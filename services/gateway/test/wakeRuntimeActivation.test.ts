import { describe, expect, it } from "vitest";
import type { JarvisStatus, VoiceRuntimeReadiness } from "@jarvis/core";
import { buildWakeRuntimeActivationReadiness } from "../src/wakeRuntimeActivation.js";

describe("wake/runtime activation readiness", () => {
  it("separates reliable tray/orb wake from staged hotword wake and off-PATH Ollama repair", () => {
    const activation = buildWakeRuntimeActivationReadiness({
      root: "C:/jarvis",
      generatedAt: "2026-05-16T00:00:00.000Z",
      voiceReadiness: voiceReadiness({ wakeWordStatus: "missing", sttReady: true }),
      ollamaEndpoint: "http://127.0.0.1:11434",
      toolStatuses: [
        {
          id: "ollama",
          label: "Ollama",
          command: "ollama",
          installed: true,
          path: "C:\\Users\\user\\AppData\\Local\\Programs\\Ollama\\ollama.exe",
          notes: "found",
        },
      ] as NonNullable<JarvisStatus["toolStatuses"]>,
    });

    expect(activation.wake.summary.ready).toBe(3);
    expect(activation.wake.summary.approvalGated).toBe(1);
    expect(activation.ollama.status).toBe("found-off-path");
    expect(activation.ollama.repairCommands.join(" ")).toContain("Ollama");
    expect(activation.summary.ollamaUsable).toBe(true);
    expect(activation.recommendations.join(" ")).toContain("Porcupine");
  });

  it("reports installer-available when Ollama is missing but local setup exists", () => {
    const activation = buildWakeRuntimeActivationReadiness({
      root: "C:/jarvis",
      generatedAt: "2026-05-16T00:00:00.000Z",
      voiceReadiness: voiceReadiness({ wakeWordStatus: "staged", sttReady: false }),
      toolStatuses: [
        {
          id: "ollama",
          label: "Ollama",
          command: "ollama",
          installed: false,
          localInstallerPath: "C:\\Users\\user\\Downloads\\Secretary Jarvis\\OllamaSetup.exe",
          notes: "installer",
        },
      ] as NonNullable<JarvisStatus["toolStatuses"]>,
    });

    expect(activation.ollama.status).toBe("installer-available");
    expect(activation.summary.reliableWakeMethods).toBe(2);
    expect(activation.safeActions.some((action) => action.id === "enable-hotword" && action.approvalRequired)).toBe(true);
  });
});

function voiceReadiness(params: { wakeWordStatus: "ready" | "staged" | "missing"; sttReady: boolean }): VoiceRuntimeReadiness {
  return {
    primaryStt: {
      id: "stt",
      label: "Whisper",
      kind: "stt",
      status: params.sttReady ? "ready" : "ready-asset",
      installed: true,
      notes: [],
    },
    tts: [],
    fallbackStt: [],
    vad: {
      id: "vad",
      label: "VAD",
      kind: "vad",
      status: "staged",
      installed: false,
      notes: [],
    },
    wakeWord: {
      id: "wake",
      label: "Wake",
      kind: "wake-word",
      status: params.wakeWordStatus,
      installed: params.wakeWordStatus !== "missing",
      notes: [],
    },
    identitySamples: [],
    summary: {
      sttReady: params.sttReady,
      ttsReady: true,
      sampleCount: 4,
      missingRequired: 0,
    },
    privacy: {
      micCaptureActive: false,
      speakingActive: false,
      note: "test",
    },
  };
}
