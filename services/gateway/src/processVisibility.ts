import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface ProcessVisibilityStatus {
  generatedAt: string;
  runtimeRoot: string;
  services: ProcessVisibilityService[];
  summary: {
    tracked: number;
    pidFilesPresent: number;
    alive: number;
    visibleInTaskManager: number;
  };
  note: string;
}

export interface ProcessVisibilityService {
  id: string;
  label: string;
  pidFile: string;
  expectedProcessNames: string[];
  taskManagerGroup: "Apps" | "Background processes" | "Windows processes";
  pid?: number;
  pidAlive: boolean;
  expectedVisible: boolean;
  detail: string;
}

const DEFAULT_RUNTIME_ROOT = "C:\\Users\\user\\Downloads\\Secretary Jarvis\\jarvis\\data\\runtime";

const SERVICE_VISIBILITY = [
  {
    id: "python-brain",
    label: "Python Brain",
    pidFile: "python-brain.pid",
    expectedProcessNames: ["python.exe", "pythonw.exe"],
    taskManagerGroup: "Background processes" as const,
  },
  {
    id: "typescript-gateway",
    label: "TypeScript Gateway",
    pidFile: "typescript-gateway.pid",
    expectedProcessNames: ["node.exe"],
    taskManagerGroup: "Background processes" as const,
  },
  {
    id: "hud-renderer",
    label: "HUD Renderer",
    pidFile: "hud-renderer.pid",
    expectedProcessNames: ["node.exe"],
    taskManagerGroup: "Background processes" as const,
  },
  {
    id: "electron-hud",
    label: "Electron HUD",
    pidFile: "electron-hud.pid",
    expectedProcessNames: ["electron.exe", "Jarvis.exe"],
    taskManagerGroup: "Apps" as const,
  },
  {
    id: "ollama",
    label: "Ollama Runtime",
    pidFile: "ollama.pid",
    expectedProcessNames: ["ollama.exe"],
    taskManagerGroup: "Background processes" as const,
  },
];

export function buildProcessVisibilityStatus(params: {
  generatedAt: string;
  runtimeRoot?: string;
  pidAlive?: (pid: number) => boolean;
}): ProcessVisibilityStatus {
  const runtimeRoot = params.runtimeRoot ?? DEFAULT_RUNTIME_ROOT;
  const pidAlive = params.pidAlive ?? isPidAlive;
  const services = SERVICE_VISIBILITY.map((service) => visibilityForService(runtimeRoot, service, pidAlive));

  return {
    generatedAt: params.generatedAt,
    runtimeRoot,
    services,
    summary: {
      tracked: services.length,
      pidFilesPresent: services.filter((service) => service.pid !== undefined).length,
      alive: services.filter((service) => service.pidAlive).length,
      visibleInTaskManager: services.filter((service) => service.expectedVisible).length,
    },
    note: "Read-only visibility summary. Jarvis did not start, stop, hide, elevate, or inspect protected process memory.",
  };
}

export function withTempProcessVisibilityFixture(callback: (runtimeRoot: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "jarvis-process-"));
  try {
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, "typescript-gateway.pid"), `${process.pid}`);
    writeFileSync(join(root, "ollama.pid"), "99999999");
    callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function visibilityForService(
  runtimeRoot: string,
  service: (typeof SERVICE_VISIBILITY)[number],
  pidAlive: (pid: number) => boolean,
): ProcessVisibilityService {
  const pidFilePath = join(runtimeRoot, service.pidFile);
  const pid = readPid(pidFilePath);
  const alive = pid !== undefined ? pidAlive(pid) : false;
  return {
    ...service,
    pidFile: pidFilePath,
    pid,
    pidAlive: alive,
    expectedVisible: alive,
    detail: alive
      ? `${service.label} PID is alive and should appear as ${service.expectedProcessNames.join(" or ")} in Task Manager.`
      : pid === undefined
        ? `${service.label} has no PID file yet; start Jarvis or run startup readiness first.`
        : `${service.label} has a PID file, but that PID is not alive.`,
  };
}

function readPid(path: string): number | undefined {
  if (!existsSync(path)) {
    return undefined;
  }
  const pid = Number.parseInt(readFileSync(path, "utf8").trim(), 10);
  return Number.isFinite(pid) ? pid : undefined;
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
