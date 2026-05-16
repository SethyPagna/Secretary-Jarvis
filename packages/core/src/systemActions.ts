import type { ActionCategory, ActionRequest, PolicyDecision, SystemAction, UndoJournalEntry } from "./types.js";

export type LocalActionExecutor = "gateway" | "python-brain" | "powershell-mediated" | "manual-connector";
export type LocalActionRisk = "safe-local" | "owner-approved" | "admin-approved" | "blocked";

export interface LocalActionDefinition {
  id: string;
  label: string;
  category: ActionCategory;
  description: string;
  commandTemplate: string;
  targetHint: string;
  approval: "allow" | "requires_approval" | "deny";
  risk: LocalActionRisk;
  reversible: boolean;
  rollback: UndoJournalEntry["operation"]["restoreStrategy"];
  executor: LocalActionExecutor;
  dataTouched: string[];
  safeguards: string[];
  examples: string[];
}

export const allowedLocalActions: LocalActionDefinition[] = [
  {
    id: "inspect-system-state",
    label: "Inspect system state",
    category: "read-local",
    description: "Read local runtime, disk, process, model, and queue status without changing the machine.",
    commandTemplate: "inspect status",
    targetHint: "local laptop",
    approval: "allow",
    risk: "safe-local",
    reversible: false,
    rollback: "none",
    executor: "gateway",
    dataTouched: ["local laptop state"],
    safeguards: ["read-only", "no credential capture", "audit summary"],
    examples: ["status", "doctor", "show model readiness"],
  },
  {
    id: "read-approved-folder",
    label: "Read approved folder",
    category: "read-local",
    description: "List and summarize approved folder contents for MemoryOS, search, and local project assistance.",
    commandTemplate: "list <folder>",
    targetHint: "approved local folder",
    approval: "allow",
    risk: "safe-local",
    reversible: false,
    rollback: "none",
    executor: "gateway",
    dataTouched: ["file names", "file metadata", "approved document text"],
    safeguards: ["path allowlist", "secret redaction", "audit summary"],
    examples: ["list Downloads", "summarize project folder"],
  },
  {
    id: "open-local-app",
    label: "Open local app",
    category: "app-control",
    description: "Launch an approved local application such as VS Code, File Explorer, browser, terminal, or Ollama UI.",
    commandTemplate: "open <app>",
    targetHint: "approved app name or path",
    approval: "allow",
    risk: "safe-local",
    reversible: false,
    rollback: "none",
    executor: "powershell-mediated",
    dataTouched: ["process list", "app launch"],
    safeguards: ["approved app registry", "no arbitrary executable paths without approval", "audit summary"],
    examples: ["open VS Code", "open File Explorer"],
  },
  {
    id: "control-window",
    label: "Control window",
    category: "window-control",
    description: "Focus, minimize, maximize, or arrange approved app windows.",
    commandTemplate: "<focus|minimize|maximize> <window>",
    targetHint: "visible local window",
    approval: "allow",
    risk: "safe-local",
    reversible: false,
    rollback: "none",
    executor: "python-brain",
    dataTouched: ["window titles", "desktop state"],
    safeguards: ["foreground-only control", "no hidden credential dialogs", "audit summary"],
    examples: ["focus VS Code", "minimize browser"],
  },
  {
    id: "control-audio-output",
    label: "Control audio output",
    category: "device-control",
    description: "Change local speaker volume, mute state, or selected output device when explicitly requested.",
    commandTemplate: "<set volume|mute|unmute> <value>",
    targetHint: "local speakers",
    approval: "allow",
    risk: "safe-local",
    reversible: false,
    rollback: "none",
    executor: "python-brain",
    dataTouched: ["audio device state"],
    safeguards: ["local-only", "no recording access", "audit summary"],
    examples: ["set volume to 50%", "mute speakers"],
  },
  {
    id: "create-folder",
    label: "Create folder",
    category: "write-local",
    description: "Create a folder inside an approved workspace with a reversible removal marker if it stays empty.",
    commandTemplate: "mkdir <path>",
    targetHint: "approved local folder path",
    approval: "requires_approval",
    risk: "owner-approved",
    reversible: true,
    rollback: "state-marker",
    executor: "python-brain",
    dataTouched: ["file path", "folder metadata"],
    safeguards: ["path allowlist", "20-minute undo journal", "owner approval"],
    examples: ["create folder Project Notes", "mkdir archive"],
  },
  {
    id: "copy-file",
    label: "Copy file",
    category: "write-local",
    description: "Copy files inside approved folders with a 20-minute checkpoint for overwritten targets.",
    commandTemplate: "copy <source> <target>",
    targetHint: "approved local file path",
    approval: "requires_approval",
    risk: "owner-approved",
    reversible: true,
    rollback: "copy-back",
    executor: "python-brain",
    dataTouched: ["file content", "file metadata"],
    safeguards: ["path allowlist", "20-minute undo journal", "overwrite checkpoint"],
    examples: ["copy report.md backup/report.md"],
  },
  {
    id: "move-file",
    label: "Move or rename file",
    category: "write-local",
    description: "Move or rename files in approved folders with a 20-minute move-back checkpoint.",
    commandTemplate: "move <source> <target>",
    targetHint: "approved local file path",
    approval: "requires_approval",
    risk: "owner-approved",
    reversible: true,
    rollback: "move-back",
    executor: "python-brain",
    dataTouched: ["file path", "file metadata"],
    safeguards: ["path allowlist", "20-minute undo journal", "move-back checkpoint"],
    examples: ["rename draft.txt final.txt", "move screenshot.png archive/"],
  },
  {
    id: "edit-file",
    label: "Edit file",
    category: "write-local",
    description: "Apply a Jarvis-managed edit to an approved file with content checkpoint restore.",
    commandTemplate: "edit <file>",
    targetHint: "approved local file path",
    approval: "requires_approval",
    risk: "owner-approved",
    reversible: true,
    rollback: "copy-back",
    executor: "gateway",
    dataTouched: ["file content"],
    safeguards: ["content snapshot", "20-minute undo journal", "diff preview"],
    examples: ["edit config.yaml", "write notes summary"],
  },
  {
    id: "delete-file",
    label: "Delete file",
    category: "delete-local",
    description: "Delete only after explicit approval and a pre-delete content checkpoint when feasible.",
    commandTemplate: "delete <file>",
    targetHint: "approved local file path",
    approval: "requires_approval",
    risk: "admin-approved",
    reversible: true,
    rollback: "copy-back",
    executor: "python-brain",
    dataTouched: ["file content", "file metadata"],
    safeguards: ["explicit owner approval", "pre-delete checkpoint when feasible", "deny protected paths"],
    examples: ["delete duplicate temp file"],
  },
  {
    id: "run-approved-script",
    label: "Run approved script",
    category: "run-script",
    description: "Run scripts from approved folders with logged arguments, output summary, and owner approval.",
    commandTemplate: "run <script>",
    targetHint: "approved script path",
    approval: "requires_approval",
    risk: "admin-approved",
    reversible: false,
    rollback: "none",
    executor: "powershell-mediated",
    dataTouched: ["script output", "local process state"],
    safeguards: ["approved script allowlist", "argument logging", "output summary", "no hidden elevation"],
    examples: ["run scripts/start-jarvis.ps1"],
  },
  {
    id: "control-service",
    label: "Start or stop local service",
    category: "service-control",
    description: "Start, stop, or restart approved Jarvis services such as Ollama, Python Brain, gateway, HUD, or dashboard.",
    commandTemplate: "<start|stop|restart> <service>",
    targetHint: "approved local service",
    approval: "requires_approval",
    risk: "owner-approved",
    reversible: false,
    rollback: "none",
    executor: "powershell-mediated",
    dataTouched: ["service state", "process list"],
    safeguards: ["approved service list", "graceful stop first", "event log entry"],
    examples: ["restart gateway", "start Ollama"],
  },
  {
    id: "launch-model-runtime",
    label: "Launch model runtime",
    category: "service-control",
    description: "Start a local model runtime endpoint for Ollama, LM Studio, llama.cpp, vLLM, or SGLang.",
    commandTemplate: "launch model runtime <adapter>",
    targetHint: "local runtime adapter",
    approval: "requires_approval",
    risk: "owner-approved",
    reversible: false,
    rollback: "none",
    executor: "manual-connector",
    dataTouched: ["model cache", "runtime process state"],
    safeguards: ["local endpoint only by default", "no model download without separate approval", "resource warning"],
    examples: ["launch Ollama", "start LM Studio endpoint"],
  },
  {
    id: "organize-folder",
    label: "Organize folder",
    category: "write-local",
    description: "Sort approved folder contents into owner-approved categories with a reversible move journal.",
    commandTemplate: "organize <folder>",
    targetHint: "approved local folder",
    approval: "requires_approval",
    risk: "owner-approved",
    reversible: true,
    rollback: "move-back",
    executor: "python-brain",
    dataTouched: ["file paths", "file metadata"],
    safeguards: ["dry-run preview", "20-minute move journal", "protected path denylist"],
    examples: ["organize Downloads", "organize screenshots"],
  },
  {
    id: "read-local-docs",
    label: "Read local docs",
    category: "read-local",
    description: "Read approved local notes, PDFs, docs, and project files for MemoryOS/RAG.",
    commandTemplate: "read <path>",
    targetHint: "approved local document path",
    approval: "allow",
    risk: "safe-local",
    reversible: false,
    rollback: "none",
    executor: "gateway",
    dataTouched: ["document text", "metadata"],
    safeguards: ["path allowlist", "secret redaction", "MemoryOS provenance"],
    examples: ["read project README", "summarize local PDF"],
  },
];

export function localActionsForCategory(category: ActionCategory): LocalActionDefinition[] {
  return allowedLocalActions.filter((action) => action.category === category);
}

export function findLocalActionDefinition(commandOrId: string): LocalActionDefinition | undefined {
  const normalized = commandOrId.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  return (
    allowedLocalActions.find((action) => action.id === normalized) ??
    allowedLocalActions.find((action) => normalized === action.label.toLowerCase()) ??
    allowedLocalActions.find((action) => action.examples.some((example) => normalized.includes(example.toLowerCase().split(" ")[0]))) ??
    allowedLocalActions.find((action) => normalized.includes(action.commandTemplate.split(" ")[0].toLowerCase()))
  );
}

export function classifySystemCommand(command: string): ActionCategory {
  if (/delete|remove|rm\b|del\b/i.test(command)) {
    return "delete-local";
  }
  if (/powershell|\.ps1|cmd\.exe|script/i.test(command)) {
    return "run-script";
  }
  if (/\b(service|ollama serve|restart|daemon|launch model runtime)\b/i.test(command) || /\b(start|stop)\s+(gateway|ollama|python brain|hud|dashboard|service)\b/i.test(command)) {
    return "service-control";
  }
  if (/volume|speaker|mute|unmute|audio output/i.test(command)) {
    return "device-control";
  }
  if (/window|focus|minimize|maximize/i.test(command)) {
    return "window-control";
  }
  if (/open|launch/i.test(command)) {
    return "app-control";
  }
  if (/move|copy|rename|write|edit|organize|mkdir|create folder/i.test(command)) {
    return "write-local";
  }
  return "read-local";
}

export function isReversibleSystemCommand(category: ActionCategory, command: string): boolean {
  if (
    category === "read-local" ||
    category === "app-control" ||
    category === "window-control" ||
    category === "service-control" ||
    category === "device-control"
  ) {
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
  if (/mkdir|create folder/i.test(command)) {
    return "state-marker";
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
