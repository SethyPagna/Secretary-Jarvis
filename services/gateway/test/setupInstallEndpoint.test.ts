import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

describe("setup install plan endpoints", () => {
  let server: Server | undefined;
  let tempRoot: string;
  let startGateway: typeof import("../src/server.js").startGateway;

  beforeAll(async () => {
    tempRoot = mkdtempSync(join(tmpdir(), "jarvis-setup-install-endpoint-"));
    process.env.JARVIS_DB_PATH = join(tempRoot, "jarvis.sqlite");
    ({ startGateway } = await import("../src/server.js"));
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
      server = undefined;
    }
  });

  it("serves install plans and stages dry-runs without execution", async () => {
    server = startGateway(0);
    await onceListening(server);
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const plansPayload = await fetch(`${baseUrl}/api/setup/install-plans`).then((response) => response.json()) as {
      manifest: { plans: Array<{ id: string; label: string }> };
    };
    const piper = plansPayload.manifest.plans.find((plan) => plan.id === "install-feature-piper");
    expect(piper?.label).toContain("Piper");

    const dryRunResponse = await fetch(`${baseUrl}/api/setup/install-plans/install-feature-piper/dry-run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "test" }),
    });
    const dryRunPayload = await dryRunResponse.json() as {
      dryRun: {
        executed: boolean;
        decision: { decision: string };
        notes: string[];
      };
    };

    expect(dryRunResponse.status).toBe(202);
    expect(dryRunPayload.dryRun.executed).toBe(false);
    expect(dryRunPayload.dryRun.decision.decision).toBe("requires_approval");
    expect(dryRunPayload.dryRun.notes.join(" ")).toContain("no installer was launched");
  });
});

function onceListening(server: Server): Promise<void> {
  return new Promise((resolve) => {
    if (server.listening) {
      resolve();
      return;
    }
    server.once("listening", () => resolve());
  });
}
