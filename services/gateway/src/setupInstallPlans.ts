import type { ActionCategory, ActionRequest, NeededFeatureDownload, PolicyDecision } from "@jarvis/core";
import type { FeaturePluginSlot, FeaturePluginSlotManifest } from "./featurePluginSlots.js";

export interface SetupInstallPlan {
  id: string;
  slotId: string;
  label: string;
  category: NeededFeatureDownload["category"];
  status: "ready" | "partial" | "missing" | "optional";
  purpose: string;
  expectedPath: string;
  installHint: string;
  plugsInto: string[];
  actionCategory: ActionCategory;
  approvalRequired: boolean;
  commandPreview: string;
  manualSteps: string[];
  validationChecks: string[];
  rollbackNote: string;
  uninstallPreview: string;
  blockers: string[];
  localOnly: true;
  detailsHiddenByDefault: true;
}

export interface SetupInstallPlanManifest {
  generatedAt: string;
  localOnly: true;
  plans: SetupInstallPlan[];
  summary: {
    ready: number;
    partial: number;
    missing: number;
    optional: number;
    approvalRequired: number;
  };
  note: string;
}

export interface SetupInstallDryRun {
  id: string;
  planId: string;
  slotId: string;
  label: string;
  action: ActionRequest;
  decision: PolicyDecision;
  commandPreview: string;
  manualSteps: string[];
  validationChecks: string[];
  rollbackNote: string;
  uninstallPreview: string;
  blockers: string[];
  safeMode: true;
  executed: false;
  notes: string[];
}

export function buildSetupInstallPlanManifest(params: {
  slotManifest: FeaturePluginSlotManifest;
  generatedAt: string;
}): SetupInstallPlanManifest {
  const plans = params.slotManifest.slots.map(planForSlot);
  return {
    generatedAt: params.generatedAt,
    localOnly: true,
    plans,
    summary: {
      ready: plans.filter((plan) => plan.status === "ready").length,
      partial: plans.filter((plan) => plan.status === "partial").length,
      missing: plans.filter((plan) => plan.status === "missing").length,
      optional: plans.filter((plan) => plan.status === "optional").length,
      approvalRequired: plans.filter((plan) => plan.approvalRequired).length,
    },
    note: "Install plans are previews only. Jarvis never downloads, installs, or writes credentials from this endpoint.",
  };
}

export function createSetupInstallDryRun(params: {
  id: string;
  plan: SetupInstallPlan;
  createdAt: string;
  evaluate: (action: ActionRequest) => PolicyDecision;
}): SetupInstallDryRun {
  const action: ActionRequest = {
    id: params.id,
    title: `Prepare feature setup: ${params.plan.label}`,
    category: params.plan.actionCategory,
    target: params.plan.expectedPath,
    reason: `Feature setup for ${params.plan.label} can add local tools, models, runtime config, or connector-scoped credentials.`,
    agentId: "sentinel",
    dataTouched: dataTouchedFor(params.plan),
  };
  const decision = params.evaluate(action);
  return {
    id: params.id,
    planId: params.plan.id,
    slotId: params.plan.slotId,
    label: params.plan.label,
    action,
    decision,
    commandPreview: params.plan.commandPreview,
    manualSteps: params.plan.manualSteps,
    validationChecks: params.plan.validationChecks,
    rollbackNote: params.plan.rollbackNote,
    uninstallPreview: params.plan.uninstallPreview,
    blockers: params.plan.blockers,
    safeMode: true,
    executed: false,
    notes: [
      "Dry-run only: no installer was launched, no model was downloaded, no files were changed, and no credentials were read.",
      params.plan.detailsHiddenByDefault
        ? "HUD should show this as a compact setup card with details collapsed by default."
        : "Details may be shown directly.",
      `Created at ${params.createdAt}.`,
    ],
  };
}

function planForSlot(slot: FeaturePluginSlot): SetupInstallPlan {
  const category = actionCategoryFor(slot);
  const profile = profileFor(slot);
  const blockers = slot.checks
    .filter((check) => check.required && !check.passed)
    .map((check) => check.label);

  return {
    id: `install-${slot.id}`,
    slotId: slot.id,
    label: slot.label,
    category: slot.category,
    status: slot.status,
    purpose: slot.purpose,
    expectedPath: slot.expectedPath,
    installHint: slot.installHint,
    plugsInto: slot.plugsInto,
    actionCategory: category,
    approvalRequired: slot.status !== "ready",
    commandPreview: profile.commandPreview,
    manualSteps: profile.manualSteps,
    validationChecks: slot.checks.map((check) => `${check.passed ? "ready" : "missing"}: ${check.label}`),
    rollbackNote: profile.rollbackNote,
    uninstallPreview: profile.uninstallPreview,
    blockers,
    localOnly: true,
    detailsHiddenByDefault: true,
  };
}

function actionCategoryFor(slot: FeaturePluginSlot): ActionCategory {
  if (slot.category === "connector") {
    return "credential-access";
  }
  if (slot.category === "maps" || slot.category === "media" || slot.category === "voice" || slot.category === "vision") {
    return "model-download";
  }
  return "write-local";
}

function dataTouchedFor(plan: SetupInstallPlan): string[] {
  if (plan.actionCategory === "credential-access") {
    return ["connector credential metadata", "local vault status", "approval audit log"];
  }
  if (plan.category === "voice") {
    return ["local voice tools", "speech model files", "setup audit log"];
  }
  if (plan.category === "vision") {
    return ["local vision tools", "vision model files", "setup audit log"];
  }
  if (plan.category === "media") {
    return ["local media model files", "media runtime config", "setup audit log"];
  }
  if (plan.category === "maps") {
    return ["offline map data", "local routing config", "setup audit log"];
  }
  return ["local dependency files", "setup audit log"];
}

function profileFor(slot: FeaturePluginSlot): {
  commandPreview: string;
  manualSteps: string[];
  rollbackNote: string;
  uninstallPreview: string;
} {
  const expected = quote(slot.expectedPath);
  if (slot.id === "feature-piper") {
    return {
      commandPreview: `manual extract: place piper.exe and voices/*.onnx/*.json under ${expected}`,
      manualSteps: [
        "Download Piper for Windows yourself from the official release page.",
        `Extract the executable into ${slot.expectedPath}.`,
        "Place at least one ONNX voice and matching JSON config under a voices folder.",
        "Run the Jarvis setup doctor to validate the executable and voice pair.",
      ],
      rollbackNote: "Remove the extracted Piper folder or move the voice files out of the Jarvis tools path.",
      uninstallPreview: `Remove-Item -LiteralPath ${expected} -Recurse`,
    };
  }
  if (slot.id === "feature-wake-word") {
    return {
      commandPreview: `manual configure: place Porcupine or Vosk wake profile files under ${expected}`,
      manualSteps: [
        "Choose Porcupine or a local Vosk wake profile.",
        "Keep API keys or wake-word profiles in the local vault/config path only.",
        `Place profile files under ${slot.expectedPath}.`,
        "Enable wake listening from Jarvis Settings after approval.",
      ],
      rollbackNote: "Disable wake listening and remove the local wake profile/config files.",
      uninstallPreview: `Remove-Item -LiteralPath ${expected} -Recurse`,
    };
  }
  if (slot.id === "feature-vosk") {
    return {
      commandPreview: `manual extract: place a Vosk model folder under ${expected}`,
      manualSteps: [
        "Download a Vosk small English or multilingual model yourself.",
        `Extract the model into ${slot.expectedPath}.`,
        "Keep it as fallback STT; Whisper remains primary.",
        "Run voice readiness to validate model.conf or acoustic model files.",
      ],
      rollbackNote: "Remove the Vosk model folder; Jarvis will fall back to Whisper-only STT.",
      uninstallPreview: `Remove-Item -LiteralPath ${expected} -Recurse`,
    };
  }
  if (slot.id === "feature-yolo") {
    return {
      commandPreview: `manual setup: install ultralytics and place YOLO *.pt/*.onnx weights under ${expected}`,
      manualSteps: [
        "Install the local YOLO runtime in the Python environment when you are ready.",
        `Place YOLO weights under ${slot.expectedPath}.`,
        "Use one-time image analysis first; continuous camera use remains approval-gated.",
        "Run vision readiness to validate object detection.",
      ],
      rollbackNote: "Remove YOLO weights and uninstall the Python package from the Jarvis venv if desired.",
      uninstallPreview: `Remove-Item -LiteralPath ${expected} -Recurse`,
    };
  }
  if (slot.id === "feature-ocr") {
    return {
      commandPreview: `manual install: install Tesseract/PaddleOCR and expose local OCR runtime under ${expected}`,
      manualSteps: [
        "Install a local OCR runtime such as Tesseract or PaddleOCR.",
        `Record runtime files or config under ${slot.expectedPath}.`,
        "Keep screen capture locked until a one-time approval is granted.",
        "Run vision readiness to validate OCR availability.",
      ],
      rollbackNote: "Disable OCR in Jarvis settings and remove local OCR config/runtime files from the tools path.",
      uninstallPreview: `Remove-Item -LiteralPath ${expected} -Recurse`,
    };
  }
  if (slot.category === "media") {
    return {
      commandPreview: `manual place: add local media model/runtime files under ${expected}`,
      manualSteps: [
        `Create or fill ${slot.expectedPath}.`,
        "Place local image, video, music, or audio model files there, or add a LAN runtime config.",
        "Run the media readiness probe before routing generation tasks.",
        "Keep hosted generation disabled unless explicitly enabled later.",
      ],
      rollbackNote: "Remove the media model files or LAN runtime config from the Jarvis media path.",
      uninstallPreview: `Remove-Item -LiteralPath ${expected} -Recurse`,
    };
  }
  if (slot.category === "maps") {
    return {
      commandPreview: `manual place: add offline tiles/geocoder data under ${expected}`,
      manualSteps: [
        "Download offline map tiles, geocoder data, or configure a local map service yourself.",
        `Place the data or config under ${slot.expectedPath}.`,
        "Run the map readiness probe before enabling route planning.",
      ],
      rollbackNote: "Remove offline map data or disable the local map service config.",
      uninstallPreview: `Remove-Item -LiteralPath ${expected} -Recurse`,
    };
  }
  if (slot.category === "connector") {
    return {
      commandPreview: "Jarvis Settings > Vault > Add connector-scoped credentials",
      manualSteps: [
        "Open the Jarvis credential vault from Settings.",
        "Add one connector credential at a time with scoped permissions.",
        "Keep live sends disabled until a connector dry-run and approval succeeds.",
      ],
      rollbackNote: "Revoke the connector credential and disable the connector from Jarvis Settings.",
      uninstallPreview: "Revoke credential in Jarvis vault and disable connector",
    };
  }
  return {
    commandPreview: `manual place: add local dependency files under ${expected}`,
    manualSteps: [`Place the dependency files under ${slot.expectedPath}.`, "Run the setup doctor to validate readiness."],
    rollbackNote: "Remove the dependency files from the Jarvis-managed path.",
    uninstallPreview: `Remove-Item -LiteralPath ${expected} -Recurse`,
  };
}

function quote(value: string): string {
  return `"${value}"`;
}
