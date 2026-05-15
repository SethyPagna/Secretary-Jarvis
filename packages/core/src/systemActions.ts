import type { ActionCategory, ActionRequest, PolicyDecision, SystemAction, UndoJournalEntry } from "./types.js";

export function classifySystemCommand(command: string): ActionCategory {
  if (/delete|remove|rm\b|del\b/i.test(command)) {
    return "delete-local";
  }
  if (/powershell|\.ps1|cmd\.exe|script/i.test(command)) {
    return "run-script";
  }
  if (/service|ollama serve|start|stop/i.test(command)) {
    return "service-control";
  }
  if (/window|focus|minimize|maximize/i.test(command)) {
    return "window-control";
  }
  if (/open|launch/i.test(command)) {
    return "app-control";
  }
  if (/move|copy|rename|write|edit|organize/i.test(command)) {
    return "write-local";
  }
  return "read-local";
}

export function isReversibleSystemCommand(category: ActionCategory, command: string): boolean {
  if (category === "read-local" || category === "app-control" || category === "window-control" || category === "service-control") {
    return false;
  }
  return !/format|purchase|send|post|credential|account|factory|encrypt|wipe/i.test(command);
}

export function restoreStrategyForSystemCommand(
  category: ActionCategory,
  command: string,
): UndoJournalEntry["operation"]["restoreStrategy"] {
  if (!isReversibleSystemCommand(category, command)) {
    return "none";
  }
  if (/move|rename|organize/i.test(command)) {
    return "move-back";
  }
  if (/config|setting/i.test(command)) {
    return "config-restore";
  }
  if (/write|edit|copy|delete|remove|rm\b|del\b/i.test(command)) {
    return "copy-back";
  }
  return "state-marker";
}

export function createUndoJournalEntry(params: {
  id: string;
  action: SystemAction;
  createdAt: string;
  ttlMinutes?: number;
}): UndoJournalEntry {
  const expiresAt = params.action.expiresAt ?? new Date(Date.parse(params.createdAt) + (params.ttlMinutes ?? 20) * 60 * 1000).toISOString();
  const restoreStrategy = restoreStrategyForSystemCommand(params.action.category, params.action.command);
  return {
    id: params.id,
    actionId: params.action.id,
    label: params.action.label,
    target: params.action.target,
    reversible: params.action.reversible,
    status: params.action.reversible ? "available" : "not-reversible",
    createdAt: params.createdAt,
    expiresAt,
    rollbackNote: params.action.rollbackNote,
    snapshotSummary: params.action.reversible
      ? `Checkpoint reserved for ${params.action.target}. Restore strategy: ${restoreStrategy}.`
      : `No perfect rollback is available for ${params.action.category}.`,
    operation: {
      kind: params.action.category,
      command: params.action.command,
      dryRunOnly: params.action.status === "draft" || params.action.status === "waiting-approval",
      restoreStrategy,
    },
  };
}

export function createSystemActionDraft(params: {
  id: string;
  label: string;
  command: string;
  target: string;
  createdAt: string;
  expiresAt: string;
  category?: ActionCategory;
  decision: PolicyDecision;
  actionRequest: ActionRequest;
}): SystemAction {
  const category = params.category ?? classifySystemCommand(params.command);
  const reversible = isReversibleSystemCommand(category, params.command);
  return {
    id: params.id,
    label: params.label,
    category,
    command: params.command,
    target: params.target,
    reversible,
    approvalRequired: params.decision.decision !== "allow",
    rollbackNote: reversible
      ? "Jarvis will keep a 20-minute checkpoint so this change can be restored as if it did not happen."
      : "This action cannot be perfectly undone; approval must acknowledge that limitation.",
    status: params.decision.decision === "deny" ? "blocked" : params.decision.decision === "requires_approval" ? "waiting-approval" : "draft",
    createdAt: params.createdAt,
    expiresAt: reversible ? params.expiresAt : undefined,
    actionRequest: params.actionRequest,
    decision: params.decision,
  };
}
