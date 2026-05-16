import type { ActionRequest, PolicyDecision } from "@jarvis/core";
import type { WakeRuntimeActivationReadiness } from "./wakeRuntimeActivation.js";

export type RuntimeAdapterRepairKind = "ollama-path" | "ollama-launch" | "lmstudio-endpoint" | "hotword-enable";

export interface RuntimeAdapterRepairDryRun {
  id: string;
  repair: RuntimeAdapterRepairKind;
  label: string;
  commandPreview: string;
  reversible: boolean;
  action: ActionRequest;
  decision: PolicyDecision;
  dataTouched: string[];
  notes: string[];
  message: string;
}

type RepairSpec = {
  label: string;
  target: string;
  category: ActionRequest["category"];
  reversible: boolean;
  dataTouched: string[];
  commandPreview: (activation: WakeRuntimeActivationReadiness) => string;
  notes: (activation: WakeRuntimeActivationReadiness) => string[];
};

const REPAIR_SPECS: Record<RuntimeAdapterRepairKind, RepairSpec> = {
  "ollama-path": {
    label: "Repair Ollama PATH",
    target: "User PATH and Ollama command discovery",
    category: "run-script",
    reversible: true,
    dataTouched: ["User PATH environment variable", "Ollama executable discovery"],
    commandPreview: (activation) => activation.safeActions.find((action) => action.id === "repair-ollama-path")?.commandPreview ?? "Add Ollama folder to User PATH.",
    notes: (activation) => [
      activation.ollama.note,
      "Dry-run only. Jarvis will not mutate User PATH without explicit owner approval.",
    ],
  },
  "ollama-launch": {
    label: "Launch Ollama",
    target: "Ollama local runtime",
    category: "app-control",
    reversible: true,
    dataTouched: ["local Ollama process state", "local model runtime endpoint"],
    commandPreview: (activation) =>
      activation.ollama.detectedPath ? `Start-Process "${activation.ollama.detectedPath}"` : "Start Ollama from the Windows Start menu or installer.",
    notes: (activation) => [
      activation.ollama.status === "missing" ? "Ollama executable is not detected." : "Ollama can be launched locally after approval.",
      "Launching Ollama does not download models by itself.",
    ],
  },
  "lmstudio-endpoint": {
    label: "Check LM Studio endpoint",
    target: "LM Studio OpenAI-compatible local endpoint",
    category: "service-control",
    reversible: true,
    dataTouched: ["localhost runtime endpoint status"],
    commandPreview: () => "Invoke-WebRequest -UseBasicParsing http://127.0.0.1:1234/v1/models",
    notes: () => [
      "Dry-run only. This previews a local endpoint check and does not enable hosted inference.",
      "LM Studio remains optional and owner-controlled.",
    ],
  },
  "hotword-enable": {
    label: "Enable Jarvis hotword",
    target: "Wake-word microphone listener",
    category: "sensor-capture",
    reversible: true,
    dataTouched: ["microphone capture state", "wake-word profile", "local voice activity metadata"],
    commandPreview: () => "Enable wake-word profile after Porcupine or Vosk wake assets validate.",
    notes: (activation) => [
      activation.voice.wakeWord === "missing"
        ? "Wake-word assets are missing; approval cannot make hotword live until dependencies are installed."
        : "Wake-word assets are staged; continuous mic listening still requires owner approval.",
      activation.wake.privacyNote,
    ],
  },
};

export function createRuntimeAdapterRepairDryRun(params: {
  id: string;
  repair: RuntimeAdapterRepairKind;
  activation: WakeRuntimeActivationReadiness;
  createdAt: string;
  evaluate: (action: ActionRequest) => PolicyDecision;
}): RuntimeAdapterRepairDryRun {
  const spec = REPAIR_SPECS[params.repair];
  const action: ActionRequest = {
    id: params.id,
    title: spec.label,
    category: spec.category,
    target: spec.target,
    reason: "Runtime adapter repairs can alter local startup behavior, app state, endpoint checks, or sensor capture, so they are approval-gated.",
    agentId: "sentinel",
    dataTouched: spec.dataTouched,
  };
  const decision = params.evaluate(action);

  return {
    id: params.id,
    repair: params.repair,
    label: spec.label,
    commandPreview: spec.commandPreview(params.activation),
    reversible: spec.reversible,
    action,
    decision,
    dataTouched: spec.dataTouched,
    notes: [`Created ${params.createdAt}.`, ...spec.notes(params.activation)],
    message:
      decision.decision === "requires_approval"
        ? "Dry-run only. Owner approval is required before repairing this runtime adapter."
        : decision.decision === "deny"
          ? "Runtime adapter repair is blocked by policy."
          : "Runtime adapter repair is staged through a local approved control path.",
  };
}

export function isRuntimeAdapterRepairKind(input: string): input is RuntimeAdapterRepairKind {
  return input === "ollama-path" || input === "ollama-launch" || input === "lmstudio-endpoint" || input === "hotword-enable";
}
