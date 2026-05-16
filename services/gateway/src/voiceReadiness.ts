import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import type { VoiceAsset, VoiceRuntimeProbe, VoiceRuntimeReadiness } from "@jarvis/core";
import { inspectReadyModelAsset } from "./modelManifest.js";

const PROJECT_PARENT = "C:\\Users\\user\\Downloads\\Secretary Jarvis";
const PROJECT_ROOT = `${PROJECT_PARENT}\\jarvis`;
const HF_SNAPSHOT_ROOT = `${PROJECT_PARENT}\\models\\huggingface\\snapshots`;
const DEFAULT_VOICE_ASSET_ROOT = `${PROJECT_ROOT}\\assets\\voice`;
const IMPORTED_VOICE_ROOT = `${PROJECT_PARENT}\\voice`;
const PIPER_ROOT = `${PROJECT_PARENT}\\tools\\piper`;
const VOSK_ROOT = `${PROJECT_PARENT}\\models\\vosk`;
const WAKE_ROOT = `${PROJECT_PARENT}\\models\\wake-word`;

export interface VoiceReadinessOptions {
  voiceAssets: VoiceAsset[];
  voiceAssetRoot?: string;
  importedVoiceRoot?: string;
  hfSnapshotRoot?: string;
  piperRoot?: string;
  voskRoot?: string;
  wakeRoot?: string;
  pathExists?: (path: string) => boolean;
  listFiles?: (path: string) => string[];
  runCommand?: (command: string, args: string[]) => { ok: boolean; output: string };
  pythonPackageAvailable?: (packageName: string) => boolean;
}

export function buildVoiceRuntimeReadiness(options: VoiceReadinessOptions): VoiceRuntimeReadiness {
  const pathExists = options.pathExists ?? existsSync;
  const listFiles = options.listFiles ?? safeListFiles;
  const runCommand = options.runCommand ?? commandOk;
  const pythonPackageAvailable = options.pythonPackageAvailable ?? pythonPackageProbe;
  const hfRoot = options.hfSnapshotRoot ?? HF_SNAPSHOT_ROOT;
  const voiceRoot = options.voiceAssetRoot ?? DEFAULT_VOICE_ASSET_ROOT;
  const importedVoiceRoot = options.importedVoiceRoot ?? IMPORTED_VOICE_ROOT;
  const piperRoot = options.piperRoot ?? PIPER_ROOT;
  const voskRoot = options.voskRoot ?? VOSK_ROOT;
  const wakeRoot = options.wakeRoot ?? WAKE_ROOT;

  const whisperPath = join(hfRoot, "openai__whisper-large-v3-turbo");
  const whisperManifest = inspectReadyModelAsset({
    id: "ready-whisper-large-v3-turbo",
    profileId: "hf-whisper-large-v3-turbo",
    label: "Whisper large-v3-turbo",
    modelRef: "openai/whisper-large-v3-turbo",
    localPath: whisperPath,
    primaryUse: "primary local speech-to-text",
    runtimeAdapters: ["huggingface-local"],
    hardwareFit: "laptop-ready",
  });
  const transformersReady = pythonPackageAvailable("transformers");
  const torchReady = pythonPackageAvailable("torch");
  const whisperAssetReady = whisperManifest.status === "complete";
  const whisperReady = whisperAssetReady && transformersReady && torchReady;
  const primaryStt: VoiceRuntimeProbe = {
    id: "stt-whisper-large-v3-turbo",
    label: "Whisper large-v3-turbo",
    kind: "stt",
    status: whisperReady ? "ready" : whisperAssetReady ? "ready-asset" : whisperManifest.exists ? "staged" : "missing",
    installed: whisperAssetReady,
    path: whisperPath,
    runtime: "python-transformers",
    notes: [
      whisperReady
        ? "Whisper snapshot and Python runtime packages are present."
        : whisperAssetReady
          ? "Whisper snapshot is present; install/verify transformers and torch before live STT."
          : "Expected Whisper snapshot is missing or incomplete.",
      `Transformers: ${transformersReady ? "ready" : "missing"}. Torch: ${torchReady ? "ready" : "missing"}.`,
    ],
  };

  const piperExe = firstExisting([join(piperRoot, "piper.exe"), join(piperRoot, "piper", "piper.exe")], pathExists);
  const piperOnPath = runCommand("piper", ["--help"]).ok;
  const piperVoiceFiles = listFiles(join(piperRoot, "voices")).filter((fileName) => fileName.toLowerCase().endsWith(".onnx"));
  const piperInstalled = Boolean(piperExe) || piperOnPath;
  const piperReady = piperInstalled && piperVoiceFiles.length > 0;
  const piperProbe: VoiceRuntimeProbe = {
    id: "tts-piper",
    label: "Piper local TTS",
    kind: "tts",
    status: piperReady ? "ready" : piperInstalled ? "staged" : "missing",
    installed: piperInstalled,
    path: piperExe ?? piperRoot,
    runtime: "piper",
    notes: [
      piperReady
        ? `${piperVoiceFiles.length} Piper voice model(s) detected.`
        : piperInstalled
          ? "Piper executable detected; add at least one ONNX voice and JSON config in tools/piper/voices."
          : "Piper executable is missing from PATH and the expected tools/piper folder.",
    ],
  };

  const sapi = runCommand("powershell", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    "Add-Type -AssemblyName System.Speech; $speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer; $speaker.Dispose(); 'ready'",
  ]);
  const sapiProbe: VoiceRuntimeProbe = {
    id: "tts-windows-sapi",
    label: "Windows SAPI",
    kind: "tts",
    status: sapi.ok ? "ready" : "unavailable",
    installed: sapi.ok,
    runtime: "windows-sapi",
    notes: [sapi.ok ? "Windows SAPI can initialize locally without speaking." : `Windows SAPI probe failed: ${sapi.output}`],
  };

  const voskModelFiles = listFiles(voskRoot);
  const voskPackage = pythonPackageAvailable("vosk");
  const voskProbe: VoiceRuntimeProbe = {
    id: "stt-vosk-streaming",
    label: "Vosk streaming fallback",
    kind: "stt",
    status: voskPackage && voskModelFiles.length > 0 ? "ready" : voskModelFiles.length > 0 ? "staged" : "missing",
    installed: voskModelFiles.length > 0,
    path: voskRoot,
    runtime: "python-vosk",
    notes: [
      voskPackage && voskModelFiles.length > 0
        ? "Vosk package and local model folder are present."
        : "Vosk is a staged fallback until both the Python package and local model folder are present.",
    ],
  };

  const vadPackage = pythonPackageAvailable("webrtcvad") || pythonPackageAvailable("silero_vad");
  const vadProbe: VoiceRuntimeProbe = {
    id: "vad-package-backed",
    label: "Package-backed VAD",
    kind: "vad",
    status: vadPackage ? "ready" : "staged",
    installed: vadPackage,
    runtime: "webrtcvad-or-silero",
    notes: [
      vadPackage
        ? "A package-backed VAD path is available."
        : "VAD is wired as a dependency-backed path; handwritten MFCC examples stay out of production.",
    ],
  };

  const porcupinePackage = pythonPackageAvailable("pvporcupine");
  const wakeFiles = listFiles(wakeRoot);
  const wakeProbe: VoiceRuntimeProbe = {
    id: "wake-word-jarvis",
    label: "Jarvis wake word",
    kind: "wake-word",
    status: porcupinePackage || wakeFiles.length > 0 ? "staged" : "missing",
    installed: porcupinePackage || wakeFiles.length > 0,
    path: wakeRoot,
    runtime: porcupinePackage ? "porcupine" : "vosk-wake-profile",
    notes: [
      porcupinePackage || wakeFiles.length > 0
        ? "Wake-word dependency is staged; microphone listening remains off until owner approval."
        : "Install Porcupine or place a local Vosk wake profile in models/wake-word.",
    ],
  };

  const identitySamples = options.voiceAssets.map((asset) => {
    const primaryPath = join(voiceRoot, basename(asset.localPath));
    const importedPath = join(importedVoiceRoot, asset.fileName);
    const detectedPath = pathExists(primaryPath) ? primaryPath : pathExists(importedPath) ? importedPath : undefined;
    const size = detectedPath ? safeSize(detectedPath) : undefined;
    return {
      id: `voice-sample-${asset.id}`,
      label: asset.label,
      kind: "identity-sample",
      status: detectedPath ? "ready" : "missing",
      installed: Boolean(detectedPath),
      path: detectedPath ?? primaryPath,
      runtime: "mp3-sample",
      notes: [
        detectedPath
          ? `Voice sample detected${size ? ` (${Math.round(size / 1024)} KB)` : ""}.`
          : "Voice sample is missing from both Jarvis assets and the imported voice folder.",
      ],
    } satisfies VoiceRuntimeProbe;
  });

  const missingRequired = [primaryStt, piperProbe, ...identitySamples].filter((probe) => probe.status === "missing").length;
  return {
    primaryStt,
    tts: [piperProbe, sapiProbe],
    fallbackStt: [voskProbe],
    vad: vadProbe,
    wakeWord: wakeProbe,
    identitySamples,
    summary: {
      sttReady: primaryStt.status === "ready" || primaryStt.status === "ready-asset",
      ttsReady: piperProbe.status === "ready" || sapiProbe.status === "ready" || identitySamples.some((sample) => sample.status === "ready"),
      sampleCount: identitySamples.filter((sample) => sample.status === "ready").length,
      missingRequired,
    },
    privacy: {
      micCaptureActive: false,
      speakingActive: false,
      note: "Readiness probes inspect files and runtime availability only; they do not open the microphone or play speech.",
    },
  };
}

function firstExisting(paths: string[], pathExists: (path: string) => boolean): string | undefined {
  return paths.find((candidate) => pathExists(candidate));
}

function safeListFiles(folderPath: string): string[] {
  try {
    if (!existsSync(folderPath)) {
      return [];
    }
    return readdirSync(folderPath, { withFileTypes: true }).flatMap((entry) => {
      const child = join(folderPath, entry.name);
      return entry.isDirectory() ? safeListFiles(child) : entry.isFile() ? [child] : [];
    });
  } catch {
    return [];
  }
}

function safeSize(filePath: string): number | undefined {
  try {
    return statSync(filePath).size;
  } catch {
    return undefined;
  }
}

function commandOk(command: string, args: string[]): { ok: boolean; output: string } {
  try {
    const output = execFileSync(command, args, { encoding: "utf8", timeout: 5000, windowsHide: true });
    return { ok: true, output: output.trim() };
  } catch (error) {
    return { ok: false, output: error instanceof Error ? error.message : String(error) };
  }
}

function pythonPackageProbe(packageName: string): boolean {
  const probe = commandOk("python", [
    "-c",
    `import importlib.util; raise SystemExit(0 if importlib.util.find_spec(${JSON.stringify(packageName)}) else 1)`,
  ]);
  return probe.ok;
}
