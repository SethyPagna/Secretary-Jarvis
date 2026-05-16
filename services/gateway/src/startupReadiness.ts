import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const DEFAULT_TASK_NAME = "Secretary Jarvis Local Runtime";
const SERVICE_PID_FILES = ["python-brain.pid", "typescript-gateway.pid", "hud-renderer.pid", "electron-hud.pid", "ollama.pid"];

export interface StartupReadiness {
  generatedAt: string;
  root: string;
  taskName: string;
  scripts: Array<{ id: string; path: string; exists: boolean; purpose: string }>;
  scheduledTask: {
    configured: boolean;
    taskName: string;
    runLevel: "highest" | "limited" | "unknown";
    detail: string;
  };
  startupShortcut: {
    configured: boolean;
    path: string;
    detail: string;
  };
  backgroundProcesses: Array<{
    serviceId: string;
    pidFile: string;
    pid?: number;
    pidAlive: boolean;
    detail: string;
  }>;
  authority: {
    elevatedRequested: boolean;
    adminDetected: boolean;
    highTrustMode: "limited" | "approved-admin-ready";
    note: string;
  };
  summary: {
    startupConfigured: boolean;
    scriptsReady: boolean;
    backgroundPidFiles: number;
    runningPidFiles: number;
  };
  recommendations: string[];
}

export function buildStartupReadiness(params: {
  root: string;
  generatedAt: string;
  taskName?: string;
  commandRunner?: (command: string, args: string[]) => string;
  startupFolder?: string;
}): StartupReadiness {
  const taskName = params.taskName ?? DEFAULT_TASK_NAME;
  const scripts = [
    script("start", params.root, "scripts/start-jarvis.ps1", "Launch background Jarvis services."),
    script("stop", params.root, "scripts/stop-jarvis.ps1", "Stop Jarvis services while preserving logs/checkpoints."),
    script("register", params.root, "scripts/register-startup-task.ps1", "Register Windows logon startup task or shortcut fallback."),
    script("verify", params.root, "scripts/verify-jarvis.ps1", "Run integration verification and startup check-only flow."),
  ];
  const scheduledTask = scheduledTaskStatus(taskName, params.commandRunner ?? defaultCommandRunner);
  const startupShortcutPath = join(params.startupFolder ?? defaultStartupFolder(), `${taskName}.lnk`);
  const startupShortcut = {
    configured: existsSync(startupShortcutPath),
    path: startupShortcutPath,
    detail: existsSync(startupShortcutPath) ? "Startup shortcut exists." : "Startup shortcut fallback is not present.",
  };
  const backgroundProcesses = SERVICE_PID_FILES.map((pidFile) => pidStatus(params.root, pidFile));
  const adminDetected = detectAdmin(params.commandRunner ?? defaultCommandRunner);
  const elevatedRequested = scheduledTask.runLevel === "highest";
  const startupConfigured = scheduledTask.configured || startupShortcut.configured;

  return {
    generatedAt: params.generatedAt,
    root: params.root,
    taskName,
    scripts,
    scheduledTask,
    startupShortcut,
    backgroundProcesses,
    authority: {
      elevatedRequested,
      adminDetected,
      highTrustMode: elevatedRequested ? "approved-admin-ready" : "limited",
      note: elevatedRequested
        ? "Windows startup is configured to request highest run level; sensitive actions still require Jarvis approval."
        : "Startup runs in limited mode unless the owner registers the elevated scheduled task.",
    },
    summary: {
      startupConfigured,
      scriptsReady: scripts.every((entry) => entry.exists),
      backgroundPidFiles: backgroundProcesses.filter((entry) => entry.pid !== undefined).length,
      runningPidFiles: backgroundProcesses.filter((entry) => entry.pidAlive).length,
    },
    recommendations: recommendationsFor(startupConfigured, elevatedRequested, scripts.every((entry) => entry.exists)),
  };
}

export function withTempStartupFixture(callback: (root: string, startupFolder: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "jarvis-startup-"));
  const startupFolder = join(root, "startup");
  try {
    mkdirSync(join(root, "scripts"), { recursive: true });
    mkdirSync(join(root, "data", "runtime"), { recursive: true });
    mkdirSync(startupFolder, { recursive: true });
    for (const file of ["start-jarvis.ps1", "stop-jarvis.ps1", "register-startup-task.ps1", "verify-jarvis.ps1"]) {
      writeFileSync(join(root, "scripts", file), "# test\n");
    }
    writeFileSync(join(root, "data", "runtime", "typescript-gateway.pid"), `${process.pid}`);
    writeFileSync(join(startupFolder, `${DEFAULT_TASK_NAME}.lnk`), "shortcut");
    callback(root, startupFolder);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function script(id: string, root: string, relativePath: string, purpose: string): StartupReadiness["scripts"][number] {
  const path = join(root, relativePath);
  return { id, path, exists: existsSync(path), purpose };
}

function scheduledTaskStatus(
  taskName: string,
  commandRunner: (command: string, args: string[]) => string,
): StartupReadiness["scheduledTask"] {
  try {
    const output = commandRunner("schtasks.exe", ["/Query", "/TN", taskName, "/FO", "LIST", "/V"]);
    return {
      configured: true,
      taskName,
      runLevel: /Run As Task:\s*Interactive Token/i.test(output) ? "limited" : /highest|highestavailable/i.test(output) ? "highest" : "unknown",
      detail: "Scheduled task was found.",
    };
  } catch (error) {
    return {
      configured: false,
      taskName,
      runLevel: "unknown",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

function pidStatus(root: string, pidFile: string): StartupReadiness["backgroundProcesses"][number] {
  const fullPath = join(root, "data", "runtime", pidFile);
  if (!existsSync(fullPath)) {
    return {
      serviceId: pidFile.replace(/\.pid$/i, ""),
      pidFile: fullPath,
      pidAlive: false,
      detail: "PID file is not present.",
    };
  }
  const pid = Number.parseInt(readFileSync(fullPath, "utf8").trim(), 10);
  const pidAlive = Number.isFinite(pid) ? isPidAlive(pid) : false;
  return {
    serviceId: pidFile.replace(/\.pid$/i, ""),
    pidFile: fullPath,
    pid: Number.isFinite(pid) ? pid : undefined,
    pidAlive,
    detail: pidAlive ? "PID appears to be running." : "PID file exists but process is not alive.",
  };
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function detectAdmin(commandRunner: (command: string, args: string[]) => string): boolean {
  try {
    commandRunner("cmd.exe", ["/d", "/s", "/c", "net session"]);
    return true;
  } catch {
    return false;
  }
}

function recommendationsFor(startupConfigured: boolean, elevatedRequested: boolean, scriptsReady: boolean): string[] {
  const recommendations: string[] = [];
  if (!scriptsReady) {
    recommendations.push("Restore missing startup/stop/verify scripts before enabling background startup.");
  }
  if (!startupConfigured) {
    recommendations.push("Run scripts/register-startup-task.ps1 after review to start Jarvis at Windows logon.");
  }
  if (!elevatedRequested) {
    recommendations.push("Use scripts/register-startup-task.ps1 -Elevated only when you want approved-admin mode.");
  }
  recommendations.push("Sensitive actions still require Jarvis policy approval even in approved-admin mode.");
  return recommendations;
}

function defaultCommandRunner(command: string, args: string[]): string {
  return execFileSync(command, args, { encoding: "utf8", timeout: 5000, windowsHide: true });
}

function defaultStartupFolder(): string {
  return join(process.env.APPDATA ?? "", "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
}
