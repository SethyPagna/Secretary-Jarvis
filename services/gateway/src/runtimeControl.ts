import type { ActionRequest, PolicyDecision, RuntimeControlDryRun, RuntimeControlKind, RuntimeServiceId } from "@jarvis/core";

const CONTROL_COMMANDS: Record<RuntimeControlKind, string> = {
  start: "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-jarvis.ps1",
  stop: "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/stop-jarvis.ps1 -KeepOllama",
  restart:
    "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/stop-jarvis.ps1 -KeepOllama; powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-jarvis.ps1",
  "emergency-stop": "POST /api/emergency-stop",
};

export function createRuntimeControlDryRun(params: {
  id: string;
  control: RuntimeControlKind;
  target?: "all" | RuntimeServiceId;
  evaluate: (action: ActionRequest) => PolicyDecision;
  createdAt: string;
}): RuntimeControlDryRun {
  const target = params.target ?? "all";
  const dataTouched = [
    "local runtime process state",
    "PID files",
    "runtime logs",
    params.control === "emergency-stop" ? "active task checkpoints" : "service command preview",
  ];
  const action: ActionRequest = {
    id: params.id,
    title: runtimeControlTitle(params.control, target),
    category: params.control === "emergency-stop" ? "service-control" : "run-script",
    target: target === "all" ? "Jarvis local runtime" : target,
    reason: "Runtime controls can change local service state, so Jarvis only stages them through approval-gated dry-runs.",
    agentId: "sentinel",
    dataTouched,
  };
  const decision = params.evaluate(action);

  return {
    id: params.id,
    control: params.control,
    target,
    commandPreview: CONTROL_COMMANDS[params.control],
    reversible: params.control !== "emergency-stop",
    action,
    decision,
    dataTouched,
    message:
      decision.decision === "requires_approval"
        ? "Dry-run only. Owner approval is required before changing runtime services."
        : decision.decision === "deny"
          ? "Runtime control is blocked by policy."
          : "Runtime control is staged and may be executed by an approved control path.",
  };
}

export function isRuntimeControlKind(input: string): input is RuntimeControlKind {
  return input === "start" || input === "stop" || input === "restart" || input === "emergency-stop";
}

function runtimeControlTitle(control: RuntimeControlKind, target: "all" | RuntimeServiceId): string {
  const targetLabel = target === "all" ? "Jarvis runtime" : target;
  if (control === "emergency-stop") {
    return `Emergency stop ${targetLabel}`;
  }
  return `${control[0]?.toUpperCase() ?? ""}${control.slice(1)} ${targetLabel}`;
}
