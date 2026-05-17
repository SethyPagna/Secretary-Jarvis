import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { VoiceAsset } from "@jarvis/core";
import { buildVoiceRuntimeReadiness } from "../src/voiceReadiness.js";

describe("voice runtime readiness", () => {
  let tempRoot: string;
  let voiceAssets: VoiceAsset[];

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), "jarvis-voice-readiness-"));
    voiceAssets = [
      {
        id: "voice-jarvis-main",
        label: "Jarvis identity voice",
        fileName: "jarvis.mp3",
        localPath: "assets/voice/jarvis.mp3",
        role: "identity",
        notes: "test",
      },
    ];
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("reports ready Whisper, Piper, SAPI, Vosk, VAD, and samples without opening capture", () => {
    const hfRoot = join(tempRoot, "hf");
    const whisperPath = join(hfRoot, "openai__whisper-large-v3-turbo");
    const voiceRoot = join(tempRoot, "voice-assets");
    const piperRoot = join(tempRoot, "piper");
    const kokoroRoot = join(hfRoot, "hexgrad__Kokoro-82M");
    const omniVoiceRoot = join(hfRoot, "k2-fsa__OmniVoice");
    const voskRoot = join(tempRoot, "vosk");
    const wakeRoot = join(tempRoot, "wake");
    mkdirSync(whisperPath, { recursive: true });
    mkdirSync(kokoroRoot, { recursive: true });
    mkdirSync(omniVoiceRoot, { recursive: true });
    mkdirSync(voiceRoot, { recursive: true });
    mkdirSync(join(piperRoot, "voices"), { recursive: true });
    mkdirSync(voskRoot, { recursive: true });
    writeFileSync(join(whisperPath, "config.json"), "{}");
    writeFileSync(join(whisperPath, "tokenizer.json"), "{}");
    writeFileSync(join(whisperPath, "model.safetensors"), "tiny");
    writeFileSync(join(kokoroRoot, "config.json"), "{}");
    writeFileSync(join(kokoroRoot, "model.safetensors"), "tiny");
    writeFileSync(join(kokoroRoot, "tokenizer.json"), "{}");
    writeFileSync(join(omniVoiceRoot, "config.json"), "{}");
    writeFileSync(join(voiceRoot, "jarvis.mp3"), "sample");
    writeFileSync(join(piperRoot, "piper.exe"), "exe");
    writeFileSync(join(piperRoot, "voices", "voice.onnx"), "voice");
    writeFileSync(join(voskRoot, "model.conf"), "vosk");

    const readiness = buildVoiceRuntimeReadiness({
      voiceAssets,
      voiceAssetRoot: voiceRoot,
      hfSnapshotRoot: hfRoot,
      piperRoot,
      kokoroRoot,
      omniVoiceRoot,
      voskRoot,
      wakeRoot,
      runCommand: (command) => ({ ok: command === "powershell", output: "ready" }),
      pythonPackageAvailable: (name) => ["transformers", "torch", "vosk", "webrtcvad"].includes(name),
    });

    expect(readiness.primaryStt.status).toBe("ready");
    expect(readiness.tts.find((probe) => probe.id === "tts-kokoro-82m")?.status).toBe("ready");
    expect(readiness.tts.find((probe) => probe.id === "tts-piper")?.status).toBe("ready");
    expect(readiness.tts.find((probe) => probe.id === "tts-windows-sapi")?.status).toBe("ready");
    expect(readiness.tts.find((probe) => probe.id === "tts-omnivoice")?.status).toBe("staged");
    expect(readiness.ttsPreferredEngine).toBe("tts-kokoro-82m");
    expect(readiness.fallbackStt[0]?.status).toBe("ready");
    expect(readiness.vad.status).toBe("ready");
    expect(readiness.wakeState).toBe("push-to-talk");
    expect(readiness.identitySamples[0]?.status).toBe("ready");
    expect(readiness.summary).toMatchObject({ sttReady: true, ttsReady: true, sampleCount: 1, missingRequired: 0 });
    expect(readiness.privacy.micCaptureActive).toBe(false);
  });

  it("separates ready Whisper assets from missing runtime packages and missing TTS dependencies", () => {
    const hfRoot = join(tempRoot, "hf");
    const whisperPath = join(hfRoot, "openai__whisper-large-v3-turbo");
    mkdirSync(whisperPath, { recursive: true });
    writeFileSync(join(whisperPath, "config.json"), "{}");
    writeFileSync(join(whisperPath, "tokenizer.json"), "{}");
    writeFileSync(join(whisperPath, "model.safetensors"), "tiny");

    const readiness = buildVoiceRuntimeReadiness({
      voiceAssets,
      hfSnapshotRoot: hfRoot,
      voiceAssetRoot: join(tempRoot, "missing-voice-assets"),
      importedVoiceRoot: join(tempRoot, "missing-imported-voice"),
      piperRoot: join(tempRoot, "missing-piper"),
      kokoroRoot: join(tempRoot, "missing-kokoro"),
      omniVoiceRoot: join(tempRoot, "missing-omnivoice"),
      wakeRoot: join(tempRoot, "missing-wake"),
      runCommand: () => ({ ok: false, output: "missing" }),
      pythonPackageAvailable: () => false,
    });

    expect(readiness.primaryStt.status).toBe("ready-asset");
    expect(readiness.tts.find((probe) => probe.id === "tts-piper")?.status).toBe("missing");
    expect(readiness.tts.find((probe) => probe.id === "tts-kokoro-82m")?.status).toBe("missing");
    expect(readiness.tts.find((probe) => probe.id === "tts-omnivoice")?.status).toBe("missing");
    expect(readiness.tts.find((probe) => probe.id === "tts-windows-sapi")?.status).toBe("unavailable");
    expect(readiness.ttsPreferredEngine).toBe("none");
    expect(readiness.wakeState).toBe("push-to-talk");
    expect(readiness.summary.sttReady).toBe(true);
    expect(readiness.summary.ttsReady).toBe(false);
    expect(readiness.summary.missingRequired).toBe(2);
  });
});
