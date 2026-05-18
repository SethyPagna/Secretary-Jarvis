import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { RuntimeServiceHeartbeat, RuntimeServiceId, RuntimeServicesStatus } from "@jarvis/core";

const DEFAULT_RUNTIME_ROOT = "C:\\Users\\user\\Downloads\\Secretary Jarvis\\jarvis\\data\\runtime";

interface ServiceDefinition {
  id: RuntimeServiceId;
  label: string;
  pidFile?: string;
  url?: string;
}

export interface RuntimeServicesOptions {
  runtimeRoot?: string;
  services?: ServiceDefinition[];
  now?: () => string;
  readPid?: (path: string) => number | undefined;
  pidAlive?: (pid: number) => boolean;
  httpProbe?: (url: string) => Promise<boolean>;
}

export async function buildRuntimeServicesStatus(options: RuntimeServicesOptions = {}): Promise<RuntimeServicesStatus> {
  const checkedAt = options.now?.() ?? new Date().toISOString();
  const services = await Promise.all(
    (options.services ?? defaultServices()).map((service) =>
      heartbeatForService(service, {
        runtimeRoot: options.runtimeRoot ?? DEFAULT_RUNTIME_ROOT,
        checkedAt,
        readPid: options.readPid ?? readPidFile,
        pidAlive: options.pidAlive ?? isPidAlive,
        httpProbe: options.httpProbe ?? probeHttp,
      }),
    ),
  );

  return {
    localOnly: true,
    checkedAt,
    services,
    summary: {
      online: services.filter((service) => service.status === "online").length,
      degraded: services.filter((service) => service.status === "degraded").length,
      offline: services.filter((service) => service.status === "offline").length,
      unknown: services.filter((service) => service.status === "unknown").length,
    },
    note: "Read-only heartbeat. Jarvis did not start, stop, or modify runtime processes.",
  };
}

function defaultServices(): ServiceDefinition[] {
  const brainPort = process.env.JARVIS_BRAIN_PORT ?? "5000";
  return [
    { id: "brain", label: "Python Brain", pidFile: "python-brain.pid", url: `http://127.0.0.1:${brainPort}/health` },
    { id: "gateway", label: "TypeScript Gateway", pidFile: "typescript-gateway.pid" },
    { id: "dashboard", label: "Dashboard", pidFile: "dashboard.pid", url: "http://127.0.0.1:5174/" },
    { id: "hud-renderer", label: "HUD Renderer", pidFile: "hud-renderer.pid", url: "http://127.0.0.1:5175/" },
    { id: "electron-hud", label: "Electron HUD", pidFile: "electron-hud.pid" },
    { id: "ollama", label: "Ollama", pidFile: "ollama.pid", url: "http://127.0.0.1:11434/api/tags" },
  ];
}

async function heartbeatForService(
  service: ServiceDefinition,
  options: {
    runtimeRoot: string;
    checkedAt: string;
    readPid: (path: string) => number | undefined;
    pidAlive: (pid: number) => boolean;
    httpProbe: (url: string) => Promise<boolean>;
  },
): Promise<RuntimeServiceHeartbeat> {
  const pid = service.pidFile ? options.readPid(join(options.runtimeRoot, service.pidFile)) : undefined;
  const pidAlive = pid ? options.pidAlive(pid) : false;
  const httpOk = service.url ? await options.httpProbe(service.url) : false;
  const status = httpOk ? "online" : pidAlive && !service.url ? "online" : pidAlive ? "degraded" : service.pidFile || service.url ? "offline" : "unknown";
  return {
    id: service.id,
    label: service.label,
    status,
    pid,
    pidAlive,
    url: service.url,
    httpOk,
    checkedAt: options.checkedAt,
  detail: httpOk
      ? "HTTP heartbeat responded."
      : pidAlive && !service.url
        ? "Process heartbeat is alive."
      : pidAlive
        ? "Process is present, but the HTTP heartbeat did not respond."
        : "No live heartbeat detected.",
  };
}

function readPidFile(path: string): number | undefined {
  try {
    if (!existsSync(path)) {
      return undefined;
    }
    const value = Number.parseInt(readFileSync(path, "utf8").trim(), 10);
    return Number.isFinite(value) && value > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function probeHttp(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
