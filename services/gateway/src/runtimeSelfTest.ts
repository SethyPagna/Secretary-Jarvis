import type { RuntimeServicesStatus } from "@jarvis/core";
import type { AgentManagerReadiness } from "./agentManagerReadiness.js";
import type { InteractionHealth } from "./interactionHealth.js";
import type { PackagingReadiness } from "./packagingReadiness.js";
import type { ProcessVisibilityStatus } from "./processVisibility.js";
import type { StartupRegistrationPlansManifest } from "./startupRegistrationPlans.js";
import type { WakeRuntimeActivationReadiness } from "./wakeRuntimeActivation.js";

export type RuntimeSelfTestStatus = "ready" | "attention" | "blocked" | "staged";

export interface RuntimeSelfTestFix {
  id: string;
  label: string;
  category: "models" | "voice" | "startup" | "agents" | "interaction" | "packaging";
  status: "dry-run" | "manual" | "approval-required";
  detail: string;
  dryRunEndpoint?: string;
  dryRunPayload?: Record<string, unknown>;
}

export interface RuntimeSelfTestCheck {
  id: string;
  label: string;
  status: RuntimeSelfTestStatus;
  value: string;
  detail: string;
  fixIds: string[];
}

export interface RuntimeSelfTest {
  generatedAt: string;
  localOnly: true;
  summary: {
    ready: number;
    attention: number;
    blocked: number;
    staged: number;
    connected: boolean;
    topStatus: RuntimeSelfTestStatus;
  };
  checks: RuntimeSelfTestCheck[];
  fixes: RuntimeSelfTestFix[];
  recommendations: string[];
}

export function buildRuntimeSelfTest(params: {
  generatedAt: string;
  activation: WakeRuntimeActivationReadiness;
  manager: AgentManagerReadiness;
  interaction: InteractionHealth;
  packaging: PackagingReadiness;
  processVisibility: ProcessVisibilityStatus;
  startupPlans: StartupRegistrationPlansManifest;
  services: RuntimeServicesStatus;
}): RuntimeSelfTest {
  const fixes = buildFixes(params);
  const fixIds = new Set(fixes.map((fix) => fix.id));
  const checks = buildChecks(params, fixIds);
  const summary = {
    ready: checks.filter((check) => check.status === "ready").length,
    attention: checks.filter((check) => check.status === "attention").length,
    blocked: checks.filter((check) => check.status === "blocked").length,
    staged: checks.filter((check) => check.status === "staged").length,
  };

  return {
    generatedAt: params.generatedAt,
    localOnly: true,
    summary: {
      ...summary,
      connected: summary.blocked === 0 && summary.ready >= 4,
      topStatus: topStatus(summary),
    },
    checks,
    fixes,
    recommendations: recommendationsFor(checks, fixes),
  };
}

function buildChecks(
  params: Parameters<typeof buildRuntimeSelfTest>[0],
  fixIds: Set<string>,
): RuntimeSelfTestCheck[] {
  const activation = params.activation;
  const manager = params.manager;
  const interaction = params.interaction;
  const packaging = params.packaging;
  const processVisibility = params.processVisibility;
  const services = params.services;
  const startupConfigured = params.startupPlans.plans.some((plan) => plan.status === "ready");
  const modelFixIds = ["fix-ollama-path", "fix-ollama-launch"].filter((id) => fixIds.has(id));
  const voiceFixIds = ["fix-hotword-enable"].filter((id) => fixIds.has(id));
  const startupFixIds = ["fix-start-runtime", "fix-register-startup"].filter((id) => fixIds.has(id));

  return [
    {
      id: "model-adapters",
      label: "Models",
      status: activation.summary.localModelAdaptersReady > 0 ? (modelFixIds.length ? "attention" : "ready") : "blocked",
      value: `${activation.summary.localModelAdaptersReady} adapter`,
      detail: activation.ollama.note,
      fixIds: modelFixIds,
    },
    {
      id: "wake-voice",
      label: "Voice",
      status: activation.voice.primaryStt === "ready" && activation.voice.ttsReady ? (voiceFixIds.length ? "attention" : "ready") : "staged",
      value: `${activation.wake.summary.ready}/${activation.wake.summary.staged} wake`,
      detail: activation.voice.note,
      fixIds: voiceFixIds,
    },
    {
      id: "agent-manager",
      label: "Agents",
      status: manager.summary.managerConnected && manager.summary.voicesCovered ? "ready" : "attention",
      value: `${manager.summary.agentsReady} agents`,
      detail: manager.manager.detail,
      fixIds: [],
    },
    {
      id: "workflow-interaction",
      label: "Workflow",
      status: interaction.summary.responsive && interaction.summary.workflowAutonomyApprovalGated ? "ready" : "attention",
      value: `${interaction.metrics.runningTasks}/${interaction.metrics.queuedItems} queue`,
      detail: interaction.summary.responsive
        ? "Queue, steering, approvals, and undo are responsive."
        : "Approval backlog can make Jarvis appear paused.",
      fixIds: [],
    },
    {
      id: "background-services",
      label: "Services",
      status: serviceStatus(services),
      value: `${essentialOnlineCount(services)}/${essentialServices(services).length} core`,
      detail: serviceDetail(services),
      fixIds: startupFixIds,
    },
    {
      id: "startup-background",
      label: "Startup",
      status: startupConfigured || processVisibility.summary.alive > 0 ? "ready" : "attention",
      value: `${processVisibility.summary.visibleInTaskManager} visible`,
      detail: startupConfigured
        ? "Windows startup registration is staged or registered through approved scripts."
        : "Startup registration is not active; use check-only first, then approve registration.",
      fixIds: startupFixIds,
    },
    {
      id: "packaging",
      label: "Package",
      status: packaging.summary.electronShellReady && packaging.summary.productionCommandsReady ? "ready" : "staged",
      value: packaging.summary.electronShellReady ? "HUD ready" : "HUD staged",
      detail: packaging.electron.note,
      fixIds: [],
    },
  ];
}

function buildFixes(params: Parameters<typeof buildRuntimeSelfTest>[0]): RuntimeSelfTestFix[] {
  const fixes: RuntimeSelfTestFix[] = [];
  const activation = params.activation;
  const startupConfigured = params.startupPlans.plans.some((plan) => plan.status === "ready");

  if (activation.ollama.status === "found-off-path") {
    fixes.push({
      id: "fix-ollama-path",
      label: "Ollama PATH",
      category: "models",
      status: "dry-run",
      detail: "Preview adding the detected Ollama folder to User PATH so startup scripts can use it.",
      dryRunEndpoint: "/api/runtime/adapter-repair/dry-run",
      dryRunPayload: { repair: "ollama-path" },
    });
  }

  if (activation.ollama.status === "installer-available" || activation.ollama.status === "missing") {
    fixes.push({
      id: "fix-ollama-launch",
      label: activation.ollama.status === "installer-available" ? "Run Ollama installer" : "Configure model adapter",
      category: "models",
      status: "manual",
      detail: activation.ollama.note,
      dryRunEndpoint: "/api/runtime/adapter-repair/dry-run",
      dryRunPayload: { repair: "ollama-launch" },
    });
  }

  if (activation.voice.wakeWord === "missing") {
    fixes.push({
      id: "fix-hotword-enable",
      label: "Wake word",
      category: "voice",
      status: "approval-required",
      detail: "Install/validate Porcupine or Vosk wake assets, then approval-gate continuous microphone wake.",
      dryRunEndpoint: "/api/runtime/adapter-repair/dry-run",
      dryRunPayload: { repair: "hotword-enable" },
    });
  }

  const essential = essentialServices(params.services);
  if (essential.some((service) => service.status !== "online")) {
    fixes.push({
      id: "fix-start-runtime",
      label: "Start runtime",
      category: "startup",
      status: "dry-run",
      detail: "Preview starting Jarvis services without changing Windows startup registration.",
      dryRunEndpoint: "/api/runtime/control/dry-run",
      dryRunPayload: { control: "start", target: "all" },
    });
  }

  if (!startupConfigured) {
    fixes.push({
      id: "fix-register-startup",
      label: "Startup sync",
      category: "startup",
      status: "approval-required",
      detail: "Use the startup registration plan after check-only confirms scripts and paths.",
      dryRunEndpoint: "/api/runtime/startup-registration-plans",
    });
  }

  return fixes;
}

function serviceStatus(services: RuntimeServicesStatus): RuntimeSelfTestStatus {
  const essential = essentialServices(services);
  if (essential.length === 0) {
    return "staged";
  }
  if (essential.every((service) => service.status === "online")) {
    return "ready";
  }
  if (essential.some((service) => service.status === "online" || service.status === "degraded")) {
    return "attention";
  }
  return "blocked";
}

function essentialServices(services: RuntimeServicesStatus): RuntimeServicesStatus["services"] {
  const electronHudOnline = services.services.some((service) => service.id === "electron-hud" && service.status === "online");
  return services.services.filter((service) => {
    if (service.id === "dashboard") {
      return false;
    }
    if (service.id === "hud-renderer" && electronHudOnline) {
      return false;
    }
    return true;
  });
}

function essentialOnlineCount(services: RuntimeServicesStatus): number {
  return essentialServices(services).filter((service) => service.status === "online").length;
}

function serviceDetail(services: RuntimeServicesStatus): string {
  const ignored = services.services
    .filter((service) => service.id === "dashboard" || service.id === "hud-renderer")
    .map((service) => service.label);
  if (ignored.length > 0 && services.services.some((service) => service.id === "electron-hud" && service.status === "online")) {
    return `${services.note} Optional dev surfaces ignored in Electron app mode: ${ignored.join(", ")}.`;
  }
  return services.note;
}

function topStatus(summary: { blocked: number; attention: number; staged: number }): RuntimeSelfTestStatus {
  if (summary.blocked > 0) {
    return "blocked";
  }
  if (summary.attention > 0) {
    return "attention";
  }
  if (summary.staged > 0) {
    return "staged";
  }
  return "ready";
}

function recommendationsFor(checks: RuntimeSelfTestCheck[], fixes: RuntimeSelfTestFix[]): string[] {
  const recommendations: string[] = [];
  const blocked = checks.filter((check) => check.status === "blocked");
  const attention = checks.filter((check) => check.status === "attention");

  if (blocked.length > 0) {
    recommendations.push(`Resolve ${blocked[0].label} first; it is blocking end-to-end runtime readiness.`);
  }
  if (attention.length > 0) {
    recommendations.push(`Review ${attention.length} attention item(s) from the compact fix strip.`);
  }
  if (fixes.length > 0) {
    recommendations.push("All fixes are dry-run or approval-gated; no runtime mutation happens from self-test alone.");
  }
  recommendations.push("Keep the centered orb as the default surface; use Settings only for compact readiness checks.");
  return recommendations;
}
