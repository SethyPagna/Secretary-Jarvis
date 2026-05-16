import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildRuntimeServicesStatus } from "../src/liveRuntime.js";

describe("live runtime service heartbeats", () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), "jarvis-live-runtime-"));
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("summarizes online, degraded, and offline local services", async () => {
    mkdirSync(tempRoot, { recursive: true });
    writeFileSync(join(tempRoot, "brain.pid"), "101");
    writeFileSync(join(tempRoot, "hud.pid"), "202");

    const status = await buildRuntimeServicesStatus({
      runtimeRoot: tempRoot,
      now: () => "2026-05-16T00:00:00.000Z",
      pidAlive: (pid) => pid === 101 || pid === 202,
      httpProbe: async (url) => url.includes("brain"),
      services: [
        { id: "brain", label: "Brain", pidFile: "brain.pid", url: "http://brain/health" },
        { id: "hud-renderer", label: "HUD", pidFile: "hud.pid", url: "http://hud/" },
        { id: "ollama", label: "Ollama", pidFile: "ollama.pid", url: "http://ollama/api/tags" },
      ],
    });

    expect(status.summary).toMatchObject({ online: 1, degraded: 1, offline: 1, unknown: 0 });
    expect(status.services.map((service) => service.status)).toEqual(["online", "degraded", "offline"]);
    expect(status.note).toContain("Read-only");
  });

  it("treats non-HTTP desktop app processes as online when their PID is alive", async () => {
    mkdirSync(tempRoot, { recursive: true });
    writeFileSync(join(tempRoot, "electron.pid"), "303");

    const status = await buildRuntimeServicesStatus({
      runtimeRoot: tempRoot,
      now: () => "2026-05-16T00:00:00.000Z",
      pidAlive: (pid) => pid === 303,
      services: [
        { id: "electron-hud", label: "Electron HUD", pidFile: "electron.pid" },
      ],
    });

    expect(status.summary).toMatchObject({ online: 1, degraded: 0, offline: 0, unknown: 0 });
    expect(status.services[0]).toMatchObject({
      status: "online",
      detail: "Process heartbeat is alive.",
    });
  });
});
