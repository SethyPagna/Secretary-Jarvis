import type { ActionCategory, ActionRequest, PolicyDecision, PrivacyMode } from "./types.js";

const ALWAYS_APPROVAL_REQUIRED: ReadonlySet<ActionCategory> = new Set([
  "delete-local",
  "send-message",
  "post-social",
  "purchase",
  "credential-access",
  "device-control",
  "model-download",
  "sensor-capture",
  "irreversible-edit",
]);

const STRICT_LOCAL_BLOCKED: ReadonlySet<ActionCategory> = new Set(["network"]);

export function evaluateActionPolicy(params: {
  action: ActionRequest;
  privacyMode: PrivacyMode;
  allowedConnectors: string[];
}): PolicyDecision {
  const reasons: string[] = [];

  if (params.privacyMode === "strict-local" && STRICT_LOCAL_BLOCKED.has(params.action.category)) {
    return {
      actionId: params.action.id,
      decision: "deny",
      risk: "blocked",
      reasons: ["Strict local-only mode blocks outbound network actions by default."],
    };
  }

  if (params.action.connectorId && !params.allowedConnectors.includes(params.action.connectorId)) {
    return {
      actionId: params.action.id,
      decision: "deny",
      risk: "blocked",
      reasons: [`Connector ${params.action.connectorId} is not enabled for this Jarvis instance.`],
    };
  }

  if (ALWAYS_APPROVAL_REQUIRED.has(params.action.category)) {
    reasons.push(`${params.action.category} is configured as an approval-gated action.`);
  }

  if (params.action.dataTouched.some((item) => /secret|token|credential|biometric/i.test(item))) {
    reasons.push("The action touches sensitive data.");
  }

  if (reasons.length > 0) {
    return {
      actionId: params.action.id,
      decision: "requires_approval",
      risk: "approval-required",
      reasons,
    };
  }

  return {
    actionId: params.action.id,
    decision: "allow",
    risk: "safe",
    reasons: ["Action is local, reversible, and within enabled connector scope."],
  };
}
