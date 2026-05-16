import { allowedLocalActions, type ActionCategory, type PrivacyMode } from "@jarvis/core";
import type { StartupReadiness } from "./startupReadiness.js";

export interface AuthorityReadiness {
  generatedAt: string;
  privacyMode: PrivacyMode;
  mode: "limited-local" | "approved-admin-ready";
  ownerPrinciple: string;
  hierarchy: Array<{
    layer: string;
    responsibility: string;
    canEscalate: boolean;
  }>;
  localAuthority: {
    canRunBackground: boolean;
    approvedAdminAvailable: boolean;
    adminDetectedNow: boolean;
    startupConfigured: boolean;
    note: string;
  };
  actionSummary: {
    total: number;
    allowedWithoutApproval: number;
    approvalRequired: number;
    adminApproved: number;
    reversible: number;
    nonReversible: number;
  };
  sensitiveApprovalCategories: ActionCategory[];
  blockedCategories: ActionCategory[];
  examples: Array<{
    id: string;
    label: string;
    category: ActionCategory;
    risk: string;
    approval: string;
    reversible: boolean;
    executor: string;
  }>;
  guardrails: string[];
}

const BLOCKED_CATEGORIES: ActionCategory[] = ["protected-core-access"];

export function buildAuthorityReadiness(params: {
  generatedAt: string;
  privacyMode: PrivacyMode;
  startup: StartupReadiness;
}): AuthorityReadiness {
  const approvalRequired = allowedLocalActions.filter((action) => action.approval === "requires_approval");
  const adminApproved = allowedLocalActions.filter((action) => action.risk === "admin-approved");
  const reversible = allowedLocalActions.filter((action) => action.reversible);
  const sensitiveApprovalCategories = [...new Set(approvalRequired.map((action) => action.category))].sort();
  const approvedAdminAvailable = params.startup.authority.highTrustMode === "approved-admin-ready";

  return {
    generatedAt: params.generatedAt,
    privacyMode: params.privacyMode,
    mode: approvedAdminAvailable ? "approved-admin-ready" : "limited-local",
    ownerPrinciple: "Jarvis can be powerful on the laptop, but risky actions require explicit owner approval and protected core access remains sealed.",
    hierarchy: [
      {
        layer: "HUD / Dashboard",
        responsibility: "Collect commands, show concise approvals, and expose emergency stop.",
        canEscalate: false,
      },
      {
        layer: "TypeScript Gateway",
        responsibility: "Route requests, enforce policy, persist memory/tasks/undo, and create approval records.",
        canEscalate: false,
      },
      {
        layer: "Sentinel Policy",
        responsibility: "Deny protected-core access and gate sensitive local, social, network, sensor, and credential actions.",
        canEscalate: false,
      },
      {
        layer: "Python Brain",
        responsibility: "Execute approved system actions through controlled local adapters and report results.",
        canEscalate: approvedAdminAvailable,
      },
      {
        layer: "Windows Approved-Admin Task",
        responsibility: "Provides owner-approved elevated process capability when explicitly registered.",
        canEscalate: approvedAdminAvailable,
      },
    ],
    localAuthority: {
      canRunBackground: params.startup.summary.startupConfigured,
      approvedAdminAvailable,
      adminDetectedNow: params.startup.authority.adminDetected,
      startupConfigured: params.startup.summary.startupConfigured,
      note: approvedAdminAvailable
        ? "Approved-admin startup intent is configured; each sensitive action is still approval-gated."
        : "Jarvis is operating in limited local mode until the elevated startup task is deliberately registered.",
    },
    actionSummary: {
      total: allowedLocalActions.length,
      allowedWithoutApproval: allowedLocalActions.filter((action) => action.approval === "allow").length,
      approvalRequired: approvalRequired.length,
      adminApproved: adminApproved.length,
      reversible: reversible.length,
      nonReversible: allowedLocalActions.length - reversible.length,
    },
    sensitiveApprovalCategories,
    blockedCategories: BLOCKED_CATEGORIES,
    examples: allowedLocalActions.map((action) => ({
      id: action.id,
      label: action.label,
      category: action.category,
      risk: action.risk,
      approval: action.approval,
      reversible: action.reversible,
      executor: action.executor,
    })),
    guardrails: [
      "Protected core code, safeguards, secrets, and raw model internals are denied to runtime agents.",
      "Deletes, scripts, service control, external messages, credentials, device control, model downloads, and sensors require approval.",
      "Jarvis-managed reversible file/config changes receive a 20-minute undo checkpoint when feasible.",
      "Non-reversible actions must be labeled before approval and cannot be time-travel restored.",
      "Emergency stop pauses agents, listening/capture, and queues while preserving logs and checkpoints.",
    ],
  };
}
