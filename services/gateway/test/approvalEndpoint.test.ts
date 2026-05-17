import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

describe("approval endpoints", () => {
  let server: Server | undefined;
  let tempRoot: string;
  let startGateway: typeof import("../src/server.js").startGateway;

  beforeAll(async () => {
    tempRoot = mkdtempSync(join(tmpdir(), "jarvis-approval-endpoint-"));
    process.env.JARVIS_DB_PATH = join(tempRoot, "jarvis.sqlite");
    ({ startGateway } = await import("../src/server.js"));
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
      server = undefined;
    }
  });

  it("approves the seeded screen timeline approval through the generic approval endpoint", async () => {
    server = startGateway(0);
    await onceListening(server);
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const approvalResponse = await fetch(`${baseUrl}/api/approvals/approval-001/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const approvalPayload = (await approvalResponse.json()) as {
      approval?: { id: string; category: string; target: string };
      memoryWrite?: { content: string; tags: string[] };
    };

    expect(approvalResponse.status).toBe(200);
    expect(approvalPayload.approval).toMatchObject({
      id: "approval-001",
      category: "sensor-capture",
      target: "screen timeline",
    });
    expect(approvalPayload.memoryWrite?.content).toContain("Approval approved");
    expect(approvalPayload.memoryWrite?.tags).toEqual(expect.arrayContaining(["approval", "approved", "sensor-capture"]));

    const approvals = (await fetch(`${baseUrl}/api/approvals`).then((response) => response.json())) as {
      approvals: Array<{ id: string }>;
    };
    expect(approvals.approvals.some((approval) => approval.id === "approval-001")).toBe(false);

    const status = (await fetch(`${baseUrl}/api/status`).then((response) => response.json())) as {
      connectors: Array<{ id: string; enabled: boolean }>;
    };
    expect(status.connectors.find((connector) => connector.id === "screen")?.enabled).toBe(true);
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
