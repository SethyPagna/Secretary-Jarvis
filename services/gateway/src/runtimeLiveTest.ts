import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { RuntimeLiveTestCheck, RuntimeLiveTestStatus } from "@jarvis/core";

const DEFAULT_LIVE_TEST_SUMMARY = "C:\\Users\\user\\Downloads\\Secretary Jarvis\\jarvis\\data\\smoke\\runtime-live-latest.json";

export function readRuntimeLiveTestStatus(summaryPath = DEFAULT_LIVE_TEST_SUMMARY): RuntimeLiveTestStatus {
  if (!existsSync(summaryPath)) {
    return {
      ok: false,
      status: "missing",
      summaryPath,
      checks: [],
      message: "No production live test has been run yet.",
    };
  }

  try {
    const parsed = JSON.parse(readFileSync(summaryPath, "utf8")) as RuntimeLiveTestStatus;
    const checks = Array.isArray(parsed.checks) ? parsed.checks : [];
    return {
      ok: Boolean(parsed.ok),
      status: parsed.status ?? (parsed.ok ? "ready" : "failed"),
      summaryPath: parsed.summaryPath ?? summaryPath,
      createdAt: parsed.createdAt,
      completedAt: parsed.completedAt,
      durationMs: parsed.durationMs,
      checks,
      chatResult: parsed.chatResult,
      selfTestStatus: parsed.selfTestStatus,
      electronHeartbeat: parsed.electronHeartbeat,
      message: parsed.message ?? messageFor(checks),
    };
  } catch (error) {
    return {
      ok: false,
      status: "failed",
      summaryPath,
      checks: [],
      message: `Could not read production live test summary: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function runRuntimeLiveTest(options: {
  gatewayUrl?: string;
  brainUrl?: string;
  root?: string;
  summaryPath?: string;
  now?: () => string;
  fetchImpl?: typeof fetch;
} = {}): Promise<RuntimeLiveTestStatus> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const createdAt = options.now?.() ?? new Date().toISOString();
  const started = Date.now();
  const gatewayUrl = trimTrailingSlash(options.gatewayUrl ?? `http://127.0.0.1:${process.env.JARVIS_GATEWAY_PORT ?? "4317"}`);
  const brainUrl = trimTrailingSlash(options.brainUrl ?? process.env.JARVIS_BRAIN_URL ?? "http://127.0.0.1:5000");
  const summaryPath = options.summaryPath ?? DEFAULT_LIVE_TEST_SUMMARY;
  const root = options.root ?? process.cwd();
  const checks: RuntimeLiveTestCheck[] = [];

  await httpCheck(checks, fetchImpl, "Python Brain root", `${brainUrl}/`);
  await httpCheck(checks, fetchImpl, "Gateway root", `${gatewayUrl}/`);
  await httpCheck(checks, fetchImpl, "Gateway status", `${gatewayUrl}/api/status`);

  const chatResult = await chatCheck(checks, fetchImpl, gatewayUrl);
  const selfTestStatus = await selfTestCheck(checks, fetchImpl, gatewayUrl);
  const electronHeartbeat = electronHeartbeatCheck(checks, root);

  const completedAt = options.now?.() ?? new Date().toISOString();
  const failed = checks.filter((check) => !check.ok);
  const attention = selfTestStatus === "attention";
  const status: RuntimeLiveTestStatus["status"] = failed.length > 0 ? "failed" : attention ? "attention" : "ready";
  const result: RuntimeLiveTestStatus = {
    ok: failed.length === 0,
    status,
    summaryPath,
    createdAt,
    completedAt,
    durationMs: Date.now() - started,
    checks,
    chatResult,
    selfTestStatus,
    electronHeartbeat,
    message: messageFor(checks, status),
  };

  mkdirSync(dirname(summaryPath), { recursive: true });
  writeFileSync(summaryPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return result;
}

async function httpCheck(checks: RuntimeLiveTestCheck[], fetchImpl: typeof fetch, name: string, url: string): Promise<void> {
  const started = Date.now();
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(5000) });
    checks.push({
      name,
      ok: response.ok,
      url,
      statusCode: response.status,
      durationMs: Date.now() - started,
      detail: response.ok ? "HTTP heartbeat responded." : `HTTP returned ${response.status}.`,
    });
  } catch (error) {
    checks.push({
      name,
      ok: false,
      url,
      durationMs: Date.now() - started,
      detail: "HTTP heartbeat failed.",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function chatCheck(checks: RuntimeLiveTestCheck[], fetchImpl: typeof fetch, gatewayUrl: string): Promise<string | undefined> {
  const started = Date.now();
  try {
    const queued = await postJson<{ task?: { id?: string } }>(fetchImpl, `${gatewayUrl}/api/chat`, {
      message: "Jarvis production live test: reply briefly that the app is connected.",
      taskProfile: "daily-assistant",
    });
    const taskId = queued.task?.id;
    if (!taskId) {
      throw new Error("Chat did not return a task id.");
    }
    const task = await waitForTask(fetchImpl, gatewayUrl, taskId);
    const result = String(task.result ?? "").trim();
    checks.push({
      name: "Live text chat",
      ok: task.status === "completed" && result.length > 0,
      url: `${gatewayUrl}/api/chat`,
      statusCode: 202,
      durationMs: Date.now() - started,
      detail: result ? compact(result) : `Task finished with status ${task.status}.`,
    });
    return result || undefined;
  } catch (error) {
    checks.push({
      name: "Live text chat",
      ok: false,
      url: `${gatewayUrl}/api/chat`,
      durationMs: Date.now() - started,
      detail: "Jarvis could not complete a live chat task.",
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

async function selfTestCheck(checks: RuntimeLiveTestCheck[], fetchImpl: typeof fetch, gatewayUrl: string): Promise<string | undefined> {
  const started = Date.now();
  try {
    const payload = await getJson<{ selfTest?: { summary?: { topStatus?: string; connected?: boolean } } }>(fetchImpl, `${gatewayUrl}/api/runtime/self-test`);
    const topStatus = payload.selfTest?.summary?.topStatus ?? "unknown";
    const connected = Boolean(payload.selfTest?.summary?.connected);
    checks.push({
      name: "Runtime self-test",
      ok: connected && topStatus !== "blocked",
      url: `${gatewayUrl}/api/runtime/self-test`,
      statusCode: 200,
      durationMs: Date.now() - started,
      detail: `Self-test status: ${topStatus}.`,
    });
    return topStatus;
  } catch (error) {
    checks.push({
      name: "Runtime self-test",
      ok: false,
      url: `${gatewayUrl}/api/runtime/self-test`,
      durationMs: Date.now() - started,
      detail: "Runtime self-test failed.",
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

function electronHeartbeatCheck(checks: RuntimeLiveTestCheck[], root: string): string | undefined {
  const logPath = join(root, "data", "logs", "electron-main.debug.log");
  try {
    const log = readFileSync(logPath, "utf8");
    const lines = log.trim().split(/\r?\n/).slice(-30);
    const readyLine = [...lines].reverse().find((line) => line.includes("ready-to-show"));
    const crashedAfterReady = readyLine ? lines.slice(lines.indexOf(readyLine) + 1).some((line) => line.includes("render-process-gone crashed")) : false;
    const ok = Boolean(readyLine) && !crashedAfterReady;
    checks.push({
      name: "Electron heartbeat",
      ok,
      detail: ok ? "Electron HUD logged ready-to-show." : "Electron HUD did not report a stable ready-to-show heartbeat.",
    });
    return readyLine;
  } catch (error) {
    checks.push({
      name: "Electron heartbeat",
      ok: false,
      detail: "Electron heartbeat log is unavailable.",
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

async function waitForTask(fetchImpl: typeof fetch, gatewayUrl: string, taskId: string): Promise<{ status?: string; result?: string }> {
  const deadline = Date.now() + 75_000;
  while (Date.now() < deadline) {
    const payload = await getJson<{ tasks?: Array<{ id?: string; status?: string; result?: string }> }>(fetchImpl, `${gatewayUrl}/api/tasks`);
    const task = payload.tasks?.find((candidate) => candidate.id === taskId);
    if (task?.status === "completed" || task?.status === "failed" || task?.status === "cancelled") {
      return task;
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new Error(`Task ${taskId} did not complete in time.`);
}

async function getJson<T>(fetchImpl: typeof fetch, url: string): Promise<T> {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return (await response.json()) as T;
}

async function postJson<T>(fetchImpl: typeof fetch, url: string, body: unknown): Promise<T> {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return (await response.json()) as T;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function compact(value: string): string {
  return value.length > 120 ? `${value.slice(0, 117)}...` : value;
}

function messageFor(checks: RuntimeLiveTestCheck[], status?: RuntimeLiveTestStatus["status"]): string {
  const failed = checks.filter((check) => !check.ok).length;
  if (failed > 0) {
    return `${failed} live test check(s) failed.`;
  }
  if (status === "attention") {
    return "Jarvis is connected, with runtime attention items to review.";
  }
  return "Jarvis production live test passed.";
}
