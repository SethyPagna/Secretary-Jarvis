import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readRuntimeLiveTestStatus, runRuntimeLiveTest } from "../src/runtimeLiveTest.js";

describe("runtime live test", () => {
  it("returns missing status before a production live test has run", () => {
    const root = mkdtempSync(join(tmpdir(), "jarvis-live-test-missing-"));
    try {
      const status = readRuntimeLiveTestStatus(join(root, "missing.json"));
      expect(status.status).toBe("missing");
      expect(status.message).toContain("No production live test");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("checks brain, gateway, chat, self-test, and Electron heartbeat", async () => {
    const root = mkdtempSync(join(tmpdir(), "jarvis-live-test-"));
    try {
      mkdirSync(join(root, "data", "logs"), { recursive: true });
      writeFileSync(join(root, "data", "logs", "electron-main.debug.log"), "2026-05-16T00:00:00.000Z ready-to-show\n");
      const summaryPath = join(root, "data", "smoke", "runtime-live-latest.json");
      const fetchImpl = async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith("/api/chat")) {
          return jsonResponse({ task: { id: "task-live" } }, 202);
        }
        if (url.endsWith("/api/tasks")) {
          return jsonResponse({ tasks: [{ id: "task-live", status: "completed", result: "Jarvis app connected." }] });
        }
        if (url.endsWith("/api/runtime/self-test")) {
          return jsonResponse({ selfTest: { summary: { topStatus: "ready", connected: true } } });
        }
        return jsonResponse({ ok: true });
      };

      const status = await runRuntimeLiveTest({
        gatewayUrl: "http://127.0.0.1:4317",
        brainUrl: "http://127.0.0.1:5000",
        root,
        summaryPath,
        now: () => "2026-05-16T00:00:00.000Z",
        fetchImpl: fetchImpl as typeof fetch,
      });

      expect(status.status).toBe("ready");
      expect(status.checks.map((check) => check.name)).toEqual([
        "Python Brain root",
        "Gateway root",
        "Gateway status",
        "Live text chat",
        "Runtime self-test",
        "Electron heartbeat",
      ]);
      expect(readRuntimeLiveTestStatus(summaryPath).ok).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
