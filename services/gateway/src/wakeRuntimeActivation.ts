import type { JarvisStatus, VoiceRuntimeReadiness } from "@jarvis/core";
import { detectToolStatuses } from "./doctor.js";

type ToolStatus = NonNullable<JarvisStatus["toolStatuses"]>[number];

export type ActivationStatus = "ready" | "staged" | "repair-needed" | "missing";

export interface WakeRuntimeActivationReadiness {
  generatedAt: string;
  root: string;
  localOnly: true;
  wake: {
    methods: WakeMethodStatus[];
    summary: {
      ready: number;
      staged: number;
      approvalGated: number;
    };
    privacyNote: string;
  };
  voice: {
    primaryStt: ActivationStatus;
    vad: ActivationStatus;
    wakeWord: ActivationStatus;
    ttsReady: boolean;
    sampleCount: number;
    note: string;
  };
  ollama: {
    status: ActivationStatus | "found-off-path" | "installer-available";
    command: string;
    detectedPath?: string;
    localInstallerPath?: string;
    endpoint: string;
    repairCommands: string[];
    note: string;
  };
  adapters: Array<{
    id: string;
    label: string;
    status: ActivationStatus;
    endpoint?: string;
    detail: string;
  }>;
  safeActions: Array<{
    id: string;
    label: string;
    approvalRequired: boolean;
    commandPreview: string;
    detail: string;
  }>;
  summary: {
    reliableWakeMethods: number;
    stagedWakeMethods: number;
    ollamaUsable: boolean;
    localModelAdaptersReady: number;
  };
  recommendations: string[];
}

interface WakeMethodStatus {
  id: string;
  label: string;
  status: "ready" | "staged";
  approvalRequired: boolean;
  detail: string;
}

export function buildWakeRuntimeActivationReadiness(params: {
  root: string;
  generatedAt: string;
  voiceReadiness: VoiceRuntimeReadiness;
  ollamaEndpoint?: string;
  toolStatuses?: ToolStatus[];
}): WakeRuntimeActivationReadiness {
  const tools = params.toolStatuses ?? detectToolStatuses();
  const ollamaTool = tools.find((tool) => tool.id === "ollama");
  const ollama = ollamaActivation(ollamaTool, params.ollamaEndpoint ?? "http://127.0.0.1:11434");
  const wakeMethods = wakeMethodStatuses(params.voiceReadiness);
  const adapters = adapterStatuses(ollama);

  return {
    generatedAt: params.generatedAt,
    root: params.root,
    localOnly: true,
    wake: {
      methods: wakeMethods,
      summary: {
        ready: wakeMethods.filter((method) => method.status === "ready").length,
        staged: wakeMethods.filter((method) => method.status === "staged").length,
        approvalGated: wakeMethods.filter((method) => method.approvalRequired).length,
      },
      privacyNote: "Continuous microphone wake remains disabled until the owner explicitly enables a wake-word engine.",
    },
    voice: {
      primaryStt: voiceStatus(params.voiceReadiness.primaryStt.status),
      vad: voiceStatus(params.voiceReadiness.vad.status),
      wakeWord: voiceStatus(params.voiceReadiness.wakeWord.status),
      ttsReady: params.voiceReadiness.summary.ttsReady,
      sampleCount: params.voiceReadiness.summary.sampleCount,
      note: "Manual voice panel and transcript bridge are reliable now; hotword wake is separate from STT readiness.",
    },
    ollama,
    adapters,
    safeActions: [
      {
        id: "start-runtime",
        label: "Start Jarvis runtime",
        approvalRequired: true,
        commandPreview: "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\start-jarvis.ps1",
        detail: "Starts Brain, Gateway, HUD renderer, Electron HUD, and optional Ollama without changing startup registration.",
      },
      {
        id: "repair-ollama-path",
        label: "Repair Ollama PATH",
        approvalRequired: true,
        commandPreview: ollama.detectedPath
          ? `[Environment]::SetEnvironmentVariable('Path', $env:Path + ';${ollamaPathFolder(ollama.detectedPath)}', 'User')`
          : "Run Ollama installer or add the Ollama install folder to User PATH.",
        detail: "Shown as a repair preview only. Jarvis must not mutate PATH without approval.",
      },
      {
        id: "enable-hotword",
        label: "Enable Jarvis hotword",
        approvalRequired: true,
        commandPreview: "Enable wake-word profile after Porcupine or Vosk wake assets validate.",
        detail: "Continuous mic listening is approval-gated and can be stopped by emergency stop.",
      },
    ],
    summary: {
      reliableWakeMethods: wakeMethods.filter((method) => method.status === "ready").length,
      stagedWakeMethods: wakeMethods.filter((method) => method.status === "staged").length,
      ollamaUsable: ollama.status === "ready" || ollama.status === "found-off-path",
      localModelAdaptersReady: adapters.filter((adapter) => adapter.status === "ready").length,
    },
    recommendations: recommendationsFor(ollama, params.voiceReadiness),
  };
}

function wakeMethodStatuses(voice: VoiceRuntimeReadiness): WakeMethodStatus[] {
  return [
    {
      id: "tray-open-hud",
      label: "Tray opens HUD",
      status: "ready",
      approvalRequired: false,
      detail: "Use the Windows tray icon to bring Jarvis forward while services run in the background.",
    },
    {
      id: "orb-click",
      label: "Orb click/tap",
      status: "ready",
      approvalRequired: false,
      detail: "Click the centered orb for radial controls and text or voice input.",
    },
    {
      id: "manual-voice-panel",
      label: "Manual voice panel",
      status: voice.summary.sttReady ? "ready" : "staged",
      approvalRequired: false,
      detail: voice.summary.sttReady ? "Voice panel can accept manual listening sessions." : "STT assets or runtime packages still need validation.",
    },
    {
      id: "hotword-jarvis",
      label: "Say Jarvis",
      status: "staged",
      approvalRequired: true,
      detail:
        voice.wakeWord.status === "missing"
          ? "Install Porcupine or a Vosk wake profile before continuous wake is available."
          : "Wake-word assets are staged; owner approval is still required before continuous mic capture.",
    },
  ];
}

function ollamaActivation(tool: ToolStatus | undefined, endpoint: string): WakeRuntimeActivationReadiness["ollama"] {
  if (tool?.installed && tool.path === "ollama") {
    return {
      status: "ready",
      command: tool.command,
      detectedPath: tool.path,
      localInstallerPath: tool.localInstallerPath,
      endpoint,
      repairCommands: ["ollama list", "ollama run qwen3:8b"],
      note: "Ollama is on PATH and can be used by the local model router.",
    };
  }

  if (tool?.installed && tool.path) {
    return {
      status: "found-off-path",
      command: tool.command,
      detectedPath: tool.path,
      localInstallerPath: tool.localInstallerPath,
      endpoint,
      repairCommands: [`& "${tool.path}" list`, `Add ${ollamaPathFolder(tool.path)} to the user PATH after approval.`],
      note: "Ollama was found in a common install location but is not on PATH for startup scripts.",
    };
  }

  if (tool?.localInstallerPath) {
    return {
      status: "installer-available",
      command: tool.command,
      localInstallerPath: tool.localInstallerPath,
      endpoint,
      repairCommands: [`Start-Process "${tool.localInstallerPath}"`],
      note: "Ollama is not detected, but a local installer exists. Install manually or through an approved setup action.",
    };
  }

  return {
    status: "missing",
    command: tool?.command ?? "ollama",
    endpoint,
    repairCommands: ["Install Ollama for Windows, then run scripts\\start-jarvis.ps1 -CheckOnly."],
    note: "Ollama is not detected. Jarvis can still use other local adapters when configured.",
  };
}

function adapterStatuses(ollama: WakeRuntimeActivationReadiness["ollama"]): WakeRuntimeActivationReadiness["adapters"] {
  return [
    {
      id: "ollama",
      label: "Ollama",
      status: ollama.status === "ready" || ollama.status === "found-off-path" ? "ready" : ollama.status === "installer-available" ? "repair-needed" : "missing",
      endpoint: ollama.endpoint,
      detail: ollama.note,
    },
    {
      id: "lm-studio",
      label: "LM Studio",
      status: "staged",
      endpoint: "http://127.0.0.1:1234/v1",
      detail: "OpenAI-compatible local endpoint can be enabled when LM Studio is running.",
    },
    {
      id: "llama-cpp",
      label: "llama.cpp/GGUF",
      status: "staged",
      detail: "Ready model registry supports GGUF, but a local server or executable path must be configured.",
    },
    {
      id: "vllm-sglang",
      label: "vLLM/SGLang LAN",
      status: "staged",
      detail: "Homelab endpoints remain optional future scaling adapters.",
    },
  ];
}

function voiceStatus(status: string): ActivationStatus {
  if (status === "ready" || status === "ready-asset") {
    return "ready";
  }
  if (status === "missing" || status === "unavailable") {
    return "missing";
  }
  return "staged";
}

function recommendationsFor(ollama: WakeRuntimeActivationReadiness["ollama"], voice: VoiceRuntimeReadiness): string[] {
  const recommendations = [
    "Use tray/orb wake for reliable background access today.",
    "Enable continuous hotword wake only after wake-word assets validate and owner approval is recorded.",
  ];
  if (ollama.status === "found-off-path") {
    recommendations.push("Add the detected Ollama folder to User PATH or call Ollama by full path in startup scripts.");
  } else if (ollama.status === "installer-available") {
    recommendations.push("Run the local Ollama installer, then rerun startup check-only.");
  } else if (ollama.status === "missing") {
    recommendations.push("Install or configure a local model adapter before relying on Ollama routing.");
  }
  if (voice.wakeWord.status === "missing") {
    recommendations.push("Download/configure Porcupine or a local Vosk wake profile for say-Jarvis wake.");
  }
  return recommendations;
}

function ollamaPathFolder(path: string): string {
  const normalized = path.replaceAll("/", "\\");
  const lastSlash = normalized.lastIndexOf("\\");
  return lastSlash > 0 ? normalized.slice(0, lastSlash) : normalized;
}
