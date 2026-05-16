import { existsSync } from "node:fs";
import { join } from "node:path";

export interface StartupRegistrationPlan {
  id: "startup-shortcut" | "scheduled-task-elevated";
  label: string;
  mode: "standard" | "approved-admin";
  runLevel: "limited" | "highest";
  scriptPath: string;
  commandPreview: string;
  approvalRequired: boolean;
  reversible: boolean;
  rollbackCommand: string;
  status: "ready" | "missing-script";
  notes: string[];
}

export interface StartupRegistrationPlansManifest {
  generatedAt: string;
  root: string;
  plans: StartupRegistrationPlan[];
  note: string;
}

export function buildStartupRegistrationPlans(params: {
  root: string;
  generatedAt: string;
  taskName?: string;
}): StartupRegistrationPlansManifest {
  const taskName = params.taskName ?? "Secretary Jarvis Local Runtime";
  const scriptPath = join(params.root, "scripts", "jarvis-runtime.ps1");
  const scriptExists = existsSync(scriptPath);

  return {
    generatedAt: params.generatedAt,
    root: params.root,
    plans: [
      {
        id: "startup-shortcut",
        label: "Standard startup shortcut",
        mode: "standard",
        runLevel: "limited",
        scriptPath,
        commandPreview: `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}" -Action RegisterStartup -TaskName "${taskName}" -StandardStartup`,
        approvalRequired: true,
        reversible: true,
        rollbackCommand: `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}" -Action UnregisterStartup -TaskName "${taskName}"`,
        status: scriptExists ? "ready" : "missing-script",
        notes: [
          "Registers Jarvis to start at Windows logon without requesting highest privileges.",
          "Good default for background HUD, Gateway, Brain, and local model service startup.",
        ],
      },
      {
        id: "scheduled-task-elevated",
        label: "Approved-admin scheduled task",
        mode: "approved-admin",
        runLevel: "highest",
        scriptPath,
        commandPreview: `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}" -Action RegisterStartup -TaskName "${taskName}"`,
        approvalRequired: true,
        reversible: true,
        rollbackCommand: `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}" -Action UnregisterStartup -TaskName "${taskName}"`,
        status: scriptExists ? "ready" : "missing-script",
        notes: [
          "Requests Windows highest run level at logon so approved local automation can perform admin-class work.",
          "Does not bypass Jarvis approvals; sensitive actions still require explicit confirmation.",
        ],
      },
    ],
    note: "Dry-run registration plans only. No startup task, shortcut, registry key, or elevation change was created.",
  };
}
